# 26-06-10-001 — 0.2.4: `casp check --json` + CASP-on-CASP

## What shipped
- `casp check --json` — a machine-readable report (stable schema) alongside the
  human output; same checks, same exit code, different format only.
- CASP now manages its own repo (CASP-on-CASP): `casp/` cockpit scaffolded and
  validated, `casp check` green.

## Tests
- JSON report shape + exit-code parity with the human report. Suite green.
