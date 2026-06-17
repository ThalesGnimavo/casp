# 26-06-17-004 — positioning: lead the wedge with "the deterministic floor of the self-verification loop"

Copy/positioning only. No code, no protocol change, no version bump, no LLM,
no telemetry. `casp check` semantics untouched.

## What changed

- **README hero gains a sub-wedge sentence.** Beneath the unchanged H1
  ("The model holds the context. CASP proves the state is true — against git."),
  the hero now reads: *"It is the deterministic floor of the self-verification
  loop — the one check in 'verify your work' that isn't the model checking
  itself."* The H1 was deliberately **not** swapped — it names a structural
  division of labor (model holds context / CASP proves state vs git) and stays
  evergreen and model-agnostic.
- **"gate" demoted from headline metaphor to mechanical descriptor.** It stays
  exactly where it reads plainly ("exit-code gate", "pre-push gate", "gate, not
  harness"); no blind find-replace. The lead positioning line is now the
  deterministic-floor framing.

## Scope decision

- The casp-website propagation (sub-wedge into the 18-language homepage
  positioning section, RTL+LTR, `roadmap.html`, `llms.txt`) was **deferred to a
  dedicated follow-up**, not rushed into this session. A half-translated site
  would break the "drop a language rather than ship it broken" rule, so the
  translation is its own queued session.

## Close

- `casp check` 0 FAIL before push. `next_prompt` →
  `docs/plan/sessions/PHASE-POSITIONING-SUBWEDGE-SITE.md` (the 18-language site
  propagation). No npm publish (copy change only).
