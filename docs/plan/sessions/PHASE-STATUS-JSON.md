---
status: shipped
session_id: 26-06-17-002-0-6-0-bundle
session_log: session-logs/26-06-17-002-0-6-0-bundle.md
drafted_at: 2026-06-10
next_after: PHASE-CHECK-SHIPPED-LOG
---

# Session — status-json : `casp status --json` (+ groundwork for --all)

> **Status : QUEUED.** Validated Tier-2 — the approved substitute for the cut
> `last-close.json`: derive the handoff on demand, never store a fourth artifact.
>
> **Goal.** `casp status --json`: current phase, next phase/prompt, last
> commit/session, phases shipped count, check verdict (run the validator
> in-process), as a stable documented schema alongside check's.

**Project root.** `/Users/juste/ZeroSuite/casp-sh/casp-core`
**Expected size.** 2 h. No schema change.

## MUST HAVE

1. `src/status.ts` `--json` flag; reuse the callable check (from the next-gate refactor) for the embedded verdict; schema documented in `docs/status-json.md` with the same stability contract as check-json.
2. Tests: shape, verdict embedding, exit code stays 0 (status never gates — the GATE is check/next).
3. Then sketch (do not build) `status --all` consuming it across a path list — write the design note into the session log for the next slice.

## DO NOT
- `status --json` must not exit non-zero on drift — reporting is not gating; that's check's job.
