---
status: queued
session_id: pending
session_log: pending
drafted_at: 2026-06-17
next_after: 26-06-17-003-casp-help
---

# Session — positioning : lead with "the deterministic floor of the self-verification loop"

> **Status: QUEUED. Positioning / copy, multi-repo. CEO call 2026-06-17.**
> The wedge leads with **"CASP is the deterministic floor of the self-verification
> loop"**, reducing reliance on "gate" as the headline metaphor.

**Scope (multi-repo).** `casp-sh/CLAUDE.md` §2 (constitution), `casp-core` README,
`casp-website` (18 language homepages + `roadmap.html` + `llms.txt`), `private-docs`
positioning canon. casp-website auto-deploys on push.

## SETTLE FIRST — before touching any surface
1. **Write the canonical new wording** in `private-docs/casp-positioning-*.md`; get
   CEO sign-off. The hero wedge must survive translation into all 18 languages with
   its meaning sharp.
2. **Decide the scope of "stop saying gate."** This is a POSITIONING-LAYER reframe,
   NOT a blind find-replace. "the deterministic floor of the self-verification loop"
   is a hero/wedge line; it does NOT substitute inline for every mechanical "gate"
   ("pre-push gate", "exit-code gate") without producing unusable compounds.
   Recommendation (CEO confirms): lead the hero + wedge with the new phrase; keep
   "gate"/"exit-code gate" only where it reads as a plain mechanical descriptor.
3. **Durability check.** The constitution requires evergreen, model-agnostic copy
   ("no model name; don't date the day the next model ships"). "self-verification
   loop" is an autonomous-agent-era framing — more durable than a model name, still
   era-bound. CEO decides: permanent homepage wedge, or campaign-level (CASP SERIES)
   framing only?

## THEN PROPAGATE
- `casp-sh/CLAUDE.md` §2 reworded (the constitution's "Gate, not harness" line).
- `casp-core` README hero + roadmap copy.
- `casp-website`: translate the MEANING of the new wedge into all 18 languages
  (LTR + RTL); command names / terminal output / install line stay verbatim English;
  `roadmap.html` + `llms.txt`. Keep the categorical contrast intact (validate vs
  store, deterministic vs probabilistic). No superlatives, no first/only/best.

## DO NOT
- No blind `sed` of "gate" → the long phrase. No telemetry. No model name in
  evergreen copy. Do not ship a poor translation — drop a language rather than ship
  it broken.

## AT END
Session log(s) in the repos touched (technical-only in public `casp-core`; the rich
record in `private-docs`). State bumps, `casp check` green on the gated repos, push
(justethales dance).
