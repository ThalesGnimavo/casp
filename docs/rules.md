# CASP verification rules

Every finding `casp check` emits carries a stable **rule code** of the form
`CASP-<AREA>-<NNN>`. The code is the public, versioned identifier — safe to
reference in docs, CI dashboards, and issue trackers. Internal finding ids may be
refactored freely; **codes are a compatibility surface and change only through an
explicit deprecation, never silently.**

The authoritative, always-current definitions live in the binary:

```bash
casp rules                 # list every rule (add --json for data)
casp explain CASP-GIT-001  # one rule: what it verifies, evidence, remediation
```

`casp check --json` includes the `rule` code on every finding, and
`casp check` prints it next to each WARN/FAIL so you can jump straight to
`casp explain <CODE>`.

A rule states **what** is verified and against **which evidence** — deliberately
narrow. CASP verifies recorded state claims against repository evidence; it does
not verify that your code is correct, deployed, or bug-free. See
[what-casp-proves.md](./what-casp-proves.md).

## The catalogue

> Snapshot for the current release. `casp rules` is the source of truth.

| Code | Area | Title |
|---|---|---|
| `CASP-STATE-001` | STATE | state.json present and valid JSON |
| `CASP-STATE-002` | STATE | Required state keys present |
| `CASP-STATE-003` | STATE | phases_shipped has no duplicates |
| `CASP-PROMPT-001` | PROMPT | next_prompt file exists |
| `CASP-PROMPT-002` | PROMPT | next_prompt has frontmatter |
| `CASP-PROMPT-003` | PROMPT | next_prompt is not already shipped |
| `CASP-PROMPT-004` | PROMPT | Session prompts have parseable frontmatter |
| `CASP-PROMPT-005` | PROMPT | Shipped prompts have a resolvable session_log |
| `CASP-PROMPT-006` | PROMPT | Prompt status values are canonical |
| `CASP-SESSION-001` | SESSION | last_session_id maps to a session log |
| `CASP-SESSION-002` | SESSION | Shipped history directories exist |
| `CASP-GIT-001` | GIT | last_commit is consistent with git history |
| `CASP-MIGRATION-001` | MIGRATION | Claimed migrations have a directory to verify against |
| `CASP-MIGRATION-002` | MIGRATION | migrations_applied matches the migrations directory |
| `CASP-MIGRATION-003` | MIGRATION | Untracked migrations on disk (advisory) |
| `CASP-WORKTREE-001` | WORKTREE | State surface is committed |

## Severity

- **fail** — blocks the push (`casp check` exits 1). A recorded claim contradicts
  git evidence, or a claim cannot be verified at all.
- **warn** — advisory, never blocks (exit stays 0). A likely mistake or an
  expected pre-first-session placeholder (`pending`).
- **pass** — the claim was checked and holds.

The exit-code contract (clean → 0, drift → 1) is covered by the test suite, so
the CI gate stays real.
