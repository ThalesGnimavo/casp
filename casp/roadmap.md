# Roadmap

> **Updated** : 2026-06-15 (session 26-06-15-001).
> **Source of truth** : this file + `docs/plan/sessions/*.md` (status frontmatter) + `session-logs/`.
> **Maintenance rule** : update at the end of every session that ships something or surfaces a blocker.
> **Note** : the roadmap proposal was **validated by the CEO on 2026-06-10** (it lives in private-docs, outside this repo). The queue below is the approved order, materialized as drafted prompts.

---

## Now — Next 3 to ship (in this order)

| # | Item | Prompt | Status |
|---|------|--------|--------|
| 1 | `casp install-hook` — pre-push gate, P03 becomes mechanism | `docs/plan/sessions/PHASE-INSTALL-HOOK.md` | queued |
| 2 | Pre-session gate on `casp next` — refuses on drift, `--no-check` escape (minor bump + CHANGELOG warning) | `docs/plan/sessions/PHASE-NEXT-PRESESSION-GATE.md` | queued |
| 3 | Configurable paths — `sessions_dir`/`logs_dir` optional keys (PROTOCOL; non-standard layouts must not false-red) | `docs/plan/sessions/PHASE-CONFIGURABLE-PATHS.md` | queued |

If you reach for anything BELOW Next-3, stop and check why.

---

## Blocked

| Item | Blocker | Unblock action |
|------|---------|----------------|
| `npm publish` 0.4.0 | CEO-gated act (needs npm login/token) | CEO publishes; 0.3.x was never republished if the token is still absent |
| "five verbs" copy is now wrong | `ship`/`close` make it seven | docs-only pass on `casp.sh` + `CASP-PRESENTATION.md` |

---

## Queued — validated order (after Next-3)

4. New drift category: `phases_shipped[]` ↔ session-log file — `docs/plan/sessions/PHASE-CHECK-SHIPPED-LOG.md`
5. `casp status --json` (the `last-close.json` substitute) — `docs/plan/sessions/PHASE-STATUS-JSON.md`
6. `casp verify <commit>` + `casp state diff` — `docs/plan/sessions/PHASE-VERIFY-AND-STATE-DIFF.md`
7. Demand-gated tail (CI installer, notify --webhook with STRUCTURAL token check, narrow rollback, binaries, timeline/metrics, slash distribution) — `docs/plan/sessions/PHASE-DEMAND-GATED-TAIL.md`

---

## Shipped this week

| Date | Commit | Title | Notes |
|------|--------|-------|-------|
| 2026-06-15 | `0f31f50` | 0.4.0 — `ship`/`close` verbs, optional migrations, `check --all` | 28/28 tests; audited; npm publish pending (CEO-gated) |
| 2026-06-10 | `a2f9551` (merged) | 0.2.4 — `casp check --json` + CASP-on-CASP | published to npm |
| 2026-06-10 | (merged) | 0.3.0 / 0.3.1 — false-green fix, state-bump recognition, Alembic + multi-log | verdict-changing; rolled out across ZeroSuite |

---

## Phase scoreboard

| Phase | Status | Session log | Notes |
|-------|--------|-------------|-------|
| 0.1.0 — Initial release (`cockpit`) | shipped | — (pre-cockpit era) | 2026-05-30 |
| 0.2.0 — CASP rebrand + `casp next` + exit-code test | shipped | — (pre-cockpit era) | 2026-06-08 |
| 0.2.2 — parked-state fix + runtime version | shipped | — (pre-cockpit era) | 2026-06-09 |
| 0.2.3 — autonomous-era repositioning (docs) | shipped | — (pre-cockpit era) | 2026-06-10 |
| 0.2.4 — `check --json` + CASP-on-CASP + proposal | shipped | `session-logs/26-06-10-001-check-json-and-roadmap-proposal.md` | published |
| 0.3.0 — correctness fixes (false-green, state-bump) | shipped | `session-logs/26-06-10-002-false-green-and-state-bump-fixes.md` | merged + rolled out |
| 0.3.1 — Alembic + multi-log field fixes | shipped | `session-logs/26-06-10-003-field-fixes-and-zerosuite-rollout.md` | merged |
| 0.4-close-loop — `ship`/`close`, opt-in migrations, `check --all` | shipped | `session-logs/26-06-15-001-0-4-close-loop.md` | npm publish pending |
| install-hook | queued | _(pending)_ | Next #1 |
| next-presession-gate | queued | _(pending)_ | Next #2 |
| configurable-paths | queued | _(pending)_ | Next #3 (PROTOCOL) |
| check-shipped-log → demand-gated-tail | queued | _(pending)_ | validated order 4-7 |
