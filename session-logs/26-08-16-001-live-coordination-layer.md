---
phase: live-coordination-layer
---

# 26-08-16-001 — `casp live`: the in-flight record next to the durable one

New verb shipped: `casp live` — ephemeral coordination between N parallel
agent sessions on one machine. Claims (advisory path locks, TTL + holder
liveness), an append-only journal fed by harness lifecycle hooks, a live human
view (`watch`), and a `PreToolUse` guard that blocks a foreign edit on a
claimed path with the owner named. Full rationale in the 0.15.0 CHANGELOG
entry; this log records what the entry does not.

## Design decisions and their reasons

- **Share state, not the chat stream.** The alternative considered was a
  shared message stream all sessions read. Rejected on cost shape (every
  message lands in N contexts and invalidates N prompt caches) and on quality
  (context pollution). The journal gives the human the full stream — reading
  files is free for humans — while each agent's context receives nothing it
  did not ask for.
- **Fail-open as an absolute, requested as a review guard-rail before this
  session pushed.** Two external review requirements were folded in
  mid-session: (1) TTL plus a liveness probe on the holder's PID, with the
  default on ANY doubt being allow — a crashed session must never hold a repo;
  (2) kill switches that require no file edit (`CASP_LIVE=0`, `casp live off
  [--global]`), because a misfiring PreToolUse guard blocks file writes,
  which is precisely the state in which "edit your settings to disable it"
  becomes a circular trap. A globally-installed hook has a machine-sized
  blast radius; the off ramp is machine-sized too.
- **`casp check` and `casp live` never meet.** `casp/live/` self-writes its
  `.gitignore` on first touch, so runtime churn cannot reach `git status` or
  any state-vs-git comparison. The gate's meaning is unchanged; live is
  ergonomics, not protocol.
- **Segment-boundary prefixes, no globs.** `src/app` covers `src/app/x.ts`
  and never `src/apples.ts`. Explainable in one sentence, deterministic, and
  covers the observed use case (claiming a directory or a file).
- **Bash is deliberately unguarded.** Parsing arbitrary shell for file
  targets is guesswork; a guard that guesses is worse than one with a
  documented blind spot. Same posture for symlinked roots: the path
  comparison stands down (ALLOW) rather than police what it cannot
  normalize — with the macOS `/var → /private/var` tmpdir alias as the
  canonical example (it surfaced in this session's own test run).

## Tests

200 → 211 (`test/live.test.mjs`). The suite pins the two contracts by name:
fail-open (expired claim, dead-PID holder, corrupt claims file, malformed
stdin, unknown event, all three kill switches — every one exits 0) and the
boundary (`casp/live/.gitignore` written on first touch). Plus: bidirectional
overlap refusal, segment-boundary matching, owner-vs-foreign guard verdicts,
journal contents, out-of-repo paths refused and unpoliced.

Two test-side fixes worth recording: tmpdir realpath (macOS symlink alias
made every payload path read as outside the repo — fail-open then masks the
regression the test exists to catch), and env-override order in the spawn
helper (the scrub of `CASP_LIVE` ran after the test's override, silently
disarming the kill-switch test).

## Not done, deliberately

- No README section yet, no npm publish, no site update — queued as
  `PHASE-LIVE-REVIEW-AND-RELEASE.md`: an adversarial review of the new
  surface gates the release, and publish is a deliberate separate act.
- No journal rotation. Flagged to the review session as a question, not
  silently decided.
