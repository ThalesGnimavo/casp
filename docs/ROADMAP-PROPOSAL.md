# CASP — Roadmap Proposal (for CEO validation)

> **Status: PROPOSAL, v2.** Nothing here is committed work. Drafted 2026-06-10 on
> branch `feat/check-json-roadmap-proposal`, alongside the one pre-agreed item
> (`casp check --json`, shipped in the same branch). The public README roadmap
> is untouched until this is validated.
>
> **Rails.** v1 of this document was drafted against the rails as stated inline
> in the session brief, because `casp-optimized-roadmap.md` was not on disk at
> session start. The CEO delivered the file mid-session
> (`casp/private-docs/casp-optimized-roadmap.md`); this v2 is reconciled against
> it. Where I differ from the rails, the difference is argued explicitly below —
> per the brief's own instruction to pressure-test, not rubber-stamp.

## The bar each item was held to

- **One job.** CASP proves a project's recorded state matches git,
  deterministically, and gates on drift. An item serves that job or it is cut.
- **Protocol vs tooling.** *Protocol* = the `state.json` schema, the drift-check
  categories, the template contract, P01–P04. Changes there clear the
  HTTP-method-rare bar: a new *deterministic, metadata-only, git-verifiable*
  drift check, or a key the validator needs to see ground truth. *Tooling* =
  everything else; grows freely if it serves the one job.
- **Leverage order, not ease order.** The rails group thematically (Tier 1–6);
  the brief orders by leverage. Where the two disagree, I ordered by leverage
  and flagged the move.

---

## Shipped in this branch (pre-agreed, uncontested — rails Tier 1)

### `casp check --json` — tooling

Machine-readable PASS/WARN/FAIL findings with a stable, versioned schema
(`docs/check-json.md`). Same checks, same exit code — format only. Substrate
for the pre-session gate, hook output, CI annotations, roll-ups, and the
notify payload.

Also shipped while dogfooding: `casp init` no longer copies `.DS_Store` from a
local clone's templates, and the repo now runs CASP on itself (`casp/`,
session prompts, session logs — `casp check` green before push).

---

## Where I differ from the rails (the executive diff — read this first)

| # | Rails say | I propose | Why |
|---|---|---|---|
| 1 | `casp/last-close.json` close-payload snapshot (Tier 2) | **Cut; substitute `casp status --json`** | Derive, don't store. A fourth state artifact breaks "three files", can itself drift (a stored snapshot is exactly the class of unverified state CASP exists to distrust), and everything in the payload is already in `state.json` + the session log + git. A read-only `status --json`, computed on demand, gives the harness the same structured handoff with zero new stored surface. |
| 2 | Notifications Tier 6 "as the TODO frames it" (seven named adapters) | **Generic webhook only; named adapters never in core** | The TODO's *framing* (off by default, user-owned outbound, secrets from env, notify-on-red) is right and I keep all of it. The *adapter list* is a second product: per-platform auth, retries, rate limits, dedupe, bloating an install whose one-line security review is a selling point. `casp notify --webhook <url>` covers every platform via their native webhook endpoints. |
| 3 | `casp lint` allowed as separate advisory command (flag carried in) | **Drop from the public roadmap entirely** | Even clearly-labeled, an LLM verb inside the CASP binary hands every skeptic the "so you do use a model" reply, and the published rebuttal to "won't the model solve this?" rests on CASP being the deterministic non-model thing. Prose-vs-reality checking is real but belongs in the harness — an agent reading `casp/` does it today, free. Brand risk exceeds feature value. |
| 4 | `casp verify <commit>` in Tier 1 | **Tier 2** | Real compliance value, but it validates the *past*; the gates protect the *future*. No drift is prevented by verifying history. Below every enforcement item in leverage. |
| 5 | Enforcement (hook, CI installer) in Tier 3 | **Hook pulled into Tier 1** | ~30 LOC converts P03 from discipline into mechanism on every repo. Highest leverage per line in the entire backlog; thematic grouping under-ranks it. |

Everything else in the rails I adopt as-is.

---

## Tier 1 — propose next (in this order)

### 1. Pre-session gate — tooling (rails Tier 1; new since v1, accepted)

`casp next` currently prints the prompt unconditionally. Make it run the
validator first and **refuse on drift** (non-zero exit, drift report on
stderr), with `--no-check` as the explicit escape hatch. The README already
promises this behavior — *"CASP refuses to start the wrong session"* — but
today only the push boundary is gated; the start boundary is open. This closes
the loop symmetrically and is precisely what makes a harness auto-advance
(`/next`, `/loop`) safe: the agent cannot begin on a lying state. Behavior
change to `next` ⇒ minor version bump and a CHANGELOG warning.

### 2. `casp install-hook` — tooling (rails Tier 3, pulled forward)

One verb writing a `pre-push` hook that runs `casp check --quiet`. P03 says
the validator is not optional; today nothing enforces it. Cheapest item in the
backlog, multiplies everything else.

### 3. Configurable paths — **protocol** (rails Tier 5; pulled forward, clears the bar)

Optional `state.json` keys — `sessions_dir`, `logs_dir` (joining
`migrations_dir`) — so the validator finds ground truth in repos whose layout
differs. Not a new check: the existing checks pointed at the right
directories. Today a non-standard layout gets **false green** — checks 3 and 7
silently skip when the hardcoded dirs don't exist. A validator that reports
clean because it couldn't find the files is the exact failure CASP exists to
kill, produced by CASP itself. That is why this outranks its rails tier:
it's not ergonomics, it's validator correctness. Metadata-only,
backward-compatible.

### 4. Recognize the state-bump commit in check 4 — tooling (check refinement)

Found by dogfooding this session: the canonical close loop **ends in a
permanent WARN**. You commit the session, bump `state.last_commit` to that
SHA, commit the bump — HEAD is now the bump commit, so `last_commit` is "in
history but not at HEAD" on every check, forever, on every CASP repo.
Deterministic fix, no new category: PASS when `state.last_commit` is the
parent of HEAD **and** HEAD touches only `casp/`, `docs/plan/sessions/`,
`session-logs/` (one `git diff-tree --name-only`). Makes the receipt
screenshot fully green instead of "green with an explainable warning".

---

## Tier 2 — propose, lower urgency

### 5. CI status-check installer — tooling (rails Tier 3)
One command that drops the GitHub Action the homepage already advertises.
The org-level twin of `install-hook`; ships after it because repos that can't
mandate CI still benefit from the local hook.

### 6. `casp status --json` — tooling (the `last-close.json` substitute, diff #1)
The structured session handoff — current phase, next prompt, last commit,
check verdict — computed on demand from existing files. What the harness reads
before auto-advancing; what `status --all` aggregates; what the notify payload
serializes. No new stored artifact.

### 7. `casp doctor` — tooling (rails Tier 5)
One-shot setup check (Node version, dirs, templates, skills, notify config
parses). First-run failure is the adoption killer for a CLI with no telemetry
to reveal it.

### 8. `casp state diff` + `casp verify <commit>` — tooling (rails Tier 1, demoted per diff #4)
How `state.json` evolved between two commits; whether a past state was clean
(validate against a `git worktree` of that commit — deterministic, local).
Together they make "git log *is* your compliance trail" an inspectable
feature instead of a marketing line.

### 9. `casp status --all` — tooling (rails Tier 4)
Multi-repo one-screen roll-up consuming `status --json` / `check --json`
across a config list of paths. The solo-operator and fleet stories both want
it; cheap once 6 exists.

---

## Tier 3 — keep, demand-gated

### 10. Slash-command distribution — tooling/distribution (rails Tier 5)
`/casp` + `/next` as first-class installable skills rather than a `cp -r` out
of `node_modules`. The rails call it the adoption lever and that's right —
but it's distribution polish, not gate leverage, so it queues behind
enforcement. Includes reconciling the stale `/cockpit` surface (hygiene flag
below).

### 11. `casp notify --webhook <url>` — tooling (rails Tier 6, narrowed per diff #2)
User-owned outbound, off by default, secrets from env, `status` redacts,
validator FAILs on a committed token literal (that last item is itself a new
deterministic check that clears the bar). Killer use stays **notify-on-red**:
drift caught on a scheduled run. Wired after `check` exits — never "shipped"
while the validator reports drift. Named-platform adapters: not in core, not
later.

### 12. `casp rollback` (README 0.5) — tooling, redefined narrowly
State-mutation helper only: flip a shipped prompt back to queued, remove the
phase from `phases_shipped`, reset `next_prompt`, then require `casp check`
green. It must **not** touch code or git history — un-shipping code is git's
job. If it can't stay that narrow, cut it.

### 13. Native binaries (README 0.4) — tooling/distribution
Demand-gated. Platforms × architectures × signing is real standing cost;
`npx` covers non-Node shops today. Ship when a real non-Node org asks.

### 14. `casp timeline` / `casp metrics` — tooling (rails Tier 4)
Read-only, local-compute, no LLM — the explicit contrast with model-analyzed
insight stays the point. Useful for receipts; zero urgency.

---

## Cuts (proposed removals — argue back if you disagree)

- **`casp/last-close.json`** — cut per diff #1; `status --json` substitutes.
- **Named notification adapters in core** — cut per diff #2; generic webhook
  only.
- **`casp lint`** — cut from the public roadmap per diff #3. This is the one
  place I'm asking the rails to bend rather than the proposal: the rails
  permit it as advisory; I think even advisory inside the binary dilutes the
  wedge the whole positioning rests on.
- **Standing cuts (anti-roadmap, restated so they stay visible).** No
  orchestration (`next --auto` runners, schedulers — note: the Tier-1
  pre-session gate is the *gate* for the harness's auto-advance, never the
  advance itself). No code-quality review. No LLM in `casp check`, ever. No
  PM surface. No model selection or harness UI.

---

## New deterministic check categories — the rails' three candidates + mine

Rails candidates:

- **`phases_shipped[]` entry with no corresponding session-log file** —
  **ACCEPT.** Deterministic, metadata-only, git-verifiable today (array entry
  → filename convention). Extends check 3's logic from the last session to
  all of history. Supersedes the weaker prompt↔phases cross-check I parked in
  v1.
- **`now.md` `current_phase` contradicts `state.json`** — **PARK.** As prose,
  not deterministic. Becomes checkable only if the `now.md` template gains
  structured frontmatter (`current_phase:`) — a template-contract change,
  i.e. protocol bar. Worth it only if a real drift incident shows now.md
  lying in a way that matters to agents (they read `state.json`, not prose).
- **Shipped prompt references a commit outside its phase range** —
  **REJECT for now.** "Phase range" is not defined metadata anywhere in the
  spec; checking it requires inventing new protocol surface first. Park until
  the metadata exists for some other reason.

Mine (from v1):

- **State-bump recognition** — ACCEPTED (Tier 1 #4).
- **`updated_at` vs git date of `state.json`** — REJECTED. Informational
  field; rebases/squashes would generate false FAILs. A gate that cries wolf
  gets removed from CI.
- **`next_phase` ∈ `phases_queued`** — REJECTED. `phases_queued` is informal
  and legitimately diverges mid-replan; coupling them punishes honest
  replanning.
- **Committed token literal in `casp/`** — ACCEPT, but only alongside Tier 3
  #11 (it has no subject until notify config exists).

Three accepted out of seven candidates, two of them gated. The bar held.

---

## Hygiene flags (not roadmap items, need separate decisions)

1. **`cockpit → casp` naming residue.** The local repo directory is still
   `ZeroSuite/cockpit-skill/`; the rails add that the Claude Code command
   surface still shows `/cockpit` alongside `/casp`; pre-0.2.0 scaffolds
   across ZeroSuite may still carry `cockpit/` dirs. One cross-project chore,
   deliberately not touched in this session.
2. **Version-string regression class** — fixed twice (0.1.2, 0.2.2), now also
   centralised in `shared.ts:pkgVersion()`. No action; noting the pattern.
