# 26-06-17-005 — sub-wedge propagated to the casp.sh site (18 languages)

Driver session for `PHASE-POSITIONING-SUBWEDGE-SITE.md`. No casp-core code, no
protocol change, no version bump, no LLM, no telemetry — `casp check` semantics
untouched. The implementation is site copy (casp.sh) tracked in its own cockpit;
this log records the casp-core state transition (prompt shipped, queue advanced).

## What this session covered

- The casp.sh homepage positioning section (§02 "The wedge") now leads, in all 18
  languages, with the sub-wedge canonized in session 004:
  *"CASP is the deterministic floor of the self-verification loop — the one check in
  'verify your work' that isn't the model checking itself."* The evergreen H1 was
  not touched (canon: sub-wedge rides one layer below the H1, not as the H1).
- The founding-reason hero lede (already live in English) was translated into the 17
  other homepages (meaning, not word-for-word; RTL + LTR), and the homepage meta
  description was refreshed to match. `og:`/`twitter:` descriptions and §03 were
  already on-message and left as-is.
- `llms.txt` gained the sub-wedge as a citation fact.

## Why it was a separate session

Session 004 settled the canon and landed the durable English surfaces (README hero,
constitution), then deferred the 18-language site propagation here: a half-translated
homepage breaks the "drop a language rather than ship it broken" rule, so the
translation is its own gated session.

## Close

- `PHASE-POSITIONING-SUBWEDGE-SITE.md` → `status: shipped`.
- `next_prompt` → `docs/plan/sessions/PHASE-CHECK-SHIPPED-LOG.md` (next queued slice);
  `next_phase` → `check-shipped-log`. No npm publish (no code change).
- `casp check` 0 FAIL before push.
