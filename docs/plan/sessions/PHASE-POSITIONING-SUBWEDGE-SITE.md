---
status: queued
session_id: pending
session_log: pending
drafted_at: 2026-06-17
next_after: 26-06-17-004-positioning-deterministic-floor
---

# Session — propagate the sub-wedge into the 18-language site (translation session)

> **Status: QUEUED. Site copy, casp-website, 18 languages + RTL. Follow-up to
> `26-06-17-004` which settled the wording and landed the durable English surfaces.**
> The canonical sub-wedge — **"CASP is the deterministic floor of the
> self-verification loop — the one check in 'verify your work' that isn't the model
> checking itself"** — is already canon (`private-docs/casp-positioning-autonomous-model-era.md`
> §5.1) and live in the casp-core README + constitution §2. This session ONLY does
> the casp-website propagation, which was deliberately deferred because it is a
> translation job and a half-translated site violates the constitution.

## CONTEXT — what changed in the parent session (24ebc0e → the 004 commits)
- §5.1 added to the positioning canon (sub-wedge + campaign decision, 2026-06-17 CEO).
- casp-core README hero gained the sub-wedge sentence; H1 unchanged.
- `casp-sh/CLAUDE.md` §2 reworded ("The deterministic floor, not a harness").
- casp-website was NOT touched. That is this session's whole job.

## SCOPE — casp-website only (auto-deploys on push to main)
- 18 homepages: `index.html` (en) + `es ar id vi fa he ko hi fr it pt ur de ru ja tr zh`.
- RTL set needing extra care: `ar fa he ur`.
- `roadmap.html` and `llms.txt` if they carry the wedge/positioning section.

## RULES (constitution §5)
1. **Sub-wedge leads the positioning SECTION, not the H1.** The H1 stays the concrete,
   evergreen line already on the site. Add/reword the wedge sentence beneath it.
2. **Translate the MEANING, not word-for-word.** The categorical contrast (validate vs
   store, deterministic vs probabilistic, the-check-that-isn't-the-model-checking-itself)
   must survive sharp in every language.
3. **Verbatim English, every language:** command names, flag names, terminal output
   (PASS/WARN/FAIL), code blocks, the `npm i -g @justethales/casp` line, the acronym.
4. **"gate" demoted, not deleted** — keep it as the mechanical descriptor where it reads
   plainly; do not blind-replace it with the long phrase (unusable compounds).
5. **Drop a language rather than ship it broken.** If a language's translation can't be
   made flawless this session, leave that homepage on its current wording and note it.
6. No telemetry, no analytics, no model name in evergreen copy, no superlatives.

## DO NOT
- No H1 swap. No blind `sed` of "gate". No new outbound call on casp.sh.
- Do not touch casp-core or the canon — they are already settled.

## AT END
- `casp check` green on casp-website before push.
- Close loop: implementation commit → state bump → second state-surface commit.
- Session log in `casp-website` (private repo); update the private-docs record if the
  wording shifted in translation.
- Push (justethales account dance), restore Juste-Gnimavo after.
