---
description: Review the current branch's changes via the code-reviewer sub-agent.
---

Invoke the `code-reviewer` sub-agent. It will diff against `main` (or `HEAD`
if there is no divergence) and produce a Blockers / Suggestions / Looks good
report keyed to file:line.

Return the agent's report verbatim.
