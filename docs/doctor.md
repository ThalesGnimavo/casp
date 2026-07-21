# `casp doctor` — environment diagnostic

`casp doctor` answers **"is this machine set up to run casp?"** — not "has the
state drifted?" That second question is `casp check`'s job and its exclusive one.
`doctor` inspects the **environment**, so it is the command you run when
onboarding a repo or a machine, before the state loop even matters.

It reports `PASS` / `WARN` / `FAIL` per line but **never gates**: it **always
exits `0`**, even when it reports a `FAIL`. It is a map of what to fix, not a gate
that blocks anything — `check` remains the only gate. (Contrast `casp check`,
which exits `1` on drift so it can guard a push.)

Deterministic and local-only: no network, no LLM. It reuses the same directory
resolver and pre-push-hook detection as the rest of the binary, so its verdicts
never diverge from what `check` / `install-hook` would conclude.

## What it checks

| Check id | What it verifies |
|---|---|
| `node.version` | Node is at or above the required major (>= 20). |
| `git.present` | The `git` binary is on `PATH` (with its version string). |
| `git.repo` | The current directory is inside a git work tree. |
| `state.present` / `state.valid` | `casp/state.json` exists and parses as JSON. |
| `cockpit.version` | The CASP version stamped in `state.json` (`casp_version`) vs the installed CLI. `PASS` when equal; `WARN` when the cockpit is older (run `casp upgrade`), when it carries no stamp at all (scaffolded before version tracking), or when it was stamped by a *newer* CASP than the one installed. |
| `dirs.sessions_dir` / `dirs.logs_dir` | The resolved sessions / logs directories exist on disk. |
| `git.hooks_path` | Whether `core.hooksPath` is set (git would then ignore `.git/hooks`). |
| `hook.pre_push` | Whether a CASP-managed pre-push gate is installed (vs. absent or foreign). |

`WARN` is the severity for "workable but worth fixing" (no pre-push hook yet, a
missing sessions dir a fresh project has not created); `FAIL` is for "casp cannot
run properly here" (no Node, no git, no/invalid `state.json`).

## `--json`

`casp doctor --json` emits the same diagnostic as structured data and still exits
`0`. Same stability promise as the other JSON surfaces: `schema_version` bumps
only on a breaking shape change; additive fields do not bump it.

```json
{
  "schema_version": 1,
  "casp_version": "0.9.0",
  "node": "v22.17.1",
  "summary": { "pass": 7, "warn": 1, "fail": 0 },
  "checks": [
    { "id": "node.version", "severity": "pass", "label": "Node v22.17.1 (>= 20)", "detail": "" },
    { "id": "hook.pre_push", "severity": "warn", "label": "no pre-push hook installed", "detail": "run `casp install-hook` to run casp check automatically on every push" }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | number | Version of this document shape. `1` today. |
| `casp_version` | string | The CASP release that produced the report. |
| `node` | string | The Node version doctor ran under (`process.version`). |
| `summary` | object | `pass` / `warn` / `fail` counts over `checks`. |
| `checks[]` | array | One entry per probe, in run order. |
| `checks[].id` | string | Stable check identifier (dot-namespaced). |
| `checks[].severity` | `"pass"` \| `"warn"` \| `"fail"` | None of them gate — the process always exits `0`. |
| `checks[].label` | string | Human-readable one-liner. |
| `checks[].detail` | string | Context / remediation hint (may be empty). |
