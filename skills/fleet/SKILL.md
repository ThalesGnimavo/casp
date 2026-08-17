---
name: fleet
description: |
  Coordinate several parallel coding-agent sessions on one repository. Turns
  the invoking session into the controller: it decides the shape (default —
  one writer plus N adversarial readers), briefs each session before it
  starts, coordinates in flight, and produces a single consolidated report.
  Not part of the CASP protocol: fleet launches sessions, therefore it
  orchestrates, and CASP never orchestrates. Use it when parallel sessions
  are a deliberate decision — never as the default mode.
---

# /fleet — several sessions, one controller

Invoking this skill makes YOUR session the **controller**. From the moment the
first worker session is launched, the controller stops producing code of its
own: it briefs, it reads, it contradicts, it consolidates.

## The boundary, first

`fleet` is distributed **by** casp. It is **not** part of CASP. Three claims,
each one testable:

1. It launches sessions, therefore it orchestrates — and orchestration is
   outside CASP by definition. Nothing here is a protocol verb.
2. No `casp check` rule reads this file or anything it produces, and nothing
   in it gates a push.
3. Its model default is **empty**. The reasoning ships — a controller and its
   workers do not need to run at the same tier, and the strongest tier is
   rarely justified for every lane — but a model name never does. Naming one
   would contradict a model-agnostic tool and date this file at the next
   release. Pick tiers per task, in your own environment, and say why.

## What the measured value is — and is not

**The measured value of a fleet is contradiction, not speed.** Nothing in the
trials that produced this skill demonstrated a speed gain, so this file does
not claim one and neither should you. What was demonstrated: workers refusing
a controller's mistaken order, and read-only reviewers surfacing defects in
code already shipped — paths that pass silently in a solo session, because a
solo session has nobody positioned to refuse it.

## The default shape: one writer, N adversarial readers

Do not propose a multi-writer fleet by reflex. The default shape is:

- **one session that writes**, and
- **one or more read-only sessions holding no lane at all**, whose entire
  mandate is to contradict: audit slices already shipped, adversarially
  review the writer's diff, refute claims instead of confirming them.

In that shape the concurrent-write family of failures is **empty by
construction** — there is nothing to collide. Departing from it requires a
written reason: a real second writing lane that actually exists, not a task
list sorted into folders. A slice whose parts are internally coupled has no
second lane, and saying so is an arbitration, not a refusal to work.

## Before launching anything

### 1. Are the project's gates isolable per session?

Answer **yes / no / not measured** — ports, databases, test fixtures — and
write the answer down before any brief. It is a **per-project property**, to
be measured rather than assumed. Two measured extremes: one trial repository
forbade more than one session outright — its end-to-end target tore down the
running stack unconditionally on fixed ports against a single shared database
— and failed **silently**; another allowed parallel gates everywhere except a
single build command, which failed **loudly, naming the shared directory**.
The readability of the failure, not its existence, is what separates a
manageable constraint from a trap: two sessions verifying on a non-isolated
harness do not produce a git conflict, they produce red runs that get blamed
on the diff. If the answer is "not measured", measuring it comes before
writing the first brief.

### 2. Shared surfaces have exactly one scribe

The cockpit (`casp/`), session logs, agent-instruction files, lockfiles,
shared type definitions, common i18n files: **nobody owns them**. The
controller is their sole scribe; workers report what needs writing and the
controller writes it. This one rule removes most collisions before any
tooling. Corollary of ordering: when a worker consumes a symbol the scribe
must add to a shared file, the shared file is committed **before** the
consumer pushes — and below it in history, so every build pinned on the
consumer's commit sees a coherent tree.

### 3. If there is more than one writer: lanes are path lists

A lane is not a domain ("the frontend"); it is an explicit **list of owned
paths**, declared before launch. A file claimed by two lanes blocks the
launch — resolve it before, not during. A worker that must touch a file
outside its lane reports it to the controller, who edits it as scribe.

### 4. Every worker starts already loaded

Do not open idle sessions and message tasks into them; launch each session
with its brief as its initial input, so it starts working immediately and is
addressable by a stable name. A lane without a written brief is not a task,
it is an intention — write the brief first, because a worker launched without
a perimeter writes everywhere.

## In flight

- **The dominant failure mode, in every trial, is a stale belief** — a
  session reasoning about shared state it stopped observing hours ago. A
  session is rarely wrong about its own work; it is wrong about everyone
  else's, and the gap grows with session length. The mitigation is mechanical:
  `git fetch` and a bounded ahead/behind report at open, and again before the
  final report. A tracking ref without a fetch is a local cache that makes a
  pushed commit look absent.
- **Commit by pathspec.** `git commit <paths>` — never `git add -A`, never
  `git commit -a`. `git commit` without a pathspec publishes the entire
  index, and the index is shared by every process in the repository: it will
  carry whatever a neighbouring session had staged, under your commit
  message. Seeing other sessions' work in `git status` is normal; leaving it
  alone is correct. Orphan diffs are collected by the controller at the end,
  in a separate, labelled commit.
- **No acknowledgment traffic.** A channel saturated with "received" hides
  the messages that matter. Write to a worker only to decide, unblock, or
  correct.
- **Never relay a refused action.** A worker whose permission was denied does
  not get a peer to run it instead — that is permission laundering. Escalate
  to the human who holds the decision.

## The controller's own limits

The controller is the bottleneck and the single point of unverified
assertion, and its self-correction degrades as it holds more lanes. The
counterweight is to measure rather than believe: recount with
`git diff --stat <start-sha>..HEAD`, paste raw verification output, and treat
any report of "0 errors" without the line that proves it as unproven.

## The final report — the reason the controller exists

One consolidated report, not one per worker:

1. **What was measured, not what was asserted** — your own recount, raw
   gate output pasted.
2. **Real collisions**, file by file — `git log --name-only` over the range;
   one file touched by two lanes is an incident to narrate even when git did
   not conflict.
3. **Orphan diffs collected**, in a separate labelled commit.
4. **The state of the shared surfaces** written on the workers' behalf.
5. **What remains open**, and who should take it.

Then update the shared surfaces, commit by pathspec, push, and stop. The next
wave needs an explicit go from the human running the fleet.

## What /fleet is NOT

- **Not a CASP feature.** See the boundary above; the protocol validates
  state against git and never launches anything.
- **Not a launcher.** This skill ships no launch script. How sessions are
  opened is environment-specific (terminal tabs, panes, a machine per
  session); the two requirements stay the same everywhere — each worker
  starts with its brief loaded, under a stable addressable name.
- **Not a lock system.** Advisory path claims are `casp live`'s job, and even
  there they never gate a push and never change a `casp check` verdict. Do not reimplement claims here —
  and do not wire them into a launcher: measured across three trials and 14
  recorded incidents, a path claim would have caught 1 and would have refused
  2 legitimate writes. The collisions that actually occur travel through the
  git index, `HEAD`, the working tree, a dev-server port, a lockfile, a build
  cache — none of which is a file-writing tool call, so no path claim sees
  them. The effective mitigations are the procedural rules above.
- **Not the default mode.** The serial queue remains the norm; a fleet is a
  per-effort decision with a stated reason and a stated cost.
- **Not sub-agents.** A fleet is made of real sessions the human sees,
  interrupts, and reads in their own terminal — not background agents that
  die with the parent session.
