# What I'm doing NOW

> **Updated** : 2026-06-15 (session 26-06-15-001).
>
> **Read this first.** The single most important file in casp/. "Where am I?" has a one-screen answer here.

---

## Current focus (1 sentence)

**0.4.0 shipped — the close loop, automated.** Two new verbs (`casp ship`, `casp close`) automate the manual state mutation that closes a session, migrations became fully opt-in (non-code cockpits carry no migration noise), and `casp check --all` gates every cockpit under a root in one report. `runCheck` was refactored around a pure `checkOne(root)` with single-root output unchanged; 28/28 tests, audited (one critical ship ordering bug caught + fixed). The validated queue **resumes at `PHASE-INSTALL-HOOK.md`** — 0.4 was resequenced ahead of it by CEO decision.

---

## Concrete next action if I have…

### 15 minutes

`npm publish` 0.4.0 (separate CEO-gated act — needs `npm login` / token), then recapture the homepage screenshots on the new verb set.

### 1 hour

Docs reconciliation pass: `CASP-PRESENTATION.md` version + stale §13, and the "five verbs" copy on `casp.sh` (now seven verbs with `ship`/`close`).

### Half a day

Run `casp next` and execute `PHASE-INSTALL-HOOK.md` (0.5 — the pre-push gate).

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
