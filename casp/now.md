# What I'm doing NOW

> **Updated** : 2026-06-10 (session 26-06-10-001).
>
> **Read this first.** The single most important file in casp/. "Where am I?" has a one-screen answer here.

---

## Current focus (1 sentence)

**`casp check --json` shipped** (stable v1 schema, four new tests, docs in `docs/check-json.md`) on branch `feat/check-json-roadmap-proposal`, together with **`docs/ROADMAP-PROPOSAL.md`** — the full prioritized roadmap proposal awaiting CEO validation — and **CASP now manages itself** (this `casp/` cockpit is the recursive proof). The branch is deliberately **not merged**: the two-auditor post-implementation audit and the CEO's read of the proposal gate everything.

---

## Concrete next action if I have…

### 15 minutes

Read `docs/ROADMAP-PROPOSAL.md` top to bottom and mark each Tier-1 item validated / rejected / amended.

### 1 hour

Validate the proposal, merge the branch, publish 0.2.4 to npm (`npm publish` runs build via `prepublishOnly`), and queue the next session prompt for `casp install-hook` (Tier 1 #1).

### Half a day

All of the above, plus ship `casp install-hook` end-to-end (verb + hook template + tests + README section) — it is ~30 LOC and converts P03 from discipline into mechanism.

---

## Don't get distracted by

These items are NOT on the Next-3 (still or newly) :

- **Notification channel adapters** — proposed CUT in the roadmap proposal; `check --json` + a webhook one-liner covers the need without a second product in core.
- **`casp lint` (local LLM)** — proposed CUT from the public README roadmap; it hands skeptics the "so you do use a model" reply. Decide in the proposal review, not in a session.
- **`cockpit → casp` naming residue** (repo dir, old scaffolds across ZeroSuite) — real, but a separate cross-project chore.

---

## Constraints active today

- Branch `feat/check-json-roadmap-proposal` must NOT merge to main before the two-auditor post-implementation audit + CEO validation of the proposal.
- The public README roadmap section stays untouched until the proposal is validated.
- `npx @justethales/casp check` is mandatory before push when the casp state was bumped.

---

## How to use this file

- **Start of session** : `npx @justethales/casp status` reads this + state.json + the next-prompt preview + last 10 commits in one command.
- **End of session** : overwrite the three blocks (focus, next-actions-by-budget, don't-get-distracted). No paragraphs, no narrative — mirror the shape of this file.
- **Before push** : `npx @justethales/casp check` exits 0. If FAIL, fix inline.
- **When "don't get distracted" feels limiting** : that's the point. If you need to break it, justify in `roadmap.md` first.
