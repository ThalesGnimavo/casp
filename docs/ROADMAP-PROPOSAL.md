# CASP — Roadmap Proposal (for CEO validation)

> **Status: PROPOSAL.** Nothing here is committed work. Drafted 2026-06-10 on
> branch `feat/check-json-roadmap-proposal`, alongside the one pre-agreed item
> (`casp check --json`, shipped in the same branch). The public README roadmap
> is untouched until this is validated.
>
> **Rails note.** The session brief designates `casp-optimized-roadmap.md` as
> the constitution for this proposal. **That file does not exist** — not in this
> repo, not in `casp/private-docs/`. The rails used here are the ones the brief
> itself states inline: one job · gate-not-harness · protocol frozen, tooling
> grows · deterministic stays deterministic · model-agnostic + zero-telemetry
> non-negotiable · the anti-roadmap. Either write that file or adopt this
> document as its replacement — right now it is a dangling pointer.

## The bar each item was held to

- **One job.** CASP proves a project's recorded state matches git,
  deterministically, and gates on drift. An item serves that job or it is cut.
- **Protocol vs tooling.** *Protocol* = the `state.json` schema, the drift-check
  categories, the template contract, P01–P04. Changes there must clear the
  HTTP-method-rare bar: a new *deterministic, metadata-only, git-verifiable*
  check, or a key the validator needs to see ground truth. *Tooling* = anything
  else; it grows freely if it serves the job.
- **Leverage order, not ease order.** Items below are ranked by how much they
  multiply the value of the gate per line of code.

---

## Shipped in this branch (pre-agreed, uncontested)

### `casp check --json` — tooling

Machine-readable PASS/WARN/FAIL findings with a stable, versioned schema
(`docs/check-json.md`). Same checks, same exit code — format only. This is the
substrate for half of the items below (hook output, CI annotations, status
roll-ups) and it dissolves the heaviest item in `TODO.md` (see Cuts).

Also shipped while dogfooding: `casp init` no longer copies `.DS_Store` from a
local clone's templates, and the repo now runs CASP on itself (`casp/`,
session prompts, session logs — `casp check` green before push).

---

## Tier 1 — propose next (in this order)

### 1. `casp install-hook` — tooling

One verb that writes a `pre-push` git hook running `casp check --quiet`.
P03 says *"check before every push — the validator is not optional"*, but
today it is enforced by nothing except discipline. This is the cheapest item in
the entire backlog (~30 LOC, zero deps) and it converts the protocol's central
promise from aspiration to mechanism on every repo that runs it once.

**I am explicitly arguing the README order is wrong.** The public roadmap ships
this last (0.6, after configurable paths, binaries, rollback). It should ship
first: nothing else multiplies the gate, everything else decorates it.

### 2. Configurable paths — **protocol** (clears the bar)

Optional `state.json` keys — `sessions_dir`, `logs_dir` (joining the existing
`migrations_dir`) — so the validator finds ground truth in repos whose layout
is not `docs/plan/sessions/` + `session-logs/`.

Why this clears the HTTP-method-rare bar: it is not a new check, it is the
existing checks being pointed at the right directories. Today, a repo with a
different layout gets **false green** — checks 3 and 7 silently skip because
the hardcoded dirs don't exist. A validator that reports clean because it
couldn't find the files is worse than drift; it is the exact failure mode CASP
exists to kill, produced by CASP itself. Metadata-only, deterministic,
backward-compatible (defaults unchanged).

### 3. Recognize the state-bump commit in check 4 — tooling (check refinement)

Found by dogfooding this session: the canonical close loop **ends in a
permanent WARN**. You commit the session, bump `state.last_commit` to that SHA,
commit the bump — HEAD is now the bump commit, so `last_commit` is "in history
but not at HEAD" on every subsequent check, forever, on every CASP repo.

Deterministic fix, no new category: PASS when `state.last_commit` is the parent
of HEAD **and** the HEAD commit touches only `casp/`, `docs/plan/sessions/`,
`session-logs/` (one `git diff-tree --name-only HEAD`). Metadata-only,
git-verifiable, and it makes the receipt screenshot fully green instead of
"green with an explainable warning".

---

## Tier 2 — propose, lower urgency

### 4. `casp doctor` — tooling
One-shot setup check (Node version, dirs present, templates intact, skills
installed). Read-only. Lowers first-run failure rate; first-run failure is the
adoption killer for a CLI with no telemetry to reveal it.

### 5. `casp status --all` — tooling
Multi-repo one-screen roll-up (phase, next, check verdict per project),
consuming `check --json` across a config list of paths. The solo-operator and
fleet stories both want this; it ships cheaply once `--json` exists.

### 6. `casp state diff` — tooling
How `state.json` evolved between two commits (phase advanced, `next_prompt`
changed, migrations added). Deterministic, git-native. Turns the "git log *is*
your compliance trail" marketing line into an inspectable feature.

---

## Tier 3 — keep on the public roadmap, demand-gated

### 7. `casp rollback` (0.5) — tooling, redefined narrowly
A state-mutation helper only: flip a shipped prompt back to queued, remove the
phase from `phases_shipped`, reset `next_prompt`, then require `casp check` to
pass. It must **not** touch code or git history — un-shipping code is git's
job. If it can't be kept that narrow, cut it.

### 8. Native binaries (0.4) — tooling (distribution)
Keep, but explicitly demand-gated. Three platforms × architectures, signing,
and a second build pipeline is real standing cost; `npx` covers non-Node shops
today. Ship when a real non-Node org asks, not before.

### 9. `casp timeline` / `casp metrics` — tooling, backlog
Read-only derivations from logs + git dates. Harmless, useful for receipts and
investor updates, zero urgency. `metrics` must stay local-compute-only or it
starts smelling like a dashboard product (anti-roadmap adjacent).

---

## Cuts (proposed removals — argue back if you disagree)

### Cut: `casp lint` via local LLM (currently on the public README roadmap)
This is the one item on the published roadmap I think is a mistake. The brand
promise is *"nothing probabilistic ever enters the gate"* — and the published
rebuttal to "won't the model solve this?" rests entirely on CASP being the
deterministic, external, non-model thing. Shipping an LLM verb inside the CASP
binary — even advisory, even local — hands every skeptic the "so you do use a
model" reply and blurs the wedge that section 6 of the positioning doc forbids
diluting. Prose-vs-reality checking is real, but it belongs in the **harness**
(an agent reading `casp/` can do it today, free) — not in the protocol's CLI.
Recommend deleting it from the README roadmap at the next docs release.

### Cut: notification channel adapters in core (`TODO.md` high-priority item)
The job does not include delivering messages. Seven adapters (Discord, Slack,
Telegram, Twilio, Messenger, SMTP, webhook) means secrets handling, retries,
rate limits, dedupe — a second product bolted to a tool whose install weight
and one-line security review are selling points. `check --json` already covers
the genuine need (drift alert on CI/cron) in user-land:
`casp check --json || curl -d @- "$WEBHOOK"`. If demand proves out, the
**most** CASP should ever carry is a single generic
`casp notify --webhook <url>` — user-owned outbound, off by default, secrets
from env. Named-platform adapters: never in core.

### Cut: `casp/last-close.json` snapshot (`TODO.md`)
Redundant with `check --json` + session logs, and it makes the protocol four
files. "Three files" is load-bearing — in the marketing, and in the protocol's
claim to minimalism. Adding a fourth artifact needs a job no existing file can
do; this one doesn't have it.

### Standing cuts (anti-roadmap, restated so they stay visible)
No orchestration (`next --auto`, runners, schedulers). No code-quality review.
No LLM inside `casp check`. No PM surface. No model selection or harness UI.

---

## New check categories — considered and mostly rejected (the restraint section)

- **`updated_at` vs git date of `state.json`** — REJECTED. `updated_at` is
  informational; a mismatch doesn't imply false state, and rebases/squashes
  would generate false FAILs. A gate that cries wolf gets removed from CI.
- **`next_phase` ∈ `phases_queued`** — REJECTED. `phases_queued` is informal
  and legitimately diverges mid-replan. Coupling them makes replanning a
  drift-FAIL, which punishes honesty.
- **Shipped prompts ↔ `phases_shipped` cross-check** — PARKED. The mapping
  from prompt slug to phase id is not deterministic today; making it so
  requires a `phase:` frontmatter key — a protocol change that doesn't clear
  the bar until a real drift incident demands it.
- **State-bump recognition** — ACCEPTED (Tier 1 #3): not a new category, a
  refinement that removes a false WARN baked into the canonical loop itself.

One accepted out of four candidates. The bar held.

---

## Hygiene flags (not roadmap items, need separate decisions)

1. **`cockpit → casp` naming residue.** The local repo directory is still
   `ZeroSuite/cockpit-skill/`, and other ZeroSuite projects may still carry
   `cockpit/` dirs from pre-0.2.0 scaffolds. Cross-project chore, deliberately
   not touched in this session.
2. **The rails file is a dangling pointer** (see header). Write
   `casp-optimized-roadmap.md` or bless this document as the rails.
3. **Version-string regression class** — fixed twice (0.1.2, 0.2.2), now also
   centralised in `shared.ts:pkgVersion()`. No action; noting the pattern.
