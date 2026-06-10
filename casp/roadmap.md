# Roadmap

> **Updated** : 2026-06-10 (session 26-06-10-002).
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

## In-flight (other agents working in parallel)

| Item | Owner | Expected close |
|------|-------|----------------|
| Two-auditor review of the 0.3.0 check-logic change | CEO process | before merge |

---

## Blocked

| Item | Blocker | Unblock action |
|------|---------|----------------|
| 0.3.0 merge + npm publish | two-auditor review of the false-green fix | both auditors GO → merge → publish |
| ZeroSuite-wide re-verification | 0.3.0 not yet published | CEO re-runs `casp check` everywhere with the new binary |

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
| 2026-06-10 | `a2f9551` (merged) | 0.2.4 — `casp check --json` + CASP-on-CASP | published to npm |
| 2026-06-10 | `2c6c813` | internal proposal moved out of the public repo | private-docs repo created |
| 2026-06-10 | _(this branch)_ | 0.3.0 — false-green fix + state-bump recognition | **verdict-changing**; 13 PASS · 0 WARN · 0 FAIL on this repo |
| 2026-06-10 | _(this branch)_ | validated queue drafted as 7 prompts | proposal → executable thread |

---

## Phase scoreboard

| Phase | Status | Session log | Notes |
|-------|--------|-------------|-------|
| 0.1.0 — Initial release (`cockpit`) | shipped | — (pre-cockpit era) | 2026-05-30 |
| 0.2.0 — CASP rebrand + `casp next` + exit-code test | shipped | — (pre-cockpit era) | 2026-06-08 |
| 0.2.2 — parked-state fix + runtime version | shipped | — (pre-cockpit era) | 2026-06-09 |
| 0.2.3 — autonomous-era repositioning (docs) | shipped | — (pre-cockpit era) | 2026-06-10 |
| 0.2.4 — `check --json` + CASP-on-CASP + proposal | shipped | `session-logs/26-06-10-001-check-json-and-roadmap-proposal.md` | published |
| 0.3.0 — correctness fixes (false-green, state-bump) | shipped (branch) | `session-logs/26-06-10-002-false-green-and-state-bump-fixes.md` | awaiting two-auditor review |
| install-hook | queued | _(pending)_ | Next #1 |
| next-presession-gate | queued | _(pending)_ | Next #2 |
| configurable-paths | queued | _(pending)_ | Next #3 (PROTOCOL) |
| check-shipped-log → demand-gated-tail | queued | _(pending)_ | validated order 4-7 |
