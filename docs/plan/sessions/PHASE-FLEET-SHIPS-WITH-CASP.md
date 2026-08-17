---
status: queued
session_id: pending
session_log: pending
drafted_at: 2026-08-17
next_after: PHASE-LIVE-REVIEW-AND-RELEASE
---

# Session — fleet-ships-with-casp : ship the `fleet` skill in the package, and say plainly it is not CASP

**Project root.** `casp-core`
**Expected size.** 3-4 h.

## Why this exists

The package already ships Claude Code skills that are not protocol verbs
(`skills/casp`, `skills/next`, `skills/audit-batch`) — `package.json` `files`
includes `skills`. A fourth one joins them: `fleet`, which coordinates several
parallel agent sessions on one repository.

It arrives with measurements, not intentions. Three trials on three separate
repositories produced **14 recorded incidents**. A `casp live` path claim would
have caught **1** of them, and would have refused **2** writes on paths that
were entirely legitimate. That is the reason this session ships documentation
and a skill rather than the launcher wiring everyone expected: the guard is
imprecise in both directions, and the family of collisions that actually occurs
does not travel through file paths at all. It travels through the git index,
`HEAD`, the working tree, a dev-server port, a regenerated lockfile, a build
cache — none of which is a file-writing tool call.

## MUST HAVE

1. **`skills/fleet/SKILL.md`, written for the public.** The working copy is a
   private-workspace document: it names private repositories, absolute home
   directory paths, an internal role vocabulary, and a specific model tier.
   **Rewrite it, do not copy it.** Acceptance is mechanical — the shipped file
   must contain zero absolute paths, zero repository names other than this one,
   and zero model names. Grep for all three before committing.

   The content that must survive, because it is what the trials established:
   - **The default shape is one writer plus N adversarial readers.** A reader
     holds no lane at all; its whole mandate is to contradict. In that shape the
     concurrent-write family is empty by construction.
   - **The measured value is contradiction, not speed.** Nothing in the trials
     demonstrates a speed gain. Do not claim one.
   - **Ask whether the project's gates are isolable per session** (ports,
     database, fixtures) before launching anything: yes / no / not measured. It
     is a per-project property. One trial repository forbade N>1 outright and
     failed **silently**; another allowed it everywhere except one build command
     and failed **loudly, naming the shared directory**. Readability of the
     failure, not its existence, is what separates a manageable constraint from
     a trap.
   - **The dominant failure mode is a stale belief**, in all three trials —
     a session reasoning about shared state it stopped observing hours ago.
     The mitigation is a fetch-and-report at open and before the final report.
   - **Commit by pathspec.** `git commit <paths>`, never `-a`, never `git add -A`.
   - The controller becomes the bottleneck and the single point of unverified
     assertion; its self-correction degrades as it holds more lanes.

2. **A launcher decision, made explicitly and written down.** The private
   launcher is macOS- and terminal-emulator-specific. Shipping it as-is inside a
   cross-platform npm package is not obviously right. Decide between: skill
   only (the agent opens sessions however the user's environment allows), a
   documented launcher contract with no implementation, or a portable launcher.
   Whatever is chosen, state the reason in the CHANGELOG. Do not ship a
   platform-locked script silently.

3. **README — one short section, and the boundary in it.** `fleet` is
   distributed **by** casp and is not part of casp. Three claims that must be
   testable by a reader: it launches sessions, therefore it orchestrates,
   therefore it is never a CASP feature; no `casp check` reads it and none gates
   on it; its model default is empty — the reasoning ships (a controller and its
   workers need not run at the same tier), the model name never does, because
   naming one contradicts model-agnostic and dates on the next release.

4. **Version bump, CHANGELOG, and the reason the wiring is absent.** The
   CHANGELOG entry must carry the 14 / 1 / 2 count and state that wiring path
   claims into a launcher is **ruled out**, not pending — so that nobody
   re-proposes it in six months with arguments three trials already answered.
   Then publish, on the standing release checklist.

5. **`casp upgrade` on this cockpit and on the site's**, to refresh scaffolds
   and stamp `casp_version`. It never templates over `state.json`, `now.md` or
   `roadmap.md`; verify that claim rather than trusting it.

## MUST NOT

- No `casp live` behaviour change, no new verb, no schema change. This session
  ships a skill and documentation.
- **Do not wire path claims into any launcher.** Ruled out on measurement.
- Do not weaken fail-open, and do not teach `casp check` to read anything under
  `casp/live/`.
- `casp lint` stays cut.
- Do not promise a speed gain for parallel sessions anywhere in the README,
  the CHANGELOG or the skill.

## AT END OF SESSION

Session log (technical only — this repository is public), state bump
(`last_commit`, `last_session_id`, phase moves, `next_prompt`), `casp check`
output pasted raw into the close message, push.
