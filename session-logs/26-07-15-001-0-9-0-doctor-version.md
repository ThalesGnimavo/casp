# 26-07-15-001 — 0.9.0: doctor, version, structured findings

DX + machine-handoff pass. Additive and backward-compatible: no verdict change,
`check --json` stays schema v1, human output byte-identical, every prior test
green. 87 tests total (+13).

## Shipped

### `casp doctor` — read-only environment diagnostic (`src/doctor.ts`, new)
Answers "is this machine set up to run casp?" — not "has the state drifted?"
(that stays `check`'s exclusive job). Probes:
- `node.version` — Node major >= 20.
- `git.present` — the `git` binary on PATH (+ version string).
- `git.repo` — inside a git work tree (WARN if not).
- `state.present` / `state.valid` — `casp/state.json` exists and parses.
- `dirs.sessions_dir` / `dirs.logs_dir` — the resolved state-surface dirs exist.
- `git.hooks_path` — whether `core.hooksPath` is set.
- `hook.pre_push` — CASP-managed pre-push hook installed / foreign / absent.

`PASS` / `WARN` / `FAIL` per line, plus `--json` (own `schema_version: 1`,
`{ schema_version, casp_version, node, summary, checks }`). **Never gates —
always exits 0**, even on a `FAIL`. Reuses `resolveDirs` and the now-exported
`isCaspHook` / `resolveHookPath` from `install-hook.ts`, so doctor's verdicts
never diverge from what `check` / `install-hook` conclude. Documented in
`docs/doctor.md`.

### `casp version [--json]` (`src/version.ts`, new)
Plain form prints the version, byte-identical to `casp -V` / `casp --version`
(unchanged — they still short-circuit at the top of `cli.ts`). `--json` emits
`{ name, version, node, schema_version }` for the agent-to-agent handoff, where
`schema_version` is the `check --json` report schema version — so a consumer can
negotiate the check-report shape from one call. `JSON_SCHEMA_VERSION` is now
exported from `check.ts`; `name` / `version` come from `package.json` via a
shared `readPkg()` (new `pkgName()` beside the refactored `pkgVersion()`).

### Additive `expected` / `actual` on `check --json` findings (`src/check.ts`)
Optional `string | null` on the `Finding` interface, set at the three sites with
a single natural expected-vs-actual pair:
- `last_commit.git` — `expected` = HEAD short sha, `actual` = recorded sha
  (on the "in history not at HEAD" WARN and the "not found" FAIL).
- `next_prompt.status` — `expected` = `queued`, `actual` = the status
  (shipped FAIL, unusual-status WARN).
- `migrations.match` — `expected` = on-disk set, `actual` = in-state set.

`null` on every other finding. `buildReport` normalizes both to `null` so every
JSON finding carries the keys. **Fully additive**: `schema_version` stays `1`,
no field renamed / removed, finding order unchanged, `printReport` (human) is
untouched. `record()` gained an optional `extra` arg; existing call sites are
unaffected. Published `schemas/check-result.schema.json` adds `expected` /
`actual` to the finding `properties` and `required` (mirroring nullable `rule` /
`fix`); `docs/check-json.md` updated.

## Boundaries held
- Deterministic, local-only, zero network, no LLM anywhere.
- doctor never gates — `check` remains the only exit-code gate.
- No new shell-injection surface: doctor's git calls pass static literals through
  `git()`; no untrusted value reaches a shell.
- Rule-coverage invariant intact: doctor / version are separate surfaces, emit no
  `check` finding, so every `check` finding still maps to a `CASP-<AREA>-<NNN>`
  rule (coverage test green on clean + drift).

## Verification
- `npm run build` clean, `node --test` 86/86 green.
- `node dist/cli.js check` exits 0 (self-gate).
- Manual smoke: `version`, `version --json`, `-V` (unchanged), `doctor`,
  `doctor --json`, `check --json` expected/actual, `doctor`/`version` help
  routing + unknown-command list.

## Audit
Read-only audit (Explore) ran before commit: verdict GO-WITH-FIXES. Applied:
doctor's exit-0 invariant hardened against filesystem throws — `isDir` guards
`statSync` (EACCES), a new `isCaspHookSafe` guards `readFileSync` (EISDIR on a
directory-named `pre-push`), and `runDoctor` wraps `runChecks` in a top-level
try/catch that still exits 0 (surfaces a `doctor.internal` FAIL instead of
crashing). Added a portable regression test (dir-named `pre-push` → exit 0),
bringing the count to 87. Also clarified in `docs/check-json.md` that the
`check-result` schema sets `additionalProperties: false` and ships in lockstep,
so a consumer pinning an older schema copy must parse leniently.

## Deferred / risks
- `src/check.ts`'s `isDir` (`statSync`) has the same theoretical throw surface as
  doctor's. Left untouched deliberately — a throw there still yields exit 1 (the
  gate's correct "cannot verify → FAIL" outcome), and hardening the gate is out
  of scope for a DX session. Tracked as defense-in-depth.
- `expected` / `actual` are set at three natural sites only; other findings keep
  them `null`. Extending coverage is additive and can wait for demand.

## Notes
Minor bump (0.8.0 → 0.9.0) for the two new commands. `next_prompt` stays at
`PHASE-CHECK-SHIPPED-LOG.md` (the next queued roadmap slice, CEO-sequenced — not
executed here). Not published to npm in this session (publish is a separate,
deliberate act).
