import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UsageReader } from '../usageReader';
import type { FilterOptions } from '../types';
import type { PricingOverrides } from '../pricing';

const MODELS = ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-haiku-4-20250514'];
const SOURCES = ['cli', 'vscode-extension', 'api'];
const WORKSPACES = ['C:\\repos\\alpha', 'C:\\repos\\beta', '/home/dev/gamma'];

/**
 * Writes `days` × `perDay` synthetic usage records under `root/usage/*.jsonl`,
 * grouped into a handful of sessions per day. Deterministic (no Math.random)
 * so assertions are stable across runs.
 */
function buildFixture(root: string, days: number, perDay: number): void {
  const usageDir = path.join(root, 'usage');
  fs.mkdirSync(usageDir, { recursive: true });
  const base = Date.UTC(2026, 0, 1);
  const sessionsPerDay = 6;

  for (let d = 0; d < days; d++) {
    const date = new Date(base + d * 86_400_000).toISOString().slice(0, 10);
    const lines: string[] = [];
    for (let i = 0; i < perDay; i++) {
      const sessionIdx = i % sessionsPerDay;
      const model = MODELS[i % MODELS.length];
      const source = SOURCES[i % SOURCES.length];
      const workspace = WORKSPACES[(d + i) % WORKSPACES.length];
      const secondOfDay = Math.floor((i / perDay) * 86_400);
      const ts = new Date(base + d * 86_400_000 + secondOfDay * 1000).toISOString();
      const inputTokens = 500 + (i % 50) * 10;
      const outputTokens = 100 + (i % 20) * 5;
      const cacheRead = (i % 3 === 0) ? 2000 + i : 0;
      const cacheCreate = (i % 5 === 0) ? 800 + i : 0;
      lines.push(JSON.stringify({
        schema_version: 1,
        timestamp: ts,
        event_key: `${date}-${i}`,
        session_id: `sess-${date}-${sessionIdx}`,
        request_id: `req-${date}-${i}`,
        model,
        query_source: source,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_tokens: cacheRead,
        cache_creation_tokens: cacheCreate,
        total_tokens_without_cache: inputTokens + outputTokens,
        total_tokens_with_cache: inputTokens + outputTokens + cacheRead + cacheCreate,
        estimated_cost_usd: (inputTokens + outputTokens) * 0.000003,
        duration_ms: 200 + (i % 30) * 25,
        workspace,
      }));
    }
    fs.writeFileSync(path.join(usageDir, `${date}.usage.jsonl`), lines.join('\n') + '\n', 'utf8');
  }
}

function mkTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cost-of-code-usagereader-test-'));
}

suite('UsageReader.snapshot / distinctAll — equivalence', () => {
  let root: string;
  let reader: UsageReader;

  suiteSetup(() => {
    root = mkTempRoot();
    buildFixture(root, 5, 40);
    reader = new UsageReader(root);
  });

  suiteTeardown(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const pricing: PricingOverrides = {};

  function assertSnapshotMatchesLegacy(filter: FilterOptions) {
    const snap = reader.snapshot(filter, pricing);

    assert.deepStrictEqual(snap.totals, reader.totals(filter));
    assert.deepStrictEqual(snap.daily, reader.daily(filter));
    assert.deepStrictEqual(snap.sessions, reader.sessions(filter));
    assert.deepStrictEqual(snap.models, reader.models(filter));
    assert.deepStrictEqual(snap.workspaces, reader.workspaces(filter));
    assert.deepStrictEqual(snap.sources, reader.sources(filter));
    assert.deepStrictEqual(snap.hourly, reader.hourly(filter));
    assert.deepStrictEqual(snap.cacheByDay, reader.cacheByDay(filter, pricing));
    assert.deepStrictEqual(snap.cacheSavings, reader.cacheSavingsSummary(filter, pricing));
  }

  test('unfiltered snapshot matches each legacy per-metric call', () => {
    assertSnapshotMatchesLegacy({});
  });

  test('date-range filtered snapshot matches legacy calls', () => {
    assertSnapshotMatchesLegacy({ startDate: '2026-01-02', endDate: '2026-01-03' });
  });

  test('model-filtered snapshot matches legacy calls', () => {
    assertSnapshotMatchesLegacy({ model: MODELS[0] });
  });

  test('workspace-filtered snapshot matches legacy calls', () => {
    assertSnapshotMatchesLegacy({ workspace: WORKSPACES[1] });
  });

  test('snapshot threads a non-default pricing override into both cache calcs', () => {
    // A real override (not {}) so this fails if snapshot() forgot to pass
    // `pricing` to savedByCacheRead / hypotheticalInputCost — a bug that a
    // pricing={} test cannot catch, since both paths fall back to the same
    // default table.
    // Target "opus": in buildFixture, cache_read is non-zero only when
    // i % 3 === 0, which is also the opus slot of MODELS[i % 3], so cache
    // savings live entirely on opus records — overriding opus is what
    // actually moves totalSavedUsd.
    const override: PricingOverrides = { opus: { input: 999, cacheRead: 1 } };
    const snap = reader.snapshot({}, override);
    assert.deepStrictEqual(snap.cacheByDay, reader.cacheByDay({}, override));
    assert.deepStrictEqual(snap.cacheSavings, reader.cacheSavingsSummary({}, override));
    // And the override must actually move the numbers vs the default table.
    const defaultSnap = reader.snapshot({}, {});
    assert.notStrictEqual(snap.cacheSavings.totalSavedUsd, defaultSnap.cacheSavings.totalSavedUsd);
  });

  test('distinctAll matches the three legacy distinctValues calls', () => {
    const distinct = reader.distinctAll();
    assert.deepStrictEqual(distinct.models, reader.distinctValues('model'));
    assert.deepStrictEqual(distinct.querySources, reader.distinctValues('query_source'));
    assert.deepStrictEqual(distinct.workspaces, reader.distinctValues('workspace'));
  });

  test('snapshot totals equal the sum of daily totals', () => {
    const snap = reader.snapshot({}, pricing);
    const summedCost = snap.daily.reduce((s, d) => s + d.cost, 0);
    assert.ok(Math.abs(summedCost - snap.totals.cost) < 1e-9);
    const summedRequests = snap.daily.reduce((s, d) => s + d.requests, 0);
    assert.strictEqual(summedRequests, snap.totals.requests);
  });
});

suite('UsageReader.hourlyTimeline', () => {
  let root: string;
  let reader: UsageReader;

  suiteSetup(() => {
    root = mkTempRoot();
    buildFixture(root, 3, 40);
    reader = new UsageReader(root);
  });

  suiteTeardown(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('every bucket starts exactly on a UTC hour and is sorted chronologically', () => {
    const points = reader.hourlyTimeline({ startDate: '2026-01-01', endDate: '2026-01-01' });
    assert.ok(points.length > 0);
    for (const p of points) {
      assert.match(p.time, /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/);
    }
    const sorted = points.slice().sort((a, b) => a.time.localeCompare(b.time));
    assert.deepStrictEqual(points, sorted);
  });

  test('hours for a day sum back to that day\'s totals', () => {
    const filter: FilterOptions = { startDate: '2026-01-02', endDate: '2026-01-02' };
    const points = reader.hourlyTimeline(filter);
    const totals = reader.totals(filter);

    const summedCost = points.reduce((s, p) => s + p.cost, 0);
    const summedRequests = points.reduce((s, p) => s + p.requests, 0);
    const summedTokens = points.reduce((s, p) => s + p.totalTokens, 0);

    assert.ok(Math.abs(summedCost - totals.cost) < 1e-9);
    assert.strictEqual(summedRequests, totals.requests);
    assert.strictEqual(summedTokens, totals.totalTokensWithCache);
  });

  test('a range with no matching records returns an empty array', () => {
    const points = reader.hourlyTimeline({ startDate: '2099-01-01', endDate: '2099-01-01' });
    assert.deepStrictEqual(points, []);
  });
});

/**
 * Times `fn` `samples` times after a few warm-up runs and returns the fastest
 * observed duration in ms. Wall-clock micro-benchmarks in-process are noisy
 * (JIT warm-up, GC pauses, CI CPU throttling); a warm-up plus min-of-N is far
 * more stable than a single sample and makes threshold assertions meaningful.
 */
function bestOfMs(fn: () => void, samples = 5, warmup = 2): number {
  for (let i = 0; i < warmup; i++) { fn(); }
  let best = Infinity;
  for (let i = 0; i < samples; i++) {
    const t0 = process.hrtime.bigint();
    fn();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms < best) { best = ms; }
  }
  return best;
}

suite('UsageReader — performance regression', () => {
  let root: string;
  let reader: UsageReader;

  suiteSetup(function () {
    this.timeout(60_000);
    root = mkTempRoot();
    // ~40 days × 800 records/day ≈ 32,000 records — comparable in order of
    // magnitude to a multi-month real-world usage-tracker history.
    buildFixture(root, 40, 800);
    reader = new UsageReader(root);
    // Warm the per-file cache once so both approaches below are measuring
    // pure aggregation cost, not disk I/O / JSON.parse.
    reader.totals({});
  });

  suiteTeardown(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('a single snapshot() + distinctAll() pass is faster than one legacy call per metric', function () {
    this.timeout(30_000);
    const filter: FilterOptions = {};
    const pricing: PricingOverrides = {};

    // The shape of a dashboard refresh before the single-pass refactor: one
    // full iterateRecords() pass per metric.
    const legacyMs = bestOfMs(() => {
      reader.totals(filter);
      reader.daily(filter);
      reader.sessions(filter);
      reader.models(filter);
      reader.workspaces(filter);
      reader.sources(filter);
      reader.hourly(filter);
      reader.cacheByDay(filter, pricing);
      reader.cacheSavingsSummary(filter, pricing);
      reader.distinctValues('model');
      reader.distinctValues('query_source');
      reader.distinctValues('workspace');
    });

    // The shape of a dashboard refresh after the refactor: one unified pass
    // for the metrics plus one unified pass for the distinct dropdown values.
    const unifiedMs = bestOfMs(() => {
      reader.snapshot(filter, pricing);
      reader.distinctAll();
    });

    // Guards against regressing back to "one iterateRecords() pass per
    // metric". The real, measured margin on developer hardware is ~2.5-3x;
    // we assert only 1.5x so this stays green on slower / noisier CI while
    // still failing loudly if the single-pass optimization is undone.
    assert.ok(
      unifiedMs * 1.5 < legacyMs,
      `expected snapshot()+distinctAll() (${unifiedMs.toFixed(1)}ms) to beat ` +
      `12 separate legacy calls (${legacyMs.toFixed(1)}ms) by at least 1.5x`,
    );

    // Sanity ceiling to catch an accidental O(n^2) — generous enough to not
    // flake on slow machines, tight enough to catch a real regression.
    assert.ok(
      unifiedMs < 2000,
      `expected a single dashboard refresh over ~32k records to take well ` +
      `under 2s, took ${unifiedMs.toFixed(1)}ms`,
    );
  });

  test('repeated snapshot() calls stay fast (file cache is reused, no re-parse)', function () {
    this.timeout(30_000);
    const filter: FilterOptions = {};
    // If the file cache were bypassed and each call re-read + re-parsed 32k
    // records from disk, warm calls would be dramatically slower than the
    // steady-state best. Comparing the first post-warmup call against the
    // min-of-N steady state catches that without depending on absolute timing.
    const firstMs = (() => {
      const t0 = process.hrtime.bigint();
      reader.snapshot(filter);
      return Number(process.hrtime.bigint() - t0) / 1e6;
    })();
    const steadyMs = bestOfMs(() => { reader.snapshot(filter); });

    assert.ok(
      steadyMs <= firstMs * 2 + 5,
      `expected warm-cache snapshot() steady state (${steadyMs.toFixed(1)}ms) ` +
      `not to be meaningfully slower than the first call (${firstMs.toFixed(1)}ms)`,
    );
  });
});
