---
status: shipped
session_id: 26-06-17-002-0-6-0-bundle
session_log: session-logs/26-06-17-002-0-6-0-bundle.md
drafted_at: 2026-06-10
next_after: PHASE-STATUS-JSON
---

# Session — verify-and-diff : `casp verify <commit>` + `casp state diff`

> **Status : QUEUED.** Validated Tier-2. Makes "git log is your compliance
> trail" an inspectable feature.
>
> **Goal.** `casp state diff [A] [B]` — how state.json evolved between two
> commits (phase advanced, next_prompt changed, migrations added), from
> `git show A:casp/state.json`. `casp verify <commit>` — run the validator
> against a temporary worktree of that commit, report, clean up.

**Project root.** `/Users/juste/ZeroSuite/casp-sh/casp-core`
**Expected size.** Half-day. No schema change. Both read-only.

## MUST HAVE

1. `state diff`: structured field-level diff, human + `--json`.
2. `verify`: `git worktree add` (temp dir) → run check with cwd there → propagate exit code → ALWAYS remove the worktree (try/finally).
3. Tests for both, including verify on a historical drifted commit → exit 1.

## DO NOT
- Never mutate the user's worktree or index; never leave temp worktrees behind.
