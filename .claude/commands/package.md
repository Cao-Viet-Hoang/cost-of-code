---
description: Compile, lint, and package the extension into a .vsix via the extension-packager sub-agent.
---

Invoke the `extension-packager` sub-agent. Pass through any extra context the
user provided in this turn (e.g. "skip lint", "use vsce 3.9.1") — but do not
make those substitutions yourself; let the agent decide.

Return the agent's report verbatim. Do not add commentary unless the user
asks a follow-up.
