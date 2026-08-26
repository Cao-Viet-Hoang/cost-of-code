# Cost of Code — Claude project guide

This file is loaded automatically by Claude Code. Keep it short, accurate, and
in English. When project conventions, scripts, or layout change, update this
file in the **same commit** as the change.

---

## What this project is

A local-first VSCode extension that visualizes token usage and estimated cost
for both **Claude Code** and **OpenAI Codex Desktop**. Three pieces:

- `collector/` — zero-dependency Node.js OTLP/HTTP receiver for Claude. Writes
  raw payloads and normalized usage records as JSONL under
  `~/.claude/usage-tracker/`.
- `scripts/` — Windows (`*.ps1`) and Unix (`*.sh`, Linux + macOS) install /
  uninstall / status helpers, plus `import-projects-history.js` and
  `build-icon.js`.
- `src/` — VSCode extension (TypeScript). Registers commands, renders the
  dashboard webview, and bridges to the platform scripts. Includes a
  read-only Codex session reader (`src/codex/`) that parses
  `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` directly — Codex needs **no
  collector** because the Codex Desktop app writes its own session JSONLs.

No cloud, no account, no remote server. Privacy-safe by default — only token
counts, model id, request/session ids, estimated cost, and timing are stored.

## Tech stack

- TypeScript 5.9 / Node 20+ / VSCode 1.90+.
- `tsc` build (no bundler). Output → `out/`.
- ESLint 9 (flat config) with `typescript-eslint`.
- `vsce` for packaging.

## File layout

```
collector/        OTLP receiver (collector.js, normalizer.js, record-session.js)
scripts/          install / uninstall / status (.ps1 + .sh), build-icon, import
src/              VSCode extension TypeScript sources
  extension.ts        Command registration entry point
  DashboardPanel.ts   Webview panel (editor tab) with 6 tabs
  SidebarView.ts      Compact WebviewViewProvider shown in the Explorer
  usageReader.ts      JSONL aggregation (merges Claude + Codex into one stream)
  healthCheck.ts      Collector health probe
  exportService.ts    JSONL/CSV export
  installer.ts        Bridges commands to platform scripts
  paths.ts            ~/.claude/usage-tracker + ~/.codex/sessions path helpers
  pricing.ts          Per-model Claude pricing
  types.ts            Shared types
  codex/              Codex session-JSONL reader + pricing
    sessionReader.ts  Walks ~/.codex/sessions and emits UsageRecord
    pricing.ts        OpenAI list prices (overridable for Azure billing)
  webview/            Webview assets
media/            Icon source + generated icon
.claude/          Project-scoped Claude Code configuration (agents, skills, commands, settings)
```

## Build, lint, test, package

Use `npm` (locked to npm 11 via `packageManager`).

```sh
npm ci             # install deps
npm run compile    # tsc -p .
npm run lint       # eslint src --max-warnings=0
npm run check      # compile + lint (gate before commits)
npm run package    # vsce package → cost-of-code-<version>.vsix
```

On Windows there is `build.bat` (runs `npm ci`, `npm run check`, `vsce`).

The Extension Development Host is launched via `F5` in VSCode.

## Code conventions

**Language:** all code, identifiers, comments, log strings, commit messages,
and committed docs are in **English**. Conversational chat with the user can
be in any language; code artifacts cannot.

**TypeScript:**
- Strict mode is on (`strict`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
  `noUnusedLocals`). Do not weaken these flags.
- Module: `Node16`, target: `ES2022`.
- 2-space indentation, single quotes, **always semicolons** (ESLint enforced).
- `eqeqeq` (use `===` / `!==`), `curly` (always brace blocks),
  `no-throw-literal` (throw `Error` instances). ESLint will reject violations.
- Imports use `camelCase` or `PascalCase` only (ESLint
  `naming-convention` rule).
- Prefer named exports. Default exports only where the framework demands them.
- VSCode API is imported as `import * as vscode from 'vscode'`.
- Node built-ins are imported as `import * as os from 'os'` (namespace) or
  named imports — match the style of the file you are editing.

**Collector (`collector/*.js`):**
- Plain Node.js, **zero runtime dependencies**. Do not introduce npm deps for
  the collector — that is a hard constraint (it must be copy-able into
  `~/.claude/usage-tracker/bin/` and run anywhere with Node).
- CommonJS, not ESM (the rest of `~/.claude/usage-tracker/bin/` assumes
  `require`).

**Scripts (`scripts/*.ps1`, `scripts/*.sh`):**
- PowerShell scripts target Windows PowerShell 5.1+ and PowerShell 7.
- Bash scripts (`*.sh`) target both Linux and macOS. They detect the OS with
  `uname -s` and branch the autostart mechanism: launchd LaunchAgent
  (`com.claude.usage-tracker` in `~/Library/LaunchAgents`) on macOS, systemd
  user service (`claude-usage-tracker`) with a cron `@reboot` fallback on
  Linux. When you touch the autostart logic, update **both** branches.
- Keep `.ps1` and `.sh` behavior aligned — when you change one, check the
  other.

**Files:**
- Don't create new `*.md` documentation unless the user asks for it.
- Don't add emojis to code or committed files unless the user asks.
- Don't add comments that re-state what the code says — only comments that
  explain a non-obvious *why*.

## Things that look like bugs but aren't

- The configuration key prefix is `claudeUsageTracker.*` even though the
  display name is "Cost of Code" and we now also track Codex. This is
  intentional for backward compatibility with existing user settings — do not
  rename it without planning a migration.
- The extension publisher id is `cost-of-code` (kebab); the command category
  is `Cost of Code` (display). Both are correct.
- `~/.claude/settings.json` is **merged**, not overwritten, by the installer.
  Other keys in that file belong to the user — never clobber them.
- OTLP/JSON only (no protobuf). Setup forces
  `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`.
- Codex costs are labeled "est" because we price against OpenAI's public list
  rates; Codex via Azure deployments may differ. Users can override via the
  `claudeUsageTracker.codexPricing` setting.
- Codex's `input_tokens` *includes* `cached_input_tokens`. The reader
  subtracts the cached portion before pricing, then prices the cached portion
  at the cached rate — keep this split in mind when changing pricing logic.
- Codex `output_tokens` already includes `reasoning_output_tokens`; the
  reasoning count is stored separately for display only, not added on top.
- `src/webview/sidebar.ts` styles its *chrome* with `--vscode-*` theme
  variables instead of the dashboard's own HSL palette
  (`src/webview/styles.ts`) — the Explorer view has to blend into the side bar,
  the dashboard does not. Its *data marks* use three separate fixed palettes,
  each validated on its own because they never share a chart: the two tool hues
  (`--tool-claude` / `--tool-codex`, share bar), the three donut slots
  (`--slice-1..3`, top-model donut), and one accent (`--accent-mark`, trend
  line). Most are stepped per mode because no single step sits inside both
  the light and the dark lightness band; `--accent-mark` is the exception, one
  hex that clears both. Re-validate before changing any of them.
- The top-model donut shows at most **three** models plus an "Other" slice.
  A donut needs every *pair* of slices distinguishable at once (all-pairs, not
  just adjacent), and the validated categorical palette only clears that gate
  for three hues. `TOP_MODEL_COUNT` in `src/SidebarView.ts` and `SLICE_COLORS`
  in `src/webview/sidebar.ts` must stay in step, and the remainder must keep
  being folded into `otherModels` — drop it and the percentages on screen no
  longer sum to today's cost. The chart-beside-key layout is a plain
  `flex-wrap` on `.donut-wrap`, not a media or container query: the legend
  drops under the donut when the side bar is too narrow for both `flex-basis`
  values, and the same flex `gap` serves as the stacked spacing.
- The Explorer view **cannot** set its own height. `contributes.views[].initialSize`
  is honoured only when the view container belongs to the contributing
  extension; ours sits in the built-in `explorer` container, so VSCode drops the
  value and logs "tried to set the view size … but it was ignored because the
  view container does not belong to it". VSCode then sizes every expanded pane
  as `containerHeight * (weight || 20) / sum(weights)` — i.e. an even split with
  the Folders pane. The only lever is content height, so the sidebar is kept
  under **~470px** tall at typical widths (tight `--gap-section`, the tool share
  bar folded into the Today tile with no heading of its own, donut capped at
  104px). Measure before adding anything: `document.body.getBoundingClientRect().height`
  in the rendered preview. Giving the view a real default height would mean
  moving it into an extension-owned view container, which takes it out of the
  Explorer.
- The Today figure gets its emphasis from the **card** it sits on (`.tile`,
  a 5% foreground tint) plus size and full-strength ink — never from decoration
  on the figure itself. A tinted pill behind the delta and a shrunk-and-faded
  `$` were both tried and rejected by the user as noisy: the pill out-shouted
  the number it annotates, and the small `$` detached at the baseline. The delta
  is plain description-grey text with only its ▲/▼ carrying the direction
  colour. The card also replaces the hairline that used to sit under the tile
  (`.tile + .block` clears `border-top`) — two separators for one boundary.
- The donut carries **no** printed numbers — no total in the hole, no share in
  the key, only the model names. Cost and share live in the hover tooltip
  alone. That is a deliberate deviation from the usual "never gate values
  behind a tooltip" rule, made at the user's explicit request: the tile above
  already states today's total, and the side bar is too narrow to hold a
  second column of figures without truncating the model names. Keep the two
  flex bases (`.donut` / `.slices`) equal — the halves are meant to read as
  even now that the key holds names only.
- The sidebar's trend line and the Codex tool color are both green and cannot
  be told apart by hue alone (normal-vision ΔE ≈ 11 in dark mode). No green in
  the dark lightness band separates further from the Codex teal, so this is
  accepted: the two never appear in the same chart, and the Codex swatch always
  sits next to the word "Codex".
- The sidebar's status stamp renders `lastActivityAt` (newest usage across both
  tools), **not** `updatedAt`. `updatedAt` is stamped by the provider at read
  time and formatted in the same tick, so as a relative time it can only ever
  say "0s ago" — it looks like a freshness indicator while measuring nothing.
  The read time stays in the status tooltip instead. `lastActivityAt` is the
  newer of `health.lastUsageAt` (Claude) and `codexHealth.lastWriteAt` (Codex),
  both already computed during the same refresh, so it costs no extra scan.
  The stamp also carries its own 30s `setInterval` so it ages between payloads
  — required when `autoRefreshSeconds` is `0` and nothing else re-renders.
- `claudeUsageTracker.autoRefreshSeconds` is **one** setting driving **both**
  surfaces, read independently by `DashboardPanel` and `SidebarView`. The
  dashboard turns it into a 1s countdown with a pause/resume toggle
  (`src/webview/state.ts`); the sidebar bakes it into a single `setInterval`
  that posts `refresh` and shows no countdown, to save vertical space.
- The sidebar's trend line plots **today, hour by hour** — not a month — and it
  buckets on the **UTC** clock, because `FilterOptions.startDate/endDate` compare
  `timestamp.slice(0, 10)` and the whole extension's "today" is therefore a UTC
  day. That keeps the hours summing exactly back to the Today figure above them
  (`UsageReader.hourlyTimeline`), at the cost that in a non-UTC zone the axis
  starts at whatever local time UTC midnight is — 07:00 for UTC+7. Labels are
  localized (`fmtHour`), so the *instants* on screen are always correct. The axis
  stops at the hour in progress: the rest of the day is unknown, not zero.
  `hourlyTimeline()` is deliberately separate from `hourly()`, which folds every
  day onto one 24x7 grid for the dashboard heatmap and so cannot be plotted in
  order; it is also outside `snapshot()` because only the sidebar reads it.
- `hidden` is an `HTMLElement` property. Assigning `svgNode.hidden = false`
  silently does nothing, which is why the sidebar hides its donut by toggling
  the wrapping `<div class="donut-wrap">` and its sparkline via
  `style.display`, never the `<svg>` node's `hidden` property.
- The sidebar renders sub-cent costs as `<$0.01`, not `$0.0032`. Its numbers sit
  in a narrow right-aligned column, so `fmtCost` emits one fixed shape
  (`$0` / `<$0.01` / `$8.17` / `$420` / `$1.2K`); the exact value is in the
  hover title. The dashboard, which has the width, still shows full precision.
- The sidebar's custom CSS variables are declared on `body`, not `:root`. They
  derive from `--vscode-*` variables, which are inherited — a `:root`
  declaration can resolve before those exist and silently compute to empty.
- Codex records map onto Claude-shaped `UsageRecord` with
  `cache_read_tokens = cached_input_tokens` and `cache_creation_tokens = 0`.
  The Cache tab is Claude-specific because cache_creation has no Codex
  analogue.

## Common workflows

| You want to…                          | Do this                                                 |
| ------------------------------------- | ------------------------------------------------------- |
| Add a new dashboard command           | Register in `src/extension.ts` + declare in `package.json` `contributes.commands` |
| Change the Explorer sidebar view      | Update `src/SidebarView.ts` (provider + payload) and `src/webview/sidebar.ts` (CSS/markup/client JS); the view id `claudeUsageTracker.sidebar` is declared in `package.json` `contributes.views.explorer` and referenced by `contributes.menus.view/title` |
| Add a new config setting              | Declare in `package.json` `contributes.configuration` + read via `vscode.workspace.getConfiguration('claudeUsageTracker')` |
| Add a new usage field                 | Update normalizer in `collector/normalizer.js` and reader/types in `src/usageReader.ts` + `src/types.ts`. In `usageReader.ts` the aggregation logic is duplicated between `snapshot()` (the production path) and the per-metric methods (`daily`/`sessions`/… kept as the test oracle) — update **both** or the equivalence test in `src/test/usageReader.test.ts` fails |
| Add a new Codex model price           | Update `src/codex/pricing.ts` `DEFAULT_TABLE` (more specific prefixes first) |
| Change Codex parsing                  | Update `src/codex/sessionReader.ts`; keep token-mapping invariant (see "Things that look like bugs") |
| Change install behavior               | Update **both** `scripts/install.ps1` and `scripts/install.sh`, then `src/installer.ts` if the bridge signature changed |
| Ship a release                        | Bump `version` in `package.json` + `CHANGELOG.md`, then `npm run package` |

## Where Claude artifacts live

- `.claude/agents/`   sub-agents (code review, packaging, etc.)
- `.claude/skills/`   skills (English check, config sync, etc.)
- `.claude/commands/` slash commands (`/check`, `/package`, …)
- `.claude/settings.json` project-scoped permissions and env

**Style for `.claude/` files:** frontmatter (`name`, `description`,
`model` / `tools` where applicable), Markdown body, English only, no emojis,
no trailing whitespace. Match the shape of existing files when adding new
ones.

## Update protocol

Whenever a change lands that would make this file inaccurate, update it in
the **same commit** as the code change. That includes — non-exhaustive:

- A new feature (new VSCode command, new dashboard tab, new collector field,
  new install behavior, new platform support).
- A removed or renamed feature, command, setting, or file.
- A new / renamed / removed `package.json` script.
- A new top-level directory under the repo root or under `src/` / `collector/`
  / `scripts/`.
- Changes to `tsconfig.json` strict flags, ESLint rules, or `engines`.
- Changes to how the installer writes `~/.claude/settings.json`.
- Anything else that contradicts a fact stated above (file layout, code
  conventions, "things that look like bugs but aren't", common workflows).

When updating, sweep **all** of these in the same change:

1. `CLAUDE.md` (this file) — sections affected.
2. `.claude/agents/*` — any agent whose prompt references the changed thing.
3. `.claude/commands/*` — any slash command that runs the changed script.
4. `.claude/skills/*` — any skill that references the changed thing.
5. `.claude/settings.json` — permissions for new commands.
6. `README.md` / `CHANGELOG.md` — user-facing entries.

The `/sync-config` slash command runs the `sync-claude-config` skill which
automates the grep-and-fix sweep — use it after a non-trivial change.

A stale `CLAUDE.md` is worse than no `CLAUDE.md` — it wastes tokens and
misleads. If you notice drift, fix it.
