# What I'm doing NOW

> **Updated** : 2026-06-17 (session 26-06-17-003).
>
> **Read this first.** The single most important file in casp/. "Where am I?" has a one-screen answer here.

---

## Current focus (1 sentence)

**0.7.0 shipped — `casp help` first-class + per-command help.** `casp help` exits 0 (was unknown-command exit 1); `casp help <command>` and `casp <command> --help` print a focused per-command block for all 11 verbs; top-level help gains a `THE LOOP` section; unknown commands degrade gracefully. 63/63 tests. Tooling ergonomics only — `casp check` semantics unchanged. **Not yet published to npm** (`npm publish` is a separate CEO-gated act). **Next is `PHASE-POSITIONING-DETERMINISTIC-FLOOR.md`** — lead the wedge with "the deterministic floor of the self-verification loop" (multi-repo copy; settle wording in private-docs before propagating). `check-shipped-log` (verdict-changing protocol slice) follows.

---

## Concrete next action if I have…

### 15 minutes

`casp next` → opens `PHASE-POSITIONING-DETERMINISTIC-FLOOR.md`. Read the private-docs positioning canon (`casp-positioning-autonomous-model-era.md`) before touching any copy.

### 1 hour

Settle the new wedge wording in `private-docs/` FIRST — "the deterministic floor of the self-verification loop". Not a blind find-replace of "gate"; the validate-not-store / deterministic-not-probabilistic contrast must survive.

### Half a day

Propagate the settled wording across the README, the homepage-content source, and the roadmap copy — multi-repo, but core copy and site copy stay consistent. Honor the naming canon (never "memory", no superlatives, model-agnostic in evergreen copy).

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
