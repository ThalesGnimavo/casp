---
phase: readme-onboarding-rewrite
---

# 26-07-21-005 — README rewritten for first-read comprehension (docs + metadata, no code)

## The defect

`README.md` opened with a 150-word blockquote that named the category
("deterministic floor of the self-verification loop", "the complement to
long-running autonomous models") before naming the problem. Every claim in it was
accurate; none of it was **concrete**. A reader who has not already met the
category has nothing to attach it to, and the first screen of a package README is
the whole decision surface — on npmjs.com it is what the reader sees before
scrolling.

The same file serves **both** rendering contexts: GitHub reads it from the repo,
npm reads it from the published tarball (`files[]` includes `README.md`). There is
no second README to write.

## What changed

**`README.md` — the opening.** The lede now leads with the failure the reader has
experienced — *"Your agent says the phase shipped. Git says it didn't."* — then
states the mechanism in one sentence (reads the claims, checks them against git,
exits non-zero on disagreement), then the constraints (no LLM, no network, no
account) and the wedge line. The wedge, the categorical contrast and the
"validates, does not store" posture are all preserved; only the order and the
abstraction level changed.

**`README.md` — proof moved above the fold.** The `casp check` FAIL output was
buried at line ~232, under ten numbered sections. A trimmed version now sits
directly under the install block, followed by one line stating the concrete
consequence of not having the gate (the next session re-ships the shipped phase).
The duplicate block in *What the validator catches* was removed — that section
keeps its rule catalogue and now runs straight into it.

**`README.md` — the command deck split in two.** Section 07 was a single
18-row table whose cells document flags. It is a good reference and a bad
introduction. It is now:

- **The five that are the protocol** — `init`, `status`, `check`, `next`, `new`,
  described by what they do *for the reader*, no flags. This matches the naming
  canon, where those five are the protocol and everything since is tooling
  ergonomics layered on top.
- **The full reference** — the original table, unmodified, every flag intact.

The duplication is deliberate: the first table is the on-ramp, the second is the
lookup. No documentation was lost.

**`package.json` — `description`.** It was 380 characters. npm truncates the
search-result snippet well before that, so the operative sentence never reached
anyone browsing `npm search` or the npmjs.com listing. Rewritten to 220, with the
problem statement and the mechanism both landing inside the first ~130
characters.

## What was deliberately NOT changed

- **The wedge line, the positioning canon, the anti-claims.** No "memory", no
  superlative, no probabilistic verb. The categorical contrast (validates vs
  stores, deterministic vs probabilistic) survives verbatim.
- **Sections 01-10 below the fold.** They are dense on purpose; the problem was
  the on-ramp, not the reference.
- **The author credit** (session 004) — kept in place, unchanged, in its existing
  position after the "works with" line.
- **Long-tail keywords.** Concrete problem phrasing ("agent says the phase
  shipped", "state file that lies") is *better* search-intent matching than the
  abstract category was, not worse. `keywords[]` untouched.

## Removed

- `> Pre-flight check + black box for AI coding sessions.` — an orphan blockquote
  with no section around it. "Black box" is also a flight-recorder metaphor, i.e.
  a *storage* metaphor, which is the one framing the positioning canon rules out.

## Verify

- `npm test` — **121 pass, 0 fail**. Nothing in the binary reads `description` or
  the README; the suite is a regression check, not a proof of the change.
- `jq -e` on `package.json` — valid JSON, `description` length 220. Edited by
  surgical string replacement, not by re-serializing the file, so no other field
  was re-encoded.
- `casp check` — **16 PASS, 0 WARN, 0 FAIL**, exit 0.

## Reachability caveat (unchanged from 004)

**npmjs.com does not show any of this until the next publish.** `README.md` and
`package.json` ship inside the tarball, so the rewrite reaches the package page
when the next version ships (`facts-layer`), not before. GitHub reflects it on
push.
