# What I'm doing NOW

> **Updated** : 2026-07-21 (session 26-07-21-001 — 0.11.0).
>
> **Read this first.** The single most important file in casp/. "Where am I?" has a one-screen answer here.

---

## Current focus (1 sentence)

**0.11.0 built — `CASP-SESSION-003`, the first new drift category since rule codes.** Every `phases_shipped[]` entry must be declared by a session log carrying `phase:` in its frontmatter. The mapping is **declared, never inferred** (filenames would need the fuzzy match the protocol bans), and adoption is **derived from the data** with no new state key: the first shipped entry any log declares opens the enforcement window, everything before it is exempt as pre-adoption, and a repo where no log declares anything gets no finding at all. 100/100 tests. **This repo dogfoods it from this session on** — the 0.11.0 log declares its phase, so the window opens there and the 21 earlier entries stay exempt. **Not yet published to npm** (separate CEO-gated act). Next is `PHASE-FACTS-LAYER.md`, then `upgrade-command`.

---

## Concrete next action if I have…

### 15 minutes

`casp next` → opens `PHASE-FACTS-LAYER.md`. Read its rule table (`CASP-FACT-001..006`) and the red line it must not cross: freshness, never truth; zero LLM.

### 1 hour

Settle the `casp/facts.json` shape and the six rules' evidence sources before any code — the same discipline that made `check-shipped-log` land clean was settling the mapping first.

### Half a day

Ship `facts-layer` end to end (opt-in file, six rules, tests, docs/rules.md, CHANGELOG), close the loop, re-point `next_prompt` at `PHASE-UPGRADE-COMMAND.md`.

---

## Don't get distracted by

These items are NOT on the Next-3 (still or newly) :

- **Publishing 0.11.0 to npm** — a separate CEO-gated act, never bundled into a feature session.
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
