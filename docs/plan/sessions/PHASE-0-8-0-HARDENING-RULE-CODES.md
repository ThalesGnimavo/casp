---
status: shipped
session_id: 26-07-14-001-0-8-0-hardening-rule-codes
session_log: session-logs/26-07-14-001-0-8-0-hardening-rule-codes.md
drafted_at: 2026-07-14
next_after: 26-06-17-005-subwedge-site-propagation
---

# Session — 0.8.0: hardening, rule codes, schemas, honest-claims

> **Status: SHIPPED (0.8.0).** Protocol-maturity + hardening pass. New commands
> (`rules`, `explain`) make it a minor bump; everything else is additive —
> no verdict change, `check --json` stays schema v1, all prior tests green.

## Scope

Two previously-queued orphan fixes, plus a bounded "protocol-maturity" quartet
distilled from an external design review (the maximalist items — multi-language
ports, cross-language conformance suite, governance/CIP process — were
explicitly out of scope, demand-gated).

1. **Fixes.** Pre-push hook under `set -eu` (POSIX, no `pipefail`);
   multiset-correct array delta in `state diff`; advisory
   `CASP-MIGRATION-003` WARN for a configured `migrations_dir` holding files
   while `migrations_applied` is unset.
2. **Security.** `gitArgs()` (argv → `execFileSync`, no shell) for every git
   call that interpolates untrusted input (`last_commit`, `sessions_dir` /
   `logs_dir`, CLI refs). `docs/threat-model.md`.
3. **Rule codes.** Stable `CASP-<AREA>-<NNN>` on every finding; additive `rule`
   field in `check --json`; `casp rules` + `casp explain <CODE>`; a coverage
   test guaranteeing no emitted id is unmapped.
4. **Schemas + claim scoping.** Published Draft-2020-12 JSON Schemas for state
   and check-result (shipped in the package, structural-conformance tested);
   `docs/what-casp-proves.md` (recorded-state-vs-git, and what it does NOT
   prove); `docs/rules.md`; README updated.

## Acceptance

- `npm run build` clean; `node --test` all green (74).
- `casp check` exits 0 on this repo after the state bump.
- No breaking change: `check --json` schema_version stays 1; internal finding
  ids unchanged; every finding maps to a rule code.
