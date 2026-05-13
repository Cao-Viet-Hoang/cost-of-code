---
name: sync-claude-config
description: Detect and fix drift between project state (package.json, scripts, layout) and the .claude/ + CLAUDE.md configuration. Use after renaming scripts, adding directories, changing commands, or touching tsconfig/eslint.
---

# sync-claude-config

The goal of this project's `.claude/` setup is to save tokens by giving Claude
accurate context up front. Stale config destroys that benefit and actively
misleads. This skill walks through finding and fixing drift.

## When to invoke

Whenever you (or the user) change any of:

- `package.json` — `scripts`, `contributes.commands`, `contributes.configuration`,
  `engines`, dependencies, version
- `tsconfig.json` or `eslint.config.mjs` rules
- File / directory layout under `src/`, `collector/`, `scripts/`, `media/`
- A top-level workflow (build, lint, package, release)
- `~/.claude/settings.json` write behavior in the installer

## Procedure

1. **Inventory the change.** State in one sentence what shifted and what
   files it affected.

2. **Grep for stale references.** For each renamed or removed identifier,
   run a Grep across:
   - `CLAUDE.md`
   - `.claude/`
   - `README.md`
   - `CHANGELOG.md`

   Example: if `npm run package` was renamed to `npm run build`, search for
   `npm run package` everywhere in the four locations above.

3. **Update each hit.** Apply minimal edits — do not rewrite sections that
   weren't affected. Match the surrounding style (heading depth, tone, code
   fence language).

4. **Cross-check the agents.**
   - `.claude/agents/code-reviewer.md` — does it still reference real lint
     rules / tsconfig flags?
   - `.claude/agents/extension-packager.md` — does the build pipeline it
     describes still match `package.json`?

5. **Cross-check the slash commands.** Every `.claude/commands/*.md` that
   invokes a script must run a script that still exists.

6. **Cross-check `.claude/settings.json`.** New script in `package.json`?
   Consider adding `Bash(npm run <name>)` to `permissions.allow`.

7. **Report.** One short paragraph per file changed, naming the drift you
   fixed. If you found no drift, say "no drift detected" — do not invent
   busywork.

## Style invariants for `.claude/` files

When editing, keep these consistent across the directory:

- **Frontmatter:** YAML between `---` markers. Required keys:
  - Agents: `name`, `description`. Optional: `tools`, `model`.
  - Skills: `name`, `description`.
  - Slash commands: `description`. Optional: `argument-hint`.
- **Language:** English only.
- **No emojis.**
- **Headings:** start at `#` for the file title, `##` for sections.
- **Code fences:** language-tagged (`sh`, `ts`, `json`, `ps1`).
- **No trailing whitespace; final newline at EOF.**
- **Tone:** terse, imperative, present tense. Match the existing files in
  this directory — read one before writing a new one.

## Don'ts

- Don't add documentation that just paraphrases `package.json` or the README.
  Link / reference instead.
- Don't preserve historical detail "in case it's useful". The point of this
  config is to be short and current.
- Don't commit Claude config changes mixed into an unrelated PR — but a config
  update **alongside** the code change that caused the drift is correct.
