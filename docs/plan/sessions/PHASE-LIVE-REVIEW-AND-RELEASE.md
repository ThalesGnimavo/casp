---
status: queued
session_id: pending
session_log: pending
drafted_at: 2026-08-16
next_after: 26-08-16-001-live-coordination-layer
---

# Session — live-review-and-release : adversarial review of `casp live`, then publish 0.15.0

> **Status : QUEUED.** The implementation shipped in `26-08-16-001` (new verb
> `casp live`: claims + journal + watch + hook guard, 211 tests green). This
> session is the independent pass BEFORE the release reaches npm: review the
> new surface adversarially, fix what the review finds, then publish.

**Project root.** `/Users/juste/ZeroSuite/casp-sh/casp-core`
**Expected size.** 2-3 h.

## MUST HAVE

1. **Adversarial review of `src/live.ts` + `test/live.test.mjs`**, centered on
   the two contracts the implementation claims:
   - **Fail-open.** Enumerate every path through `runHook()` and prove each
     degraded state exits 0. Special attention: concurrent `saveClaims` from
     two sessions (last-writer-wins is documented — is it actually harmless
     for every interleaving?), the PID-reuse window on `holderAlive`, clock
     skew on TTL comparison (ISO string compare), a journal that grows
     unbounded (is rotation needed before this ships, or documented as
     operator concern?).
   - **The boundary.** Prove `casp check`, `status`, `next`, the pre-push
     hook and `check --all` cannot observe anything under `casp/live/` —
     including on a cockpit where `casp/live/.gitignore` was deleted by hand.
2. **Docs pass**: README section for `casp live` (placement consistent with
   the five-screen structure), `docs/threat-model.md` addendum — the hook
   reads stdin from the harness and probes PIDs with signal 0; state why
   neither is an execution surface.
3. **Publish 0.15.0 to npm** (`npm publish` — the standing release checklist),
   then verify the published tarball: `npx @justethales/casp@0.15.0 live claims`
   in a scratch repo.
4. Refresh the casp.sh site's feature/verb list for `live` (separate repo,
   separate push; the site deploys on push to main).

## MUST NOT

- No new live subcommands, no globs in claim matching, no daemon, no LLM —
  the review evaluates what shipped, it does not extend it.
- `casp lint` stays cut; do not resurrect it in the README pass.
- Do not weaken fail-open to "fail-closed when confident". The contract is
  absolute by design.

## AT END OF SESSION

Session log, state bump (`last_commit`, `last_session_id`, phase moves,
`next_prompt`), `casp check` output pasted raw into the close message, push.
