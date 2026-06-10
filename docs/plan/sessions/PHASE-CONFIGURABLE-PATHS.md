---
status: queued
session_id: pending
session_log: pending
drafted_at: 2026-06-10
next_after: PHASE-NEXT-PRESESSION-GATE
---

# Session — configurable-paths : `sessions_dir` / `logs_dir` state keys (PROTOCOL)

> **Status : QUEUED.** Validated Tier-1 #3. The protocol/schema follow-on to
> the 0.3.0 false-green fix: non-standard layouts must not false-RED either.
>
> **Goal.** Optional `state.json` keys `sessions_dir` (default
> `docs/plan/sessions`) and `logs_dir` (default `session-logs`), joining
> `migrations_dir`. Every check and the workdir-clean scan honor them.
>
> **Protocol bucket** — clears the HTTP-method-rare bar: not a new check, the
> existing checks pointed at the right ground truth. Backward-compatible.

**Project root.** `/Users/juste/ZeroSuite/casp-sh/casp-core`
**Expected size.** 2 h. Schema change: two OPTIONAL keys.

## MUST HAVE

1. `src/shared.ts` State interface + resolution helper (single place computes the three dirs from state with defaults).
2. `src/check.ts`, `src/new.ts`, `src/status.ts` honor the keys (including check 8's `git status` path list and all `cannot verify` messages — print the RESOLVED path, not the default).
3. `templates/state.json` documents the keys in `notes` (do not add them by default — defaults stay implicit).
4. Tests: custom dirs → clean repo passes, claims against missing CUSTOM dirs fail; defaults unchanged.
5. README protocol section + CHANGELOG.

## DO NOT
- Do not make the keys mandatory or write them on `init` — optional, absent by default.
