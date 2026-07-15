---
status: shipped
session_id: 26-07-15-001-0-9-0-doctor-version
session_log: session-logs/26-07-15-001-0-9-0-doctor-version.md
drafted_at: 2026-07-15
next_after: 26-07-14-001-0-8-0-hardening-rule-codes
---

# Session — 0.9.0: doctor, version, structured findings

> **Status: SHIPPED (0.9.0).** DX + machine-handoff pass. Two new commands
> (`doctor`, `version`) make it a minor bump; everything is additive and
> backward-compatible — no existing finding changes verdict, `check --json`
> stays schema v1, every prior test green (87 total, +13).

Three cheap, high-DX, 100% deterministic additions, all local-only and
LLM-free.

## Shipped

1. **`casp doctor`** — a read-only ENVIRONMENT diagnostic for onboarding
   (`src/doctor.ts`). Probes Node (>= 20), the git binary + repository,
   `casp/state.json` presence + validity, the resolved `sessions_dir` /
   `logs_dir`, `core.hooksPath`, and whether a CASP-managed pre-push hook is
   installed. `PASS` / `WARN` / `FAIL` per line, plus `--json` (own
   `schema_version`). **Never gates — always exits 0**, even on a `FAIL`: a map
   of what to fix, not a gate. Reuses `resolveDirs` and the exported
   `isCaspHook` / `resolveHookPath` so its verdicts never diverge from
   `check` / `install-hook`. `check` remains the only gate.

2. **`casp version [--json]`** — `src/version.ts`. Plain form prints the version
   (byte-identical to `casp -V` / `--version`, unchanged). `--json` emits
   `{ name, version, node, schema_version }`, where `schema_version` is the
   `check --json` report schema version (`JSON_SCHEMA_VERSION`, now exported).
   `name` / `version` read from `package.json` via a shared `readPkg()` (new
   `pkgName()` alongside `pkgVersion()`).

3. **Additive `expected` / `actual` on `check --json` findings** — optional
   `string | null` on `Finding`, set where a single expected-vs-actual pair is
   natural: `last_commit.git` (HEAD vs recorded sha), `next_prompt.status`
   (`queued` vs `shipped`), `migrations.match` (on-disk vs in-state). `null` on
   every other finding. Fully additive: `schema_version` stays `1`, no field
   renamed / removed, order unchanged, human report byte-identical (JSON-only).
   Published `check-result.schema.json` + `docs/check-json.md` updated in
   lockstep; new `docs/doctor.md`.

## Boundaries held
- No LLM, no network, deterministic. doctor never gates; `check` stays the sole
  exit-code gate.
- No untrusted value reaches a shell: doctor's git calls are static literals via
  `git()`; nothing new routes user input into a shell.
- Rule-coverage invariant intact — doctor / version are separate surfaces and
  introduce no `check` finding, so every `check` finding still maps to a
  `CASP-<AREA>-<NNN>` rule.

## Tests
87 total (+13): doctor healthy / missing-state (FAIL but exit 0) / invalid-JSON
/ `--json` envelope + tally / hook WARN→PASS after `install-hook` /
outside-a-repo WARN; `version` plain == `-V` and `--json` shape with matching
`schema_version`; `expected` / `actual` populated on the shipped-prompt and
unresolvable-`last_commit` drifts and `null` on passes.
