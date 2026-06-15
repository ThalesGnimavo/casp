# What I'm doing NOW

> **Updated** : 2026-06-15 (session 26-06-15-001).
>
> **Read this first.** The single most important file in casp/. "Where am I?" has a one-screen answer here.

---

## Current focus (1 sentence)

**0.4.1 shipped + published — fresh `init` now checks green out of the box** (scaffolds the first prompt + session dirs; found onboarding a downstream project). Builds on 0.4.0's close loop (`ship`/`close`), opt-in migrations, `check --all`. 29/29 tests. **Next is resequenced: `PHASE-CONFIGURABLE-PATHS.md`** (configurable `sessions_dir`/`logs_dir`, ahead of install-hook) — and it now also carries Part B, the marketing/docs reconciliation (five→seven verbs, version, drop stale `casp lint`) across casp-website + private-docs. Multi-repo session; casp-website auto-deploys on push.

---

## Concrete next action if I have…

### 15 minutes

`casp next` → opens `PHASE-CONFIGURABLE-PATHS.md`. Read it end to end; it's a two-part, multi-repo session.

### 1 hour

Part A: the resolver in `shared.ts` + make every check honor `sessions_dir`/`logs_dir`; keep existing tests green.

### Half a day

Part A (0.5.0) closed, then Part B — the marketing/docs reconciliation (five→seven verbs, version 0.2.1→0.4.1, drop stale `casp lint`) across casp-website (auto-deploys) + private-docs.

---

## Don't get distracted by

These items are NOT on the Next-3 (still or newly) :

- **`project_kind` / multi-track state** — cut/refused in the 0.4 discussion; multi-track is one cockpit per track + `check --all`, no new schema.
- **Anything in `PHASE-DEMAND-GATED-TAIL.md`** — queue marker, demand-gated; split + CEO trigger before any of it runs.
- **`casp lint`** — cut for good.

---

## Constraints active today

- `npm publish` is a separate CEO-gated act — never bundled into a feature session. 0.4.0 is built and green locally; it is not on npm until the CEO publishes.
- The "five verbs" marketing copy (homepage + presentation) is now inaccurate — a docs-only pass, not a code session, reconciles it.
- `npx @justethales/casp check` is mandatory before push when the casp state was bumped.

---

## How to use this file

- **Start of session** : `npx @justethales/casp status` reads this + state.json + the next-prompt preview + last 10 commits in one command.
- **End of session** : overwrite the three blocks (focus, next-actions-by-budget, don't-get-distracted). No paragraphs, no narrative — mirror the shape of this file.
- **Before push** : `npx @justethales/casp check` exits 0. If FAIL, fix inline.
- **When "don't get distracted" feels limiting** : that's the point. If you need to break it, justify in `roadmap.md` first.
