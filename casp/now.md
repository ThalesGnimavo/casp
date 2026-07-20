# What I'm doing NOW

> **Updated** : 2026-07-20 (session 26-07-20-001).
>
> **Read this first.** The single most important file in casp/. "Where am I?" has a one-screen answer here.

---

## Current focus (1 sentence)

**0.10.0 shipped + published to npm — `casp audit`, the deep-audit watermark** (`audit status` / `audit bump`, optional `last_deep_audit` state field, `/audit-batch` skill; a production-cutover gate, never a merge gate — `casp check` gains no rule). 92/92 tests. The cockpit itself drifted around that release (shipped 2026-07-19 with no log, no state bump) and was **regularized on 2026-07-20** — see `session-logs/26-07-20-001-regularize-0-10-0-and-queue-facts-layer.md`. **Next is `PHASE-CHECK-SHIPPED-LOG.md`** (verdict-changing protocol slice), then the newly queued `facts-layer` (opt-in `casp/facts.json`, six deterministic `CASP-FACT` rules — prove freshness, not truth), then `upgrade-command`.

---

## Concrete next action if I have…

### 15 minutes

`casp next` → opens `PHASE-CHECK-SHIPPED-LOG.md`. Its non-negotiable: settle the deterministic `phases_shipped[]` ↔ session-log mapping + the backfill-without-lying rule BEFORE coding — no fuzzy matching, no guessing.

### 1 hour

Start `check-shipped-log` for real: the mapping decision, the pre-adoption behavior (must not redden existing repos), then the rule + tests.

### Half a day

Ship `check-shipped-log` end to end (rule, tests, docs/rules.md, CHANGELOG), close the loop, and re-point `next_prompt` at `PHASE-FACTS-LAYER.md`.

---

## Don't get distracted by

These items are NOT on the Next-3 (still or newly) :

- **`facts-layer` implementation** — queued AFTER `check-shipped-log`; the prompt is drafted and sequenced, don't start it early.
- **Anything in `PHASE-DEMAND-GATED-TAIL.md`** — queue marker, demand-gated; split + CEO trigger before any of it runs.
- **`casp chain <N>`** — parked, gated on real-marathon evidence (see roadmap).
- **`casp lint`** — cut for good.

---

## Constraints active today

- `npm publish` is a separate CEO-gated act — never bundled into a routine feature session.
- This is a **public** repo: session logs, phase prompts + `state.json` `notes` stay technical-only (CHANGELOG register). Private context goes to `private-docs/` (see `casp-sh/CLAUDE.md` §3).
- `npx @justethales/casp check` is mandatory before push when the casp state was bumped.

---

## How to use this file

- **Start of session** : `npx @justethales/casp status` reads this + state.json + the next-prompt preview + last 10 commits in one command.
- **End of session** : overwrite the three blocks (focus, next-actions-by-budget, don't-get-distracted). No paragraphs, no narrative — mirror the shape of this file.
- **Before push** : `npx @justethales/casp check` exits 0. If FAIL, fix inline.
- **When "don't get distracted" feels limiting** : that's the point. If you need to break it, justify in `roadmap.md` first.
