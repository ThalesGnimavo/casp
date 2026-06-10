---
status: queued
session_id: pending
session_log: pending
drafted_at: 2026-06-10
next_after: 26-06-10-002-false-green-and-state-bump-fixes
---

# Session — install-hook : `casp install-hook` writes the pre-push gate

> **Status : QUEUED.** Validated Tier-1 #1 (CEO decision 2026-06-10). Cheapest,
> highest leverage per line in the backlog.
>
> **Goal.** One verb that writes `.git/hooks/pre-push` running `casp check --quiet`,
> turning P03 ("check before every push — not optional") from discipline into mechanism.
>
> **Why now.** Everything else decorates the gate; this multiplies it.

**Project root.** `/Users/juste/ZeroSuite/casp-sh/casp-core`
**Expected size.** 1 h. No schema change. No migration.

## MUST HAVE

1. `src/install-hook.ts` — `casp install-hook`: write an executable `pre-push` hook running `npx --no-install @justethales/casp check --quiet` (fall back to `casp` on PATH). Refuse to overwrite a non-CASP hook without `--force`; idempotent when the hook is already CASP's.
2. `casp install-hook --remove` — clean uninstall (only if the hook is CASP's).
3. Tests: hook installed and blocks a push from a drifted repo (simulate by running the hook script directly); refuses to clobber a foreign hook; `--remove` only removes ours.
4. README + help text + CHANGELOG.

## DO NOT
- Do not touch `core.hooksPath` or global git config.
- Do not auto-install from `casp init` — explicit opt-in only.

## AT END
Canonical close loop: log, state bump, `casp check` green, branch, no merge before audit.
