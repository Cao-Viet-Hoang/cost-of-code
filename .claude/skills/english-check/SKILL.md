---
name: english-check
description: Scan staged or recently-changed code, comments, log strings, and committed Markdown for non-English content. Use before commits and PRs.
---

# english-check

All code artifacts in this repo must be in English: code, identifiers,
comments, log/error strings, commit messages, and Markdown under `.claude/`,
`CLAUDE.md`, `README.md`, `CHANGELOG.md`. Chat with the user can be in any
language; checked-in text cannot.

## What to scan

By default, scan the diff for the current change. Use whichever scope fits:

- Pending edits before commit: `git diff` + `git diff --staged`
- A branch vs `main`: `git diff main...HEAD`
- A single file: `git diff -- <path>` or read the file

Restrict to text the user might check in:

- `src/**/*.ts`
- `collector/**/*.js`
- `scripts/**/*.{ps1,sh}`
- `*.md` at the repo root and under `.claude/`
- `package.json` `description` and `displayName` fields

Skip: `out/`, `node_modules/`, lockfiles, `*.vsix`, `media/` binaries.

## How to detect non-English

Use Grep with a Unicode range that matches non-ASCII letters and common
Vietnamese diacritics:

```
[À-ỹ]
```

Run as a Grep across the scoped files. Report each hit with `file:line` and
the offending substring.

Also flag, even if ASCII:

- Strings that are clearly transliterated Vietnamese (e.g. `loi`, `khong`,
  `dang chay`) appearing as user-facing labels.
- Mixed-language comments (`// fix loi parse`).

## What to do with hits

For each hit:

1. Decide whether the text is user-facing (UI label, log line, error message,
   doc) or internal (variable name, file name). Both need to be English, but
   the suggested translation differs.
2. Propose a short English replacement. Prefer terminology already used
   elsewhere in the file.
3. Apply the edit if the user has asked you to fix; otherwise list them in a
   report and ask before editing.

## Report format

```
## English check — <scope>

Found N non-English strings:

- <file:line> — "<offending text>" — suggested: "<english>"
- ...

(Or: "No non-English strings detected.")
```

## Don'ts

- Don't rewrite text that is already English just to "improve" it. This skill
  is about language compliance, not style polishing.
- Don't translate user data, JSONL payloads, or sample fixtures — only
  source / docs.
- Don't touch external dependency code under `node_modules/`.
