# What I'm doing NOW

> **Updated** : 2026-08-17 (session 26-08-17-001 — 0.16.0).
>
> **Read this first.** The single most important file in casp/. "Where am I?" has a one-screen answer here.

---

## Current focus (1 sentence)

**0.16.0 published — the `fleet` skill ships in the package, and says plainly it is not CASP.** A fourth Claude Code skill (`skills/fleet`, next to `/casp`, `/next`, `/audit-batch`) distills three measured multi-session trials: default shape one writer + N adversarial readers, the measured value is contradiction not speed, gates-isolable-per-session is a per-project property to measure first, commit by pathspec, stale belief is the dominant failure mode. The boundary is stated and tested: fleet launches sessions, therefore it orchestrates, therefore it is never a CASP feature; no `casp check` rule reads it; its model default is empty. Wiring path claims into a launcher is **ruled out on measurement** (14 incidents: 1 caught, 2 false refusals), not pending. 228/228 tests.

---

## Concrete next action if I have…

### 15 minutes

Nothing owed — 0.16.0 is published (`dist-tags.latest` = 0.16.0, verified from the registry) and the site's `npm-published-version` fact is re-verified at 0.16.0. `casp status` to confirm the cockpit is quiet.

### 1 hour

Only if a demand signal for `demand-gated-tail` has appeared: read `PHASE-DEMAND-GATED-TAIL.md` and bring the signal to the sequencing decision. Otherwise nothing.

### Half a day

Nothing — the head of the queue is `demand-gated-tail`, which ships on a real demand signal, not on a schedule. A head that sits untouched is the intended state. Do not invent work to fill it.

---

## Don't get distracted by

These items are NOT on the Next-3 (still or newly) :

- **Anything in `PHASE-DEMAND-GATED-TAIL.md`** — queue marker, demand-gated; a demand signal and an explicit go before any of it runs.
- **Wiring path claims into any launcher** — ruled out on measurement (see CHANGELOG 0.16.0). Do not re-propose without a measurement that overturns the 14/1/2 count.
- **Teaching `casp check` to read `casp/live/` or the fleet skill** — the wall is the product.
- **`casp chain <N>`** — parked, gated on real-marathon evidence (see roadmap).
- **`casp lint`** — cut for good.

---

## Constraints active today

- `npm publish` is a separate, deliberately gated act — never bundled into a routine feature session.
- This is a **public** repo: session logs, phase prompts + `state.json` `notes` stay technical-only (CHANGELOG register). Private context goes to `private-docs/` (see `casp-sh/CLAUDE.md` §3).
- `npx @justethales/casp check` is mandatory before push when the casp state was bumped.

---

## How to use this file

- **Start of session** : `npx @justethales/casp status` reads this + state.json + the next-prompt preview + last 10 commits in one command.
- **End of session** : overwrite the three blocks (focus, next-actions-by-budget, don't-get-distracted). No paragraphs, no narrative — mirror the shape of this file.
- **Before push** : `npx @justethales/casp check` exits 0. If FAIL, fix inline.
- **When "don't get distracted" feels limiting** : that's the point. If you need to break it, justify in `roadmap.md` first.
