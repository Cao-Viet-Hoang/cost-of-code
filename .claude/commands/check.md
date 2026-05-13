---
description: Run the project gate (tsc + eslint) and report failures with file:line.
---

Run `npm run check` (which is `tsc -p .` followed by `eslint src --max-warnings=0`).

If it succeeds, reply with a single line: `check: ok`.

If it fails, parse the first error from the output, cite `file:line: message`,
and suggest the smallest fix that would unblock. Do not run anything else.
