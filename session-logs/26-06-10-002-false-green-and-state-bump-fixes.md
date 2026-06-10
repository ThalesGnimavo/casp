# 26-06-10-002 — 0.3.0 : false-green fix + state-bump recognition + validated queue

**Session prompt :** continuation brief (CEO validation of the roadmap proposal + execution order), formalized outside the repo.
**Previous session end :** `2c6c813` (chore(casp): bump state.last_commit — the 0.2.4 close).
**Delegation :** Executed inline; **two independent read-only auditors** (per the validation decision) on the check-logic change before merge.
**State at session start :** Proposal approved with one change (split the false-green fix from configurable paths). 0.2.4 published. Cockpit parked.

## Scope shipped this session

### A — `src/check.ts` (MODIFIED — verdict-changing, the highest-stakes surface)

#### False-green fix — a claim the validator cannot verify now FAILs

- Real `last_session_id` + missing `session-logs/` → FAIL `last_session.logs_dir` (was: file-level FAIL with a misleading message — functionally covered; the dir-level finding makes the cause explicit).
- Non-empty `migrations_applied` + missing migrations dir → FAIL `migrations.dir`. **This was the canonical false-green**: the marketing's own drift example reported green when the directory was absent, because the check silently skipped.
- Non-empty `phases_shipped` + missing `docs/plan/sessions/` or `session-logs/` → FAIL `shipped_history.sessions_dir` / `shipped_history.logs_dir`.
- Placeholders are not claims: `last_session_id: "pending"` is now WARN (was FAIL), consistent with `last_commit: "pending"`. A fresh parked cockpit checks clean.

#### State-bump recognition — the canonical close loop reads PASS

- `last_commit` = parent of HEAD **and** HEAD touches only `casp/`, `docs/plan/sessions/`, `session-logs/` → PASS. Anything else past `last_commit` stays WARN exactly as before.

### B — `test/check.test.mjs` (MODIFIED)

Nine new tests (15 total): the brief's required regression guard (claimed session + missing logs dir → exit 1), the canonical migrations false-green, the shipped-history claim, fresh-parked-state-is-clean, state-bump PASS, non-bump-stays-WARN, plus the three post-audit guards (empty-string id, migrations-dir-is-a-file, sessions-path-is-a-file).

### C — Validated queue materialized (NEW — 7 prompts)

`docs/plan/sessions/`: PHASE-INSTALL-HOOK, PHASE-NEXT-PRESESSION-GATE (carries the minor-bump + CHANGELOG-warning note), PHASE-CONFIGURABLE-PATHS (protocol), PHASE-CHECK-SHIPPED-LOG (the accepted rails candidate), PHASE-STATUS-JSON (the last-close.json substitute), PHASE-VERIFY-AND-STATE-DIFF, PHASE-DEMAND-GATED-TAIL (queue marker; carries the **structural** committed-token-check constraint for notify — never entropy heuristics). `state.json` unparked: `next_prompt` → PHASE-INSTALL-HOOK.md.

### D — Version + docs

`package.json` 0.3.0 (verdict-changing fix ⇒ minor bump pre-1.0, not a patch). CHANGELOG 0.3.0 with the re-run warning. README validator list: nine categories.

### E — Rails doc reconciled (private-docs repo, outside this repo)

The `casp lint` advisory carve-out replaced by the CUT decision, so rails and validated proposal agree.

## The receipt

- **Before** (published 0.2.4 binary, this repo): `12 PASS · 1 WARN · 0 FAIL` — the permanent state-bump WARN.
- **After** (0.3.0 build, this repo): **`13 PASS · 0 WARN · 0 FAIL`** — `casp check` fully green on CASP's own repo for the first time. Two real bugs found by dogfooding the tool, fixed, and verified by the tool itself.

## FOR THE CEO — action required after 0.3.0 ships

**The false-green fix changes verdicts.** Repos that reported green under ≤0.2.4 may now correctly report drift (claimed migrations/sessions/phases whose directories are missing). **Re-run `casp check` with the 0.3.0 binary on every CASP-managed repo (SENEBA, Conductor, …)** — a new red there is not a regression, it is a previously-invisible lie surfacing. This re-verification is a CEO action, not this session's.

## What did NOT ship — and why

- **Everything in the queue (install-hook onward)** — per the brief: don't cram; the queue is drafted, not executed.
- **Merge / publish** — gated on the two independent auditors (in flight at log-writing time; verdicts go into the final commit message).

## Verify

- `npm test` — 15/15 green.
- `casp check` (0.3.0 build) on this repo — 13 PASS · 0 WARN · 0 FAIL after the close commits.

### Two-auditor review (independent, parallel, read-only)

- **Auditor A (adversarial false-red hunter): GO-WITH-FIXES.** Three findings, all applied inline before commit: (1) empty-string `last_session_id` was a residual silent green → now FAILs (`last_session.id_empty`); (2) `readdirSync` crash when the migrations path is a file → `isDir()` guard; (3) same crash class on `docs/plan/sessions` → same guard, extended to `session-logs/` and the shipped-history claims. A's adversarial probes on state-bump recognition (merge commits, consecutive bumps, two-behind, SHA-prefix matching, `--no-git`, `--json`) all passed.
- **Auditor B (spec conformance + regression safety): GO.** Brief compliance verified line by line; no remaining silent-skip path found; JSON schema additive-only confirmed; cockpit/docs/CHANGELOG consistency confirmed.

## Scope decisions made this session

- **0.3.0, not 0.2.5.** The false-green fix can flip green repos to red; pre-1.0 semver signals behavior change via the minor. The CHANGELOG warning is the contract.
- **New branch off main instead of the merged 0.2.4 branch** — the brief assumed the old branch was still open; it was merged and published by CEO decision (npm token session). Same intent, real state.
- **`last_session_id: "pending"` → WARN** — the brief's "a placeholder is not a claim" principle applied consistently; also fixes the fresh-init UX (0FEE test showed 2 FAILs on a pristine scaffold).

## CASP state + housekeeping

- `casp/state.json` — unparked, queue mirrors the validated order, `current_phase: 0.3.0-correctness-fixes`.
- `casp/now.md` / `casp/roadmap.md` — rewritten; blockers table carries the two-auditor gate and the ZeroSuite re-verification.
- `npx @justethales/casp check` — fully green before push.

## End-of-session

- Tests + build green inline; check fully green.
- Two-auditor review: launched in parallel (false-red hunter + spec conformance), verdicts in the final commit.
- Next-session prompt already queued: `PHASE-INSTALL-HOOK.md` (`casp next` will print it).
- Commit on `fix/false-green-and-state-bump` + push. **No merge** — auditors + CEO gate.
