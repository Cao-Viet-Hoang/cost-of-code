/**
 * Pricing table (USD per 1M tokens) used to estimate cache savings.
 *
 * IMPORTANT: these are list-price *estimates* used only for the "$ saved by
 * cache" KPI on the dashboard. They are NOT used to compute the per-record
 * cost shown elsewhere — that comes from `estimated_cost_usd` emitted by
 * Claude Code itself. Users can override the table via the
 * `claudeUsageTracker.pricing` setting if Anthropic prices change.
 */
export interface ModelPricing {
  /** USD per 1,000,000 input tokens. */
  input: number;
  /** USD per 1,000,000 output tokens. */
  output: number;
  /** USD per 1,000,000 cache-read tokens (typically ~10% of input). */
  cacheRead: number;
  /** USD per 1,000,000 cache-creation tokens (typically ~125% of input). */
  cacheCreate: number;
}

/**
 * Match a model id against pricing entries. Keys are matched as
 * case-insensitive substrings, so "claude-3-5-sonnet-20241022" matches
 * "sonnet" if no more specific entry wins.
 *
 * Order matters: more specific keys must come before generic ones.
 */
const DEFAULT_TABLE: Array<[string, ModelPricing]> = [
  // Claude 4.x family (current as of 2025-2026)
  ['claude-opus-4',     { input: 15,   output: 75,   cacheRead: 1.5,   cacheCreate: 18.75 }],
  ['claude-sonnet-4',   { input: 3,    output: 15,   cacheRead: 0.3,   cacheCreate: 3.75 }],
  ['claude-haiku-4',    { input: 0.8,  output: 4,    cacheRead: 0.08,  cacheCreate: 1 }],
  // Claude 3.x family
  ['claude-3-5-haiku',  { input: 0.8,  output: 4,    cacheRead: 0.08,  cacheCreate: 1 }],
  ['claude-3-5-sonnet', { input: 3,    output: 15,   cacheRead: 0.3,   cacheCreate: 3.75 }],
  ['claude-3-7-sonnet', { input: 3,    output: 15,   cacheRead: 0.3,   cacheCreate: 3.75 }],
  ['claude-3-opus',     { input: 15,   output: 75,   cacheRead: 1.5,   cacheCreate: 18.75 }],
  ['claude-3-sonnet',   { input: 3,    output: 15,   cacheRead: 0.3,   cacheCreate: 3.75 }],
  ['claude-3-haiku',    { input: 0.25, output: 1.25, cacheRead: 0.03,  cacheCreate: 0.3 }],
  // Generic fallbacks
  ['opus',              { input: 15,   output: 75,   cacheRead: 1.5,   cacheCreate: 18.75 }],
  ['sonnet',            { input: 3,    output: 15,   cacheRead: 0.3,   cacheCreate: 3.75 }],
  ['haiku',             { input: 0.8,  output: 4,    cacheRead: 0.08,  cacheCreate: 1 }],
];

const GENERIC_FALLBACK: ModelPricing = {
  input: 3, output: 15, cacheRead: 0.3, cacheCreate: 3.75,
};

export type PricingOverrides = Record<string, Partial<ModelPricing>>;

export function priceFor(model: string | undefined, overrides?: PricingOverrides): ModelPricing {
  const m = (model || '').toLowerCase();
  if (!m) { return GENERIC_FALLBACK; }

  if (overrides) {
    for (const [key, partial] of Object.entries(overrides)) {
      if (m.includes(key.toLowerCase())) {
        const base = matchDefault(m) ?? GENERIC_FALLBACK;
        return { ...base, ...partial };
      }
    }
  }
  return matchDefault(m) ?? GENERIC_FALLBACK;
}

function matchDefault(modelLower: string): ModelPricing | null {
  for (const [key, p] of DEFAULT_TABLE) {
    if (modelLower.includes(key)) { return p; }
  }
  return null;
}

/**
 * USD saved by serving N tokens from cache instead of as fresh input.
 */
export function savedByCacheRead(model: string | undefined, cacheReadTokens: number, overrides?: PricingOverrides): number {
  if (!cacheReadTokens || cacheReadTokens <= 0) { return 0; }
  const p = priceFor(model, overrides);
  const saved = (p.input - p.cacheRead) * cacheReadTokens / 1_000_000;
  return Math.max(0, saved);
}

/**
 * Hypothetical cost if every cache_read token had been a fresh input.
 */
export function hypotheticalInputCost(model: string | undefined, tokens: number, overrides?: PricingOverrides): number {
  if (!tokens || tokens <= 0) { return 0; }
  return priceFor(model, overrides).input * tokens / 1_000_000;
}
