---
status: shipped
session_id: 26-06-17-001-install-hook
session_log: session-logs/26-06-17-001-install-hook.md
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

## CONTEXT — sharpened 2026-06-17 (Boris/Claude Code self-verification thread)

The creator of Claude Code is publicly pushing **self-verification loops** as the
key ingredient that lets models "run for much longer" — agents that self-verify
(tests, browser, second-agent review) and ship **hands-off**, with the human out of
the chair. See `private-docs/casp-vs-self-verifying-harness.md`.

That world is exactly why install-hook moves from "convenience" to "the thing that
makes CASP work at all": **a hands-off self-verifying loop auto-commits and pushes —
it will not remember to run `casp check` manually.** Wiring the deterministic state
gate into `pre-push` is what makes CASP fire *inside* the autonomous loop instead of
being a step the agent skips. The harness self-verifies that the *code* works;
`casp check` on every push self-verifies that the *recorded state* still matches git
— the one check the loop structurally can't do for itself. install-hook is how that
check stops depending on discipline. This is the strongest argument in the backlog
for keeping it next; it also feeds the "deterministic floor of the self-verification
loop" positioning (CASP SERIES `2026-06-17/`).

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
