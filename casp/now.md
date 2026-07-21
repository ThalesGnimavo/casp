# What I'm doing NOW

> **Updated** : 2026-07-21 (session 26-07-21-002 — 0.12.0).
>
> **Read this first.** The single most important file in casp/. "Where am I?" has a one-screen answer here.

---

## Current focus (1 sentence)

**0.12.0 built — `casp upgrade`, the protocol's own continuity across releases.** An existing cockpit can now adopt a newer CASP's scaffolds without losing a byte of `state.json` / `now.md` / `roadmap.md`: the refresh list is derived from what the package ships minus a data denylist, the single state write is an additive namespaced `casp_version` stamp, and the verb never deletes, never writes through a symlink, and never gates. **The queue was inverted on purpose** — `facts-layer` was first, but 0.11.0 shipped a changed session-log template that no existing cockpit could receive, so the newest rule was unadoptable until this verb existed. 118/118 tests. **Neither 0.11.0 nor 0.12.0 is published to npm** — two stacked minors that should go out together (separate CEO-gated act). Next is `PHASE-FACTS-LAYER.md`.

---

## Concrete next action if I have…

### 15 minutes

`casp next` → opens `PHASE-FACTS-LAYER.md`. Read its rule table (`CASP-FACT-001..006`) and the red line it must not cross: freshness, never truth; zero LLM.

### 1 hour

Settle the `casp/facts.json` shape and the six rules' evidence sources before any code — the same discipline that made `check-shipped-log` and `upgrade` land clean was settling the design first.

### Half a day

Ship `facts-layer` end to end (opt-in file, six rules, tests, `docs/rules.md`, CHANGELOG), close the loop, re-point `next_prompt` at `PHASE-DEMAND-GATED-TAIL.md` — or at whatever the CEO sequences next.

---

## Don't get distracted by

These items are NOT on the Next-3 (still or newly) :

- **Publishing 0.11.0 + 0.12.0 to npm** — a separate CEO-gated act, never bundled into a feature session. Worth raising: 0.12.0 is the verb that lets installed users adopt 0.11.0's template, so the two belong in one release window.
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
