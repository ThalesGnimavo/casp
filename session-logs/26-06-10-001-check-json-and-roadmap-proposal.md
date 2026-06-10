# 26-06-10-001 — 0.2.4 : `casp check --json` + roadmap proposal + CASP-on-CASP

**Session prompt :** `docs/plan/sessions/PHASE-0-2-4-CHECK-JSON-AND-ROADMAP-PROPOSAL.md` (formalized from the CEO brief `private-docs (internal)/fable-brief-casp-roadmap-proposal.md`).
**Previous session end :** `321d4fb` (docs: 0.2.3 — publish the autonomous-model-era repositioning to npm).
**Delegation :** Executed inline; read-only Explore sub-agent for the post-implementation audit. Reason: small blast radius, single-package change.
**State at session start :** No `casp/` cockpit in the repo (CASP did not manage itself). Brief asked for (1) a roadmap *proposal* within stated rails, (2) shipping the one pre-agreed item, `casp check --json`.

## Scope shipped this session

### A — `src/check.ts` + `src/shared.ts` + `src/cli.ts` (MODIFIED)

#### `casp check --json` — machine-readable validator report

- Input: `--json` flag (composes with `--no-git`; supersedes `--quiet` — the JSON report is always complete).
- Response shape: `{ schema_version: 1, casp_version, verdict: "clean"|"drift", exit_code, summary: {pass, warn, fail}, findings: [{id, severity, label, detail, fix|null}] }`.
- Verdict logic shared with the human report — `--json` changes format, never the outcome. Exit-code contract untouched (clean → 0, drift → 1).
- Early-exit paths (missing `casp/state.json`, unparsable JSON) now emit a well-formed v1 document with a single `state.file` FAIL finding — consumers never need a non-JSON fallback.
- `pkgVersion()` moved from `cli.ts` to `shared.ts` (single runtime source for the version string — the class of bug fixed in 0.1.2 and 0.2.2 stays dead).

### B — `docs/check-json.md` (NEW)

Stable-schema documentation: stability contract (`schema_version` bumps only on breaking change; finding `id`s are stable identifiers), field table, CI-annotation and user-owned-webhook recipes.

### C — `test/check.test.mjs` (MODIFIED)

Four new tests: clean → valid schema + verdict `clean` + counts add up; drift → exit 1 + failing finding with `fix` hint; missing state.json → still valid JSON; default human output untouched (no JSON braces). 6/6 green.

### D — `private-docs/casp-roadmap-proposal.md (internal, outside this repo)` (NEW — the primary deliverable)

Every backlog item (README roadmap + `TODO.md`) tagged protocol/tooling, ordered by leverage. Tier 1: `install-hook` (argues the README's 0.6 ordering is wrong), configurable paths (the one protocol-bucket item — justified against the false-green failure mode), state-bump check refinement (found by dogfooding, see below). Cuts argued: `casp lint` (LLM verb dilutes the deterministic wedge), notification channel adapters in core (replaced by `--json` + webhook recipe), `last-close.json` (breaks "three files"). Restraint section: four new check-category candidates considered, one accepted.

### E — CASP-on-CASP (NEW)

`casp init` run on this repo via its own built CLI; `casp/state.json`, `now.md`, `roadmap.md` filled with reality. State parked (`next_phase`/`next_prompt` = null) on purpose: next work is gated on CEO validation of the proposal — which also exercises the 0.2.2 parked-state fix.

### F — `src/init.ts` (MODIFIED — dogfooding catch)

`casp init` copied `templates/.DS_Store` into the scaffold from a local clone. One-line skip added. Published npm installs were unaffected (`npm pack` strips it).

## What did NOT ship this session — and why

- **Everything in the proposal's tiers** — by design; the proposal is validated before execution.
- **`cockpit → casp` naming residue** (repo dir `cockpit-skill/`, old scaffolds across ZeroSuite) — flagged in the proposal as hygiene, separate cross-project chore.
- **npm publish of 0.2.4** — version bumped on the branch; publish happens after audit + merge.

## Files touched

| File | Change |
|------|--------|
| `src/check.ts` | MODIFIED — `--json` emission incl. early-exit paths. |
| `src/shared.ts` | MODIFIED — `pkgVersion()` helper added. |
| `src/cli.ts` | MODIFIED — uses `pkgVersion()`; help text documents `check --json`. |
| `src/init.ts` | MODIFIED — skip `.DS_Store` when scaffolding. |
| `test/check.test.mjs` | MODIFIED — 4 new JSON-contract tests. |
| `docs/check-json.md` | NEW — schema documentation. |
| `private-docs/casp-roadmap-proposal.md (internal, outside this repo)` | NEW — the roadmap proposal. |
| `README.md` | MODIFIED — `--json` in command deck + validator section (roadmap section untouched). |
| `CHANGELOG.md` | MODIFIED — 0.2.4 unreleased entry. |
| `package.json` | MODIFIED — version 0.2.4. |
| `casp/*` | NEW — CASP-on-CASP cockpit. |
| `docs/plan/sessions/PHASE-0-2-4-CHECK-JSON-AND-ROADMAP-PROPOSAL.md` | NEW — this session's prompt, shipped. |
| `session-logs/26-06-10-001-check-json-and-roadmap-proposal.md` | This log. |

No deletions. No renames.

## Verify

### Inline

- `npm test` — 6/6 green (build via `pretest`).
- `npx casp check` on this repo — 0 FAIL (see WARN note below).

### Post-implementation audit (Explore sub-agent)

Verdict recorded in the final commit message; fixes applied inline before commit.

### Observed divergence (documented)

- **The brief's rails file `casp-optimized-roadmap.md` does not exist.** Rails taken from the brief's inline statement; flagged in the proposal header for the CEO to resolve.
- **The canonical close loop ends in a permanent WARN** (`last_commit` in history but not at HEAD, because the state-bump commit moves HEAD past it). Deterministic fix proposed as Tier 1 #3 — not implemented this session (it is contested-by-default until validated).

## Deferred / risks

- **Proposal not validated** — nothing in Tiers 1-3 is authorized; the branch carries only the pre-agreed item.
- **`schema_version` discipline** — any future change to the JSON shape must be checked against `docs/check-json.md`'s stability contract; breaking = bump.

## Scope decisions made this session

- **Parked state instead of a queued next prompt.** Queuing `install-hook` would presume validation of a contested ordering; `null` is the honest state and the protocol supports it since 0.2.2.
- **`--json` supersedes `--quiet`** rather than erroring or filtering — a partial JSON report would push severity-filtering into every consumer; a complete report with a `summary` block is strictly more useful.
- **Version bumped to 0.2.4 on the branch** — harmless if rejected, removes a merge-day step if validated.

## CASP state + housekeeping

- `casp/state.json` — `current_phase: 0.2.4-check-json`, parked next, retroactive `phases_shipped` from the changelog.
- `casp/now.md` / `casp/roadmap.md` — reality-filled; Next-3 mirrors Tier 1, explicitly gated on validation.
- This prompt's frontmatter: `status: shipped`, `session_log` pointing here.
- `npx @justethales/casp check` — 0 FAIL before push.

## Addendum — 2026-06-10, later same session

The rails file `private-docs (internal)/casp-optimized-roadmap.md` **was delivered by
the CEO after the first draft** (it was genuinely absent from disk at session
start — `find` over the workspace confirmed). `private-docs/casp-roadmap-proposal.md (internal, outside this repo)` was
rewritten as **v2**, reconciled against the real rails:

- **Adopted from the rails (new since v1):** pre-session gate (`casp next`
  validates before printing — promoted to Tier 1 #1), CI status-check
  installer, slash-command distribution, `casp verify <commit>`, and the
  rails' `phases_shipped ↔ session-log` check candidate (accepted; supersedes
  v1's parked prompt↔phases cross-check).
- **Held against the rails (five explicit dissents, argued in the proposal's
  "Where I differ" table):** `last-close.json` cut with `casp status --json`
  as substitute; notifications narrowed to a generic webhook (no named
  adapters in core); `casp lint` cut entirely rather than kept as advisory;
  `verify <commit>` demoted to Tier 2; enforcement pulled up from rails
  Tier 3 into leverage-ordered Tier 1.
- Cockpit mirrors updated (`casp/roadmap.md` Next-3, `casp/now.md`).
- The v1 "dangling rails pointer" hygiene flag is resolved and removed.

## End-of-session

- Tests + build green inline.
- `casp check` 0 FAIL.
- Post-implementation audit ran (read-only Explore agent) — findings applied inline.
- Next-session prompt deliberately NOT drafted — gated on CEO validation of `private-docs/casp-roadmap-proposal.md (internal, outside this repo)`.
- Commit on `feat/check-json-roadmap-proposal` + push. No merge.
