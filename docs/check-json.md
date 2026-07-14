# `casp check --json` — machine-readable report schema

`casp check --json` runs the exact same validator as `casp check` and exits with
the exact same code (clean → `0`, drift → `1`). The flag changes the **format**
of the report, never the verdict logic. The default human-readable output is
untouched; `--quiet` has no effect when `--json` is set (the JSON report is
always complete).

Consumers: CI annotations, pre-push hooks, notification payloads, multi-project
status roll-ups — anything that should react to drift without scraping ANSI
text.

## Stability contract

- `schema_version` identifies the shape of this document. It bumps **only on a
  breaking change** (a field removed, renamed, or retyped). New fields may be
  added without a bump — parse leniently.
- Finding `id` values are internal identifiers (e.g. `next_prompt.status`,
  `last_commit.git`, `migrations.match`). They are stable in practice, but for a
  guaranteed-stable public reference prefer `findings[].rule` — the
  `CASP-<AREA>-<NNN>` code, which changes only through an explicit deprecation.
- `findings[].rule` is an **additive** field (introduced without a
  `schema_version` bump). It is the stable rule code; see
  [rules.md](./rules.md) and `casp explain <CODE>`.
- `exit_code` in the document always equals the process exit code.

## Document shape (v1)

```json
{
  "schema_version": 1,
  "casp_version": "0.2.4",
  "verdict": "drift",
  "exit_code": 1,
  "summary": { "pass": 12, "warn": 1, "fail": 1 },
  "findings": [
    {
      "id": "next_prompt.status",
      "rule": "CASP-PROMPT-003",
      "severity": "fail",
      "label": "next_prompt is already SHIPPED",
      "detail": "docs/plan/sessions/PHASE-1-AUTH.md has status: shipped — casp was not bumped after that session",
      "fix": "either update state.json.next_prompt to the real next slice, or re-execute the shipped prompt explicitly"
    }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | number | Version of this document shape. `1` today. |
| `casp_version` | string | The CASP release that produced the report. |
| `verdict` | `"clean"` \| `"drift"` | `clean` ⇔ zero `fail` findings ⇔ exit 0. Warnings never flip the verdict. |
| `exit_code` | `0` \| `1` | Mirrors the process exit code. |
| `summary` | object | `pass` / `warn` / `fail` counts. They always add up to `findings.length`. |
| `findings[]` | array | One entry per check performed, in execution order — including passes, so the report is a complete audit record, not just an error list. |
| `findings[].id` | string | Internal check identifier (dot-namespaced). |
| `findings[].rule` | string \| null | Stable public rule code (`CASP-<AREA>-<NNN>`). Prefer this for durable references; see [rules.md](./rules.md). |
| `findings[].severity` | `"pass"` \| `"warn"` \| `"fail"` | Only `fail` blocks the push. |
| `findings[].label` | string | Human-readable one-liner (same text as the default output). |
| `findings[].detail` | string | Context: paths, SHAs, expected-vs-found. May be empty. |
| `findings[].fix` | string \| null | The `→ fix` hint when one exists, `null` otherwise (always `null` on `pass`). |

## Errors before validation

When the validator cannot even start (`casp/state.json` missing or not valid
JSON), `--json` still emits a well-formed v1 document with a single `fail`
finding whose `id` is `state.file`, and exits `1`. A consumer never has to
handle a non-JSON response on stdout.

## Examples

Fail a CI job with annotations:

```bash
casp check --json | jq -r '.findings[] | select(.severity=="fail") | "::error::\(.label) — \(.detail)"'
```

Fire a user-owned webhook on drift (no notification subsystem needed):

```bash
report=$(casp check --json) || curl -s -X POST "$WEBHOOK_URL" \
  -H 'content-type: application/json' -d "$report"
```
