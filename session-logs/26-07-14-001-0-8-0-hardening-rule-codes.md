# 26-07-14-001 — 0.8.0: hardening, rule codes, schemas, honest-claims

Additive protocol-maturity + hardening pass. No verdict changes, `check --json`
stays schema v1, every prior test green. 74 tests total (+11).

## Shipped

### Fixes (previously queued)
- **Pre-push hook `set -eu`** (`src/install-hook.ts`) — was `set -e`; added `-u`
  (unset-variable guard). `pipefail` intentionally omitted — a bashism that would
  break the `#!/bin/sh` shebang.
- **Multiset-correct `arrayDelta`** (`src/state.ts`) — `casp state diff` array
  deltas matched by position, so dropping one of a duplicated element
  (`["a","a"] → ["a"]`) cancelled out and showed no change. Now a one-for-one
  multiset match reports the single removal. Display-only path; never gates
  `check`. (The originally-suspected reorder/substring bug did not exist —
  `Array.includes` is exact-match; only the duplicate case was real.)
- **`CASP-MIGRATION-003` advisory WARN** (`src/check.ts`) — a configured
  `migrations_dir` that holds migration files while `migrations_applied` is unset
  now warns (non-blocking). Silent for a genuinely empty dir (fresh project).

### Security
- **`gitArgs()`** (`src/shared.ts`) — argv array to `execFileSync`, no shell.
  `git()` remains shell-based and is now documented as literal-args-only. Six
  interpolating call sites moved to `gitArgs()`: `check.ts` (`last_commit` verify,
  the `status --porcelain` state-surface pathspec), `state.ts` (`show <ref>`),
  `verify.ts` (`rev-parse <ref>`, `worktree add/remove`). A crafted
  `last_commit` like `HEAD; touch INJECTED` now becomes one invalid git arg → the
  check FAILs; regression test asserts no shell side effect.
- `docs/threat-model.md` — trust boundaries (repository content is untrusted),
  threats addressed, and the tracked residual (full `gitArgs` migration of the
  remaining literal-only calls; path-containment for configured dirs).

### Rule codes + inspection
- **`src/rules.ts`** — a registry mapping every internal finding id to a stable
  `CASP-<AREA>-<NNN>` code with title / verifies / evidence / remediation.
- **Additive `rule` field** in `check --json` findings (no `schema_version` bump;
  still v1). `printReport` shows the code next to WARN/FAIL lines; PASS stays
  uncluttered.
- **`casp rules`** (`--json`) lists the catalogue; **`casp explain <CODE>`**
  prints one rule (accepts a code, case-insensitive, or an internal finding id).
  Wired into `cli.ts` + `help.ts` (per-command help + top-level list).

### Schemas + claim scoping
- **`schemas/state.schema.json`** + **`schemas/check-result.schema.json`**
  (Draft 2020-12), added to package `files`. No validator dependency bundled;
  structural-conformance tests assert `casp init` emits every required state key
  and `check --json` matches the result shape.
- **`docs/what-casp-proves.md`** — a clean `casp check` proves the recorded
  execution state is consistent with git evidence; it does NOT prove code
  correctness, deployment, remote-DB migration, or business intent.
- **`docs/rules.md`** — the code catalogue (snapshot; `casp rules` is source of
  truth). `docs/check-json.md` updated for the `rule` field. README: rule codes
  in the sample output, `rules`/`explain` in the command deck, scope + threat
  links, 0.7 roadmap line.

## Tests (+11, 74 total)
Injection blocked; multiset delta single-removal; migrations-untracked WARN +
empty-dir silence; `rules` catalogue + `explain` by code/id/unknown; rule
coverage on clean and drifted states; both schemas' structural conformance.

## Notes
- Everything additive and backward-compatible: internal finding ids unchanged,
  `check --json` schema stays v1, prior tests untouched.
- Deferred (out of scope by design): full `gitArgs` migration of literal-only
  git calls; root-escape rejection for configured `sessions_dir`/`logs_dir`/
  `migrations_dir` paths (read-only enumeration today, no write/exec).
