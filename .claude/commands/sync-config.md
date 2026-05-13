---
description: Detect and fix drift between project state and .claude/ + CLAUDE.md.
---

Invoke the `sync-claude-config` skill. Walk the procedure: inventory the
recent change, grep for stale references, update each hit, cross-check agents
and slash commands, and report drift fixed (or "no drift detected").

If $ARGUMENTS describes the change ("renamed `npm run package` to
`npm run build`"), use that as the inventory step. Otherwise infer from
recent `git diff`.
