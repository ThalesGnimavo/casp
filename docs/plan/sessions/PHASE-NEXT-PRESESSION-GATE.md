---
status: shipped
session_id: 26-06-17-002-0-6-0-bundle
session_log: session-logs/26-06-17-002-0-6-0-bundle.md
drafted_at: 2026-06-10
next_after: 26-06-17-001-install-hook
---

# Session — next-gate : pre-session gate on `casp next`

> **Status : QUEUED.** Validated Tier-1 #2. Closes the start boundary
> symmetrically with the push boundary — what makes harness auto-advance safe.
>
> **Goal.** `casp next` runs the validator before printing and **refuses on
> drift** (non-zero exit, drift summary on stderr, prompt NOT printed).
> `--no-check` is the explicit escape hatch.
>
> **BEHAVIOR CHANGE ⇒ minor version bump + prominent CHANGELOG warning.**

**Project root.** `/Users/juste/ZeroSuite/casp-sh/casp-core`
**Expected size.** 1-2 h. No schema change.

## MUST HAVE

1. `src/next.ts` — run the check (reuse `runCheck` logic refactored into a callable that returns findings instead of exiting; do NOT shell out to self). On FAIL findings: print drift summary to stderr, exit 1, no prompt on stdout. On clean/warn: print prompt as today.
2. `--no-check` flag restores current behavior; `--json` composes if cheap, else defer.
3. Tests: drifted repo → `casp next` exits non-zero and stdout is empty; clean repo → prompt printed; `--no-check` bypasses.
4. README ("CASP refuses to start the wrong session" becomes literally true), help, CHANGELOG warning.

## DO NOT
- Do not auto-run anything after printing — `next` stays a printer, never a runner (anti-roadmap).
