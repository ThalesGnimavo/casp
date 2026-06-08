# What I'm doing NOW

> **Updated** : {{TODAY}} (initial scaffold — replace at session close).
>
> **Read this first.** The single most important file in casp/. "Where am I?" has a one-screen answer here.

---

## Current focus (1 sentence)

**TODO** — describe what just shipped in one rich paragraph. Use bold sparingly to highlight the most important state. Future-you should be able to read this paragraph and reconstruct the project's working state without reading any other file.

---

## Concrete next action if I have…

### 15 minutes

TODO — the smallest-possible step that moves the next slice forward. Often a smoke test, a manual `curl`, or a single file edit. Should be doable without context switching.

### 1 hour

TODO — the next coherent unit of work. Should produce a commit-worthy diff. Usually maps to one section of the active session prompt.

### Half a day

TODO — the realistic completion target for the next session. Should produce a shippable artifact (commit + push + session log + casp state bump).

---

## Don't get distracted by

These items are NOT on the Next-3 (still or newly) :

- **TODO — item 1**, why it's deferred (when to revisit).
- **TODO — item 2**, why it's deferred.
- **TODO — item 3**, why it's deferred.

---

## Constraints active today

- TODO — date-bound constraints (launch deadlines, freezes, SLAs).
- TODO — environment constraints (envs missing, pending deploys).
- TODO — discipline constraints (rules that apply across all sessions).
- TODO — `npx @justethales/casp check` is mandatory before push when the casp state was bumped.

---

## How to use this file

- **Start of session** : `npx @justethales/casp status` reads this + state.json + the next-prompt preview + last 10 commits in one command.
- **End of session** : overwrite the three blocks (focus, next-actions-by-budget, don't-get-distracted). No paragraphs, no narrative — mirror the shape of this file.
- **Before push** : `npx @justethales/casp check` exits 0. If FAIL, fix inline.
- **When "don't get distracted" feels limiting** : that's the point. If you need to break it, justify in `roadmap.md` first.
