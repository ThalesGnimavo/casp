---
phase: live-review-and-release
---

# 26-08-16-002 — adversarial review of `casp live`, and the two fail-open holes it found

Independent pass over the `casp live` surface that shipped in `26-08-16-001`,
run before 0.15.0 reaches npm. The brief was the contract itself: enumerate
every path through the guard and prove each degraded state exits 0. Two did
not, both reproduced against the built binary before anything was touched.
Fixed here, folded into the 0.15.0 CHANGELOG entry — 0.15.0 was never
published, so there is no 0.15.1.

**Status: the review and its fixes are complete; the release is not.** The
npm publish and the casp.sh verb-list refresh are blocked (see below).

## What the review attacked, and what it found

### 1 · `expires_at` was compared as a string — fail-CLOSED, permanently

Expiry read `cl.expires_at > nowISO()`. That is correct for every timestamp
this binary writes and wrong for every one it does not. `"not-a-date"`, the
empty string, and a `+14:00` offset spelling an instant two hours in the
**past** all sort *above* the current UTC string, so each read as valid
forever. A row is bounded by two things, TTL and a PID probe; a row with
`pid: null` has only the first. So a claims file with one malformed row
blocked its path permanently — on a verb whose module header states that a
corrupt claims file must not wedge the repo.

Expiry is parsed now (`Date.parse`). Unparseable reads as **expired**, which
is the ALLOW direction. The regression test pins four values, including an
offset-form timestamp computed at test time so it is genuinely in the past
while sorting lexically ahead of `now`.

### 2 · Two stale rows could lock a later solo session out of its own cockpit

The dormancy rule is the load-bearing piece of the three-state model: reserved
paths are enforced only when a controller is declared **and** another lane is
held, so a solo session is never blocked from `casp/state.json`. The arming
condition tested only that both rows were un-expired. Rows carrying no PID are
bounded solely by the 480-minute default TTL — so a controller row and a lane
row left behind by two sessions that died hours earlier armed the category
against a **brand-new, unrelated, solo session** and refused its writes to its
own cockpit until the TTL ran out. The number-one trap of the design, arriving
through the back door rather than the front.

Arming now requires both rows to be **PID-backed and probed alive**. A
PID-less row still binds its own path — that is the claimer's explicit intent
and it is advisory — but it no longer extends the reserved category over a
third party's shared state on no evidence at all. The cost is stated rather
than hidden: a harness that exports no process id gets claims without reserved
enforcement. When the evidence is absent the answer is ALLOW, every time.

### 3 · Four smaller findings from the same pass

- **The `PreToolUse` hook was a writer of `claims.json`.** Pruning persisted
  the pruned file on every read, which put the hottest path in the system —
  one run per tool call, across N sessions — into a last-writer-wins race with
  no compare-and-swap. The interleaving that matters is a prune holding a
  pre-claim snapshot landing *after* a fresh `claim`, silently dropping a claim
  that was reported taken. It did **not** reproduce in 12 forced trials (the
  window is one write per pruning event, and a hook with nothing to prune never
  wrote), but it is structurally real and the cure is free: prune in memory,
  let the mutating commands persist it. The regression asserts the claims file
  is byte-identical after a hook run.
- **The journal grew without bound.** Every `PostToolUse` appended a line
  forever, and `tail` / `watch` read the whole file. It now rolls at 5 MB into
  `journal.1.jsonl`. Two generations, lazy, on write, no daemon — `watch`
  already treated a size drop as a rotation.
- **`casp` and `session-logs` were basename entries** in the default reserved
  list, which reserved `bin/casp`. A compiled binary is not shared state, and a
  guard that blocks on a name collision is a guard people turn off. Both are
  explicit `casp/` and `session-logs/` prefixes now. User overrides keep the
  forgiving dual rule (a no-slash entry matches as a root prefix *or* as a
  basename), so an override reading `shared-types` still means the directory.
- **A subagent could be denied its parent's lane.** Ownership was the session
  id alone, and a harness is free to hand a subagent its own `session_id` —
  which would make the guard refuse a write on the very path the parent
  claimed. That is a block, the one direction this design may not fail in.
  Ownership is now the session id, or failing that the same harness process
  id, since a subagent shares its parent's process. When no PID is recorded on
  either side the test simply does not fire.

Plus: `casp live claims` announces on its first line when a kill switch is
standing the guard down (a list of claims otherwise reads as a list of things
being enforced), restores the self-`.gitignore` if it was deleted by hand, and
`--json` gained an `enforcing` boolean. `runLive` backstops any unforeseen
throw under `hook` with exit 0.

## What the review attacked and did NOT find

- **The boundary holds.** With the self-`.gitignore` in place, `casp/live/` is
  invisible to `git status` and therefore to rule 8, the only rule that reads
  the working tree. Verified against this repository's own green cockpit: 17
  PASS before and after writing live state. With the `.gitignore` deleted by
  hand, the cockpit degrades to a **non-blocking WARN** on `workdir.clean` —
  never a FAIL, never exit 1 — and the next `casp live` command restores the
  file. No code path in `src/check.ts` reads under `casp/live/`.
- **Reserved matching survives the surprising entries.** `casp-utils/x.ts` is
  not captured by `casp/`; a nested cockpit at `packages/a/casp/state.json` is
  the lane's own business and stays writable; an empty override list disables
  the category entirely.
- **Overlap detection is symmetric**, claiming the repo root is refused, paths
  outside the root are neither claimable nor policed, and `Bash` remains
  deliberately unguarded.

## Docs

- **README screen 6 — `Two sessions, one repo, no collision`.** The five-screen
  section became six. Screens 1–5 are PNG captures at 0.14.1; screen 6 is a
  **text** capture, pasted verbatim from a real run against a scratch repo, and
  the section intro says so. No mockup: the first draft of this section was a
  hand-written terminal block and was replaced with real output, which is how
  the wrong detail was caught — hook payloads carry no label, so `edit` and
  `denied` lines show raw session ids, not the friendly names a mockup assumed.
- **`docs/threat-model.md`** gains two trust-boundary rows and a section on the
  two surfaces `casp live` introduces. Hook stdin is `JSON.parse`d and read for
  four string fields, none of which reaches a shell, a git invocation, a regular
  expression, or the filesystem as anything but a relative path used for string
  comparison. `kill(pid, 0)` performs the permission and existence check of a
  signal delivery and delivers no signal; the pid comes from an untrusted file,
  and the only outcomes are exists / `ESRCH` / `EPERM` (read as alive, the
  conservative direction). The section also states the blast radius plainly —
  this is the first CASP verb that can refuse an action in *another* process —
  and the three properties that bound it. Residual, named: claim ownership is
  not authenticated, because claims are advisory coordination between
  cooperating sessions, not access control; anyone who can write
  `casp/live/claims.json` can already write the repository.

## Verification

- `npm test` — **221 pass, 0 fail** (215 before; six new regressions, one per
  reproduced case).
- `casp check` — **17 PASS · 0 WARN · 0 FAIL**.
- The pre-fix probes were re-run against the fixed binary: the stale-row
  lockout, the identity mismatch that produced it, the unparseable-timestamp
  block and the `bin/casp` false positive all now exit 0.

## Not done — the release half of this phase

- **`npm publish` 0.15.0 did not happen.** The registry is reachable and
  `@justethales/casp` reads fine unauthenticated, but the stored publish
  credential returns **401**. This is a credential problem, not a code
  problem; nothing in the package changed to cause it. `latest` on npm remains
  **0.14.2**.
- **The casp.sh verb list was not touched**, deliberately. The site must not
  announce a verb that `npm i -g` does not yet install, so that edit is
  sequenced behind the publish. Scope when it runs: the verb list in
  `llms.txt` and one roadmap entry per language in `roadmap.html` (EN, FR, ES,
  DE).
- **The site's `npm-published-version` fact was not bumped**, for the same
  reason — it currently reads 0.14.2, which is true. Writing 0.15.0 into a
  gated fact while npm serves 0.14.2 would be exactly the false claim the
  facts layer exists to catch.

The phase prompt stays at the head with status `in-progress` rather than
`shipped`: two of its four MUST HAVEs are outstanding, and marking it shipped
would be the kind of claim this project exists to make impossible.
