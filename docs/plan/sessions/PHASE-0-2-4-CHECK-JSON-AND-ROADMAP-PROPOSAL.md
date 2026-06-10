---
status: shipped
session_id: 26-06-10-001-check-json-and-roadmap-proposal
session_log: session-logs/26-06-10-001-check-json-and-roadmap-proposal.md
drafted_at: 2026-06-10
next_after: 0.2.3-autonomous-era-repositioning
---

# Session — 0.2.4 : `casp check --json` + roadmap proposal + CASP-on-CASP

> **Status : SHIPPED.** Formalization of the CEO brief
> `internal notes/fable-brief-casp-roadmap-proposal.md` (authored outside the
> repo, by a session without filesystem access — its rails pointer
> `casp-optimized-roadmap.md` does not exist; the rails were taken from the
> brief's inline statement).
>
> **Goal.** Ship the one pre-agreed Tier-1 item (`casp check --json`, additive,
> verdict logic untouched) and write `private-docs/casp-roadmap-proposal.md (internal, outside this repo)` — every backlog
> item tagged protocol/tooling, justified or cut, ordered by leverage — for CEO
> validation before anything else is executed.
>
> **Why now.** `--json` is the substrate for hooks, CI annotations, roll-ups and
> the user-land answer to notifications; the proposal gates all contested work.

**Project root.** `/Users/juste/ZeroSuite/casp-sh/casp-core`
**Branch.** `feat/check-json-roadmap-proposal` — do **not** merge; two-auditor audit + CEO validation gate the merge.
**Session log target.** `session-logs/26-06-10-001-check-json-and-roadmap-proposal.md`.
**Expected size.** 2-3 h. No schema change to defaults. No migration. No UI.

---

## SCOPE (must-have → should-have → defer)

### MUST HAVE — ship these or don't push

1. **`src/check.ts`** — `--json` flag: structured findings (`id`, `severity`, `label`, `detail`, `fix`), `verdict`, `exit_code`, `summary`, `schema_version: 1`, `casp_version`. Early-exit paths (missing/invalid state.json) also emit JSON. Default output byte-identical; exit code untouched.
2. **`docs/check-json.md`** — the stable schema, documented, with the stability contract.
3. **`test/check.test.mjs`** — clean/drift/missing-state JSON contract + default-format guard.
4. **`private-docs/casp-roadmap-proposal.md (internal, outside this repo)`** — tiers, protocol/tooling tags, cuts with arguments, restraint section, hygiene flags.
5. **CASP-on-CASP** — `casp/` cockpit in this repo, `casp check` exits 0 before push.

### DEFER

- Everything in the proposal's Tier 1-3 — gated on CEO validation.

---

## DO NOT

- **Do not touch the public README roadmap section.** The proposal replaces it only after validation.
- **Do not implement anything from the anti-roadmap** (orchestration, code review, LLM in check, PM surface, harness UI).
- **Do not fix the `cockpit → casp` naming residue** — separate cross-project chore; flag only.

---

*Self-contained. Verify = `npm test` green + `casp check` exit 0 on this repo + audit before merge.*
