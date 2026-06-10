# Roadmap

> **Updated** : 2026-06-10 (session 26-06-10-001).
> **Source of truth** : this file + `docs/plan/sessions/*.md` (status frontmatter) + `session-logs/`.
> **Maintenance rule** : update at the end of every session that ships something or surfaces a blocker.
> **Note** : the full prioritized proposal (tiers, cuts, arguments) lives in `private-docs/casp-roadmap-proposal.md (internal, outside this repo)` and is awaiting CEO validation. The Next-3 below mirrors its Tier 1 and only becomes executable once validated.

---

## Now — Next 3 to ship (in this order, **pending proposal validation**)

| # | Item | Prompt | Status |
|---|------|--------|--------|
| 1 | Pre-session gate — `casp next` validates before printing, refuses on drift (`--no-check` escape) | (prompt not yet drafted — gated on validation) | not drafted |
| 2 | `casp install-hook` — pre-push hook running `casp check` (P03 becomes mechanism) | (prompt not yet drafted — gated on validation) | not drafted |
| 3 | Configurable paths — `sessions_dir` / `logs_dir` keys so the validator never false-greens on a different layout | (prompt not yet drafted — gated on validation) | not drafted |

If you reach for anything BELOW Next-3, stop and check why.

---

## In-flight (other agents working in parallel)

| Item | Owner | Expected close |
|------|-------|----------------|
| Two-auditor post-implementation audit of `feat/check-json-roadmap-proposal` | CEO process | before merge |

---

## Blocked

| Item | Blocker | Unblock action |
|------|---------|----------------|
| Everything in Next-3 | `private-docs/casp-roadmap-proposal.md (internal, outside this repo)` not yet validated | CEO reads + validates / amends the proposal |
| 0.2.4 npm publish | branch not merged | audit passes → merge → `npm publish` |

---

## Queued — launch-critical (do before public launch)

1. _(launched — casp.sh, npm and the README are live; nothing in this bucket)_

---

## Queued — non-critical (post-launch deferable)

- `casp doctor` — first-run failure killer (Tier 2).
- `casp status --all` — multi-repo roll-up on top of `check --json` (Tier 2).
- `casp state diff` — state evolution between commits (Tier 2).
- `casp rollback`, native binaries, `timeline`/`metrics` — Tier 3, demand-gated.

---

## Shipped this week

| Date | Commit | Title | Notes |
|------|--------|-------|-------|
| 2026-06-10 | _(this branch)_ | `casp check --json` + stable v1 schema + 4 tests | additive; exit-code contract untouched |
| 2026-06-10 | _(this branch)_ | `private-docs/casp-roadmap-proposal.md (internal, outside this repo)` | tiers, cuts (lint, notify adapters, last-close.json), restraint section |
| 2026-06-10 | _(this branch)_ | CASP-on-CASP | this cockpit; `casp check` green on the CASP repo itself |
| 2026-06-10 | _(this branch)_ | `casp init` `.DS_Store` fix | dogfooding catch |

---

## Phase scoreboard

| Phase | Status | Session log | Notes |
|-------|--------|-------------|-------|
| 0.1.0 — Initial release (`cockpit`) | shipped | — (pre-cockpit era) | 2026-05-30 |
| 0.2.0 — CASP rebrand + `casp next` + exit-code test | shipped | — (pre-cockpit era) | 2026-06-08 |
| 0.2.2 — parked-state fix + runtime version | shipped | — (pre-cockpit era) | 2026-06-09 |
| 0.2.3 — autonomous-era repositioning (docs) | shipped | — (pre-cockpit era) | 2026-06-10 |
| 0.2.4 — `check --json` + CASP-on-CASP + roadmap proposal | shipped (branch) | `session-logs/26-06-10-001-check-json-and-roadmap-proposal.md` | awaiting audit + validation |
| pre-session-gate | proposed | _(pending)_ | Tier 1 #1 |
| install-hook | proposed | _(pending)_ | Tier 1 #2 |
| configurable-paths | proposed | _(pending)_ | Tier 1 #3 |
| state-bump-check-refinement | proposed | _(pending)_ | Tier 1 #4 |
