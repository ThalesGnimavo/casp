# What I'm doing NOW

> **Updated** : 2026-06-17 (session 26-06-17-002).
>
> **Read this first.** The single most important file in casp/. "Where am I?" has a one-screen answer here.

---

## Current focus (1 sentence)

**0.6.0 shipped — both session boundaries are now gates, plus inspection.** Four verbs: `install-hook` (writes the pre-push gate), `next` now refuses on drift (the start boundary, `--no-check` waiver), `status --json` (structured snapshot + embedded verdict, never gates), and `verify <commit>` + `state diff` (read-only inspection over the git trail). 54/54 tests. Core verbs unchanged; the new verbs are tooling ergonomics. **Next is `PHASE-CHECK-SHIPPED-LOG.md`** — a verdict-changing protocol slice (tie every `phases_shipped` entry to a session log) deferred to its own session so it can't redden repos with pre-adoption history.

---

## Concrete next action if I have…

### 15 minutes

`casp next` → opens `PHASE-CHECK-SHIPPED-LOG.md`. Read it end to end; settle the deterministic mapping rule BEFORE coding.

### 1 hour

Design the mapping (phase → log) with no heuristic, plus the backfill-without-lying path for pre-cockpit phases; document it before the check category lands.

### Half a day

Implement check-shipped-log as a new FAIL category, keep casp-core green (its own pre-cockpit phases must not redden), full tests + CHANGELOG warning (verdict-changing).

---

## Don't get distracted by

These items are NOT on the Next-3 (still or newly) :

- **`project_kind` / multi-track state** — cut/refused in the 0.4 discussion; multi-track is one cockpit per track + `check --all`, no new schema.
- **Anything in `PHASE-DEMAND-GATED-TAIL.md`** — queue marker, demand-gated; split + CEO trigger before any of it runs.
- **`casp lint`** — cut for good.

---

## Constraints active today

- `npm publish` is a separate CEO-gated act — never bundled into a routine feature session.
- This is a **public** repo: session logs + `state.json` `notes` stay technical-only (CHANGELOG register). Private context goes to `private-docs/` (see `casp-sh/CLAUDE.md` §3).
- `npx @justethales/casp check` is mandatory before push when the casp state was bumped.

---

## How to use this file

- **Start of session** : `npx @justethales/casp status` reads this + state.json + the next-prompt preview + last 10 commits in one command.
- **End of session** : overwrite the three blocks (focus, next-actions-by-budget, don't-get-distracted). No paragraphs, no narrative — mirror the shape of this file.
- **Before push** : `npx @justethales/casp check` exits 0. If FAIL, fix inline.
- **When "don't get distracted" feels limiting** : that's the point. If you need to break it, justify in `roadmap.md` first.
