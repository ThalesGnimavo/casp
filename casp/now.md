# What I'm doing NOW

> **Updated** : 2026-06-10 (session 26-06-10-002).
>
> **Read this first.** The single most important file in casp/. "Where am I?" has a one-screen answer here.

---

## Current focus (1 sentence)

**Roadmap proposal validated; the two correctness fixes shipped as 0.3.0** on branch `fix/false-green-and-state-bump`: the **false-green fix** (a claim whose backing dir is missing now FAILs — verdict-changing, 12/12 tests) and the **state-bump recognition** (the canonical close loop now reads PASS — `casp check` on this repo is **13 PASS · 0 WARN · 0 FAIL**, fully green for the first time). The validated queue is materialized as 7 drafted prompts in `docs/plan/sessions/`; `next_prompt` points at `PHASE-INSTALL-HOOK.md`. **Branch not merged**: the two-auditor review of the check-logic change gates everything.

---

## Concrete next action if I have…

### 15 minutes

Read the two auditor reports on the false-green fix; if both GO, merge `fix/false-green-and-state-bump` into main.

### 1 hour

Merge, publish 0.3.0 to npm, then **re-run `casp check` with the new binary on every ZeroSuite repo that uses CASP** (SENEBA, Conductor, …) — some greens may have been false-green.

### Half a day

All of the above, then run `casp next` and execute `PHASE-INSTALL-HOOK.md`.

---

## Don't get distracted by

These items are NOT on the Next-3 (still or newly) :

- **Anything in `PHASE-DEMAND-GATED-TAIL.md`** — queue marker, demand-gated; split + CEO trigger before any of it runs.
- **`casp lint`** — cut for good; the rails doc amendment removes the advisory carve-out.
- **Naming residue** (`/cockpit` surfaces) — bundled into the slash-command-distribution item, not before.

---

## Constraints active today

- Branch `fix/false-green-and-state-bump` must NOT merge before the two independent auditors pass the check-logic change.
- 0.3.0 must NOT publish before merge; **CHANGELOG carries a verdict-change warning** that must survive into the release notes.
- After 0.3.0 ships: CEO action — re-run `casp check` across all CASP-managed repos (false-green may flip to red; that is the fix working).
- `npx @justethales/casp check` is mandatory before push when the casp state was bumped.

---

## How to use this file

- **Start of session** : `npx @justethales/casp status` reads this + state.json + the next-prompt preview + last 10 commits in one command.
- **End of session** : overwrite the three blocks (focus, next-actions-by-budget, don't-get-distracted). No paragraphs, no narrative — mirror the shape of this file.
- **Before push** : `npx @justethales/casp check` exits 0. If FAIL, fix inline.
- **When "don't get distracted" feels limiting** : that's the point. If you need to break it, justify in `roadmap.md` first.
