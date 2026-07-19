---
name: audit-batch
description: |
  Run the expensive holistic verification pass — adversarial sub-agent audit +
  full e2e battery + security review — ONCE over everything merged since the
  last deep audit, not per session. This is the production-cutover gate that CASP
  separates from the cheap per-merge gate (`casp check`). It is CEO-triggered and
  never automatic. Reads the unaudited range from `casp audit status`, reviews
  the accumulated diff, and on GO advances the `last_deep_audit` watermark. Use
  before a deploy/cutover, or as the closing step of a batch of sessions — never
  as routine per-session ceremony.
---

# /audit-batch — the batched deep-audit, before a cutover

You are running the **expensive holistic pass** that must NOT run every session:
an adversarial sub-agent audit + the full e2e battery + a security review, over
**everything merged since the last deep audit**. Running this per session is what
turns a 7-minute close into 40. It runs here, once, in batch, on the CEO's call.

This does **not** replace the cheap per-session gate (`fmt` + typecheck + lint +
the touched module's own tests + `casp check`). That stays per-merge and is the
only thing gating irreversible bugs (money, cross-tenant) into `main`. This skill
is the **deploy gate**: it clears the accumulated semantic/security risk before
it reaches users.

Only run when the CEO invokes it. Never propose it as routine.

---

## 1. Preflight — scope the range

```bash
pwd
git rev-parse --abbrev-ref HEAD
npx @justethales/casp audit status
```

`casp audit status` prints the unaudited range `last_deep_audit..HEAD`, the commit
count, and the changed-file count. Read it:

- **0 commits unaudited** → nothing to do. Report "up to date, nothing to audit"
  and stop. Don't run the battery for nothing.
- **No watermark set** → this is the first deep audit. Either audit the whole tree
  (small repo) or, with the CEO's agreement, set a baseline at a known-good commit
  with `casp audit bump <sha>` and audit forward from there.
- **Watermark orphaned** (rebased away) → tell the CEO; re-baseline with a fresh
  `casp audit bump` after this pass.

Capture the exact range for the sub-agent:

```bash
WM=$(npx @justethales/casp audit status --json | jq -r '.watermark // ""')
RANGE="${WM:+$WM..}HEAD"
git diff --stat "$RANGE" | tail -40
git log --oneline "$RANGE"
```

---

## 2. Run the full verification battery — ONCE

Run the project's complete verification contract, top-level, a single time — not
per file, not per session. Use the project's documented targets:

- senndo / Make-based: `make verify` && `make e2e`
- others: the project's equivalent (`pnpm test`, `cargo test`, `pytest`, the
  `/verify-*` skill, plus whatever drives real end-to-end).

CI may already run the unit/integration suite on push — if so, don't re-run that
part; the value this pass adds over CI is the **e2e battery** and the **adversarial
audit**, which CI does not run. Capture pass/fail; a red battery is a NO-GO on its
own (record the failure, still run the audit — it may surface more).

---

## 3. Adversarial audit of the accumulated diff — ONE sub-agent

Spawn a single read-only auditor over the **range diff**, not per file and not per
session. Prefer the project's own auditor agent (e.g. `subagent_type: "auditor"`)
if one exists; otherwise a read-only Explore/general agent.

Brief it with the structured template (never a generic "review this"):

- **## Context** — what shipped across `$RANGE` (summarize the commits), the
  product's non-negotiables (money invariants, tenant isolation, auth/secrets).
- **## Files** — the changed files from `git diff --name-only $RANGE`, grouped;
  call out the critical surfaces (money/ledger, RLS/multi-tenant, auth/OTP/session,
  payments/webhooks, schema migrations).
- **## Checklist** — cross-cutting: cross-tenant leaks, privilege escalation,
  idempotency, race conditions, migration faux-vert / grants, secret/log hygiene,
  input validation, error-contract consistency, provider-spec conformance.
- **## Output** — verdict GO / GO-WITH-FIXES / NO-GO, per-item PASS/WARN/FAIL with
  `file:line`, a "Top 5 to fix", and a "deferred / nice-to-have" list.

For a large range, scope the audit to the **critical surfaces** and say so — don't
silently cap coverage; log what was and wasn't deep-audited.

---

## 4. Security review (optional, when the range touches a security surface)

If the diff touches auth, secrets, payments, webhooks, file upload, or RLS, run
`/security-review` over the range as well and fold its findings into the verdict.

---

## 5. Synthesize + apply

- Consolidate battery result + audit + security into one **GO / GO-WITH-FIXES /
  NO-GO**.
- Apply real fixes inline (they land as new commits on the branch). Re-run only the
  **targeted** tests for what you fixed, not the whole battery again.
- Document deferred items for the session log.

---

## 6. Advance the watermark — only on GO

When the verdict is GO (fixes applied, battery green):

```bash
npx @justethales/casp audit bump           # sets last_deep_audit = HEAD
git add casp/state.json
git commit -m "chore(casp): deep-audit watermark → $(git rev-parse --short HEAD)"
git push
```

On **NO-GO**: do NOT bump. Report the blockers; the watermark staying put is the
signal that the range is not clear for a cutover.

---

## Rules

- **Never run per session.** The cheap gate is `casp check` + the touched tests.
  This is the batch/deploy gate.
- **Never run automatically.** CEO-triggered only.
- **Never move the money/RLS invariant tests out of the per-session gate** to
  "save them for the batch." Those are cheap and gate the irreversible class every
  merge. This pass is for the holistic, semantic, end-to-end risk.
- **One battery run, one auditor pass.** Don't have sub-agents re-run full suites;
  pass them the range and the results.
- **Honor `pwd`.** Audit the project you're in; never a sibling's range.
- **Bump only on GO.** The watermark is a truth claim: "everything up to here
  passed a deep audit." Never advance it past unaudited or NO-GO code.

---

## Failure modes

- **`casp audit status` shows 0 unaudited** → stop; nothing to do.
- **No `casp/` state** → this project isn't on CASP; run the battery + audit
  manually over the branch and tell the CEO to `casp init` to get the watermark.
- **Battery red** → NO-GO; surface the failing target, still capture audit findings.
- **Range too large to audit deeply in one pass** → scope to critical surfaces,
  say so explicitly, and recommend a tighter cutover cadence so ranges stay small.
