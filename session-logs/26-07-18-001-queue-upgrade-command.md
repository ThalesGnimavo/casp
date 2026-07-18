# 26-07-18-001 — Queue edit: `upgrade-command` sequenced

## What changed (state surface only, no code)

- `upgrade-command` promoted from `phases_backlog` to `phases_queued`, sequenced
  after `check-shipped-log` and before `demand-gated-tail` (decision 2026-07-18).
  `docs/plan/sessions/PHASE-UPGRADE-COMMAND.md` (drafted 2026-07-17) is now
  committed: non-destructive scaffold refresh, additive `state.json` version
  stamp, `doctor` staleness WARN — the surgical alternative to `init --force`,
  which today overwrites operator data (`state.json` / `now.md` / `roadmap.md`).
- `PHASE-CHECK-SHIPPED-LOG.md` frontmatter `next_after` refreshed — it was stale
  at `26-06-17-002-0-6-0-bundle`, three shipped phases behind.
- `casp/roadmap.md` reconciled with `state.json.phases_shipped`: the Now table
  now leads with `check-shipped-log` then `upgrade-command`; the scoreboard adds
  the shipped rows for `positioning-deterministic-floor`,
  `positioning-subwedge-site`, 0.8.0 and 0.9.0; the parked `casp chain <N>` row
  now records that, if its evidence gate ever opens, the landing spot is the
  optional Claude Code `skills/` bundle — never a CLI verb (orchestration stays
  out of the binary, per the anti-roadmap).

## Note for the next close

- `PHASE-UPGRADE-COMMAND.md` `next_after` still points at
  `26-07-15-001-0-9-0-doctor-version` (draft-time truth). The session that closes
  `check-shipped-log` re-points it when re-targeting `next_prompt`.

## Verification

- `state.json` parses; `node dist/cli.js check` exit 0 before push.
- `next_prompt` unchanged: `PHASE-CHECK-SHIPPED-LOG.md` stays the next product slice.
