# Cost of Code — Claude project guide

This file is loaded automatically by Claude Code. Keep it short, accurate, and
in English. When project conventions, scripts, or layout change, update this
file in the **same commit** as the change.

---

## What this project is

A local-first VSCode extension that visualizes Claude Code token usage and
estimated cost. Three pieces:

- `collector/` — zero-dependency Node.js OTLP/HTTP receiver. Writes raw
  payloads and normalized usage records as JSONL under
  `~/.claude/usage-tracker/`.
- `scripts/` — Windows (`*.ps1`) and Unix (`*.sh`, Linux + macOS) install /
  uninstall / status helpers, plus `import-projects-history.js` and
  `build-icon.js`.
- `src/` — VSCode extension (TypeScript). Registers commands, renders the
  dashboard webview, and bridges to the platform scripts.

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
  usageReader.ts      JSONL aggregation
  healthCheck.ts      Collector health probe
  exportService.ts    JSONL/CSV export
  installer.ts        Bridges commands to platform scripts
  paths.ts            ~/.claude/usage-tracker path helpers
  pricing.ts          Per-model pricing
  types.ts            Shared types
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
  display name is "Cost of Code". This is intentional for backward
  compatibility with existing user settings — do not rename it without
  planning a migration.
- The extension publisher id is `cost-of-code` (kebab); the command category
  is `Cost of Code` (display). Both are correct.
- `~/.claude/settings.json` is **merged**, not overwritten, by the installer.
  Other keys in that file belong to the user — never clobber them.
- OTLP/JSON only (no protobuf). Setup forces
  `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`.
- `src/webview/sidebar.ts` styles chrome with `--vscode-*` theme variables
  (unlike the dashboard's own HSL palette in `src/webview/styles.ts`) and uses
  two fixed, mode-validated data-mark palettes: `--slice-1..3` for the
  top-model donut, `--accent-mark` for the trend line. `TOP_MODEL_COUNT`
  (`src/SidebarView.ts`) and `SLICE_COLORS` (`src/webview/sidebar.ts`) must
  stay in step, and the remainder must keep being folded into `otherModels` —
  drop either and the on-screen percentages stop summing to today's cost. The
  donut prints no numbers on the chart itself; cost/share live in the hover
  tooltip only, so keep the `.donut`/`.slices` flex-basis equal.
- The Explorer view **cannot** set its own height — `contributes.views[].initialSize`
  is ignored in the built-in `explorer` container, which instead splits height
  evenly by pane weight. The only lever is content height, so the sidebar is
  kept under **~470px** tall at typical widths; measure with
  `document.body.getBoundingClientRect().height` before adding content.
- The sidebar's status stamp renders `lastActivityAt` (mirrors
  `health.lastUsageAt`), never `updatedAt` — `updatedAt` is stamped and
  formatted in the same tick, so as a relative time it would always read "0s
  ago"; it stays in the status tooltip instead. The stamp has its own 30s
  `setInterval` so it keeps aging when `autoRefreshSeconds` is `0`.
- `claudeUsageTracker.autoRefreshSeconds` drives both `DashboardPanel` (1s
  countdown with pause/resume, `src/webview/state.ts`) and `SidebarView`
  (a plain interval, no countdown) — each reads it independently, so keep both
  in sync if its meaning changes.
- The sidebar's trend line buckets on the **UTC** clock
  (`UsageReader.hourlyTimeline`), matching how `FilterOptions.startDate/endDate`
  compare `timestamp.slice(0, 10)` — so the hours sum exactly back to the
  Today figure, at the cost that the axis starts at UTC-midnight in local time
  (labels are localized via `fmtHour`, so instants stay correct).
  `hourlyTimeline()` is deliberately separate from `hourly()` (a 24x7 grid,
  unordered) and outside `snapshot()` because only the sidebar reads it.
- `hidden` is an `HTMLElement` property; assigning `svgNode.hidden = false`
  silently does nothing. The sidebar hides its donut by toggling the wrapping
  `<div class="donut-wrap">` and its sparkline via `style.display`, never the
  `<svg>` node's `hidden` property.
- The sidebar shows sub-cent costs as `<$0.01` (fixed-shape `fmtCost`), unlike
  the dashboard's full precision — the exact value is in the hover title.
- The sidebar's custom CSS variables are declared on `body`, not `:root` —
  they derive from `--vscode-*` variables, which are inherited, so a `:root`
  declaration could resolve before those exist and silently compute to empty.

## Common workflows

| You want to…                          | Do this                                                 |
| ------------------------------------- | ------------------------------------------------------- |
| Add a new dashboard command           | Register in `src/extension.ts` + declare in `package.json` `contributes.commands` |
| Change the Explorer sidebar view      | Update `src/SidebarView.ts` (provider + payload) and `src/webview/sidebar.ts` (CSS/markup/client JS); the view id `claudeUsageTracker.sidebar` is declared in `package.json` `contributes.views.explorer` and referenced by `contributes.menus.view/title` |
| Add a new config setting              | Declare in `package.json` `contributes.configuration` + read via `vscode.workspace.getConfiguration('claudeUsageTracker')` |
| Add a new usage field                 | Update normalizer in `collector/normalizer.js` and reader/types in `src/usageReader.ts` + `src/types.ts`. In `usageReader.ts` the aggregation logic is duplicated between `snapshot()` (the production path) and the per-metric methods (`daily`/`sessions`/… kept as the test oracle) — update **both** or the equivalence test in `src/test/usageReader.test.ts` fails |
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
