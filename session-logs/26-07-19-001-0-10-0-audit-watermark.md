# 26-07-19-001 — 0.10.0 : `casp audit`, the deep-audit watermark

> **Retrospective log.** Written 2026-07-20, reconstructed from the CHANGELOG 0.10.0 entry and
> the real diff of commit `f682356` (the only implementation commit of the release). 0.10.0
> shipped on 2026-07-19 without a session prompt, session log, or cockpit bump — the cockpit
> stayed structurally green while a whole minor version left no trace. This log closes that gap;
> the regularization itself is recorded in `26-07-20-001-regularize-0-10-0-and-queue-facts-layer.md`.

**Session prompt :** none — the phase ran without a drafted prompt (part of the drift being
regularized).
**Previous session end :** `8c42684` (sequence upgrade-command after check-shipped-log; state
surface only).
**Implementation commit :** `f682356` — `feat(audit): casp audit — deep-audit watermark +
/audit-batch skill (0.10.0)`.

## Scope shipped (from the CHANGELOG entry + real diff)

### `casp audit` — the two-tier verification boundary

- **`casp audit status`** — prints the unaudited range `last_deep_audit..HEAD` (commit + file
  counts; `--json` for data). Treats a rebased-away watermark as orphaned and asks for a
  re-baseline.
- **`casp audit bump [<sha>]`** — records HEAD (or a given commit) as deep-audited. Resolves its
  ref through injection-safe git (`gitArgs`), refuses a non-commit, leaves state untouched on
  failure.
- **New optional state field `last_deep_audit`** (short SHA), documented in
  `schemas/state.schema.json`. A project that never runs the batch pass never sets it.
- **A production-cutover gate, never a merge gate** : `casp check` does not block on it — a
  stale watermark delays a deploy, it never blocks a commit.
- **`/audit-batch` skill** (`skills/audit-batch/SKILL.md`) drives it end-to-end: scope from
  `audit status`, run the battery + auditor once over the range diff, bump only on GO.

### Motivation (from the CHANGELOG)

The per-session holistic pass (adversarial sub-agent audit + full e2e battery + security
review) was turning a ~7-minute close into ~40 minutes of duplicated or batchable work.
Separating the tiers keeps the cheap irreversible-bug gate (`casp check` + fmt/typecheck/lint/
touched tests) on every merge while the semantic/security/e2e risk accumulates behind an
explicit, queryable watermark that must clear before a cutover.

## Files touched (from `git show --stat f682356`)

| File | Change |
|------|--------|
| `src/audit.ts` | NEW — the `audit status` / `audit bump` implementation (206 lines). |
| `skills/audit-batch/SKILL.md` | NEW — the end-to-end batch-audit skill (157 lines). |
| `test/audit.test.mjs` | NEW — 5 regression tests (131 lines). |
| `schemas/state.schema.json` | MODIFIED — optional `last_deep_audit` documented. |
| `src/cli.ts` · `src/help.ts` · `src/shared.ts` | MODIFIED — command wiring, per-command help, shared helpers. |
| `CHANGELOG.md` · `README.md` · `package.json` | MODIFIED — 0.10.0 entry, command deck row, version bump. |

## Verify

- Five new regression tests: status with no watermark (whole tree unaudited) · bump writes HEAD
  and status then reports up to date · status counts commits + files since the watermark · bump
  on a bogus ref exits 1 and leaves state untouched · unknown subcommand exits 1.
- **92/92 tests green** (re-confirmed 2026-07-20 during regularization).
- Published to npm : `npm view @justethales/casp version` = 0.10.0.

## What did NOT ship

- No new `casp check` rule — the release is fully additive; the `check --json` schema stays v1;
  no existing finding changes verdict.

## CASP state + housekeeping

Not done at ship time — that omission is exactly the drift regularized on 2026-07-20 (see the
next log). `phases_shipped`, `current_phase`, `now.md` and the roadmap scoreboard were bumped
retroactively in that session.
