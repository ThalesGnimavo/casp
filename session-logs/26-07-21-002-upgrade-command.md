---
phase: 0.12.0-upgrade-command
---

# 26-07-21-002 — 0.12.0 : `casp upgrade`, refresh a cockpit's scaffolds without eating its state

**Session prompt :** `docs/plan/sessions/PHASE-UPGRADE-COMMAND.md`.
**Previous session end :** `e53350f` (0.11.0 shipped, `facts-layer` queued next).
**Delegation :** Executed inline; a read-only reviewer sub-agent audited the slice before commit.
**State at session start :** cockpit green at `0.11.0-check-shipped-log`, 102 tests, `facts-layer` the queued next slice.

## The sequencing call — made first, before any code

The queue had `facts-layer` first and `upgrade-command` second, sequenced
2026-07-20 on the argument *"a demonstrated incident beats ergonomics"*. That
argument held while `upgrade` was hypothetical. **It stopped holding the moment
0.11.0 shipped.**

0.11.0 introduced `CASP-SESSION-003`, whose adoption path runs through a changed
session-log template (the `phase:` frontmatter). Before this session there was no
way for an existing cockpit to receive that template: `init` refuses on an
existing `casp/` (`src/init.ts:56`), and `--force` calls
`copyDir(TEMPLATES, target, force=true)`, which overwrites every shipped file —
`state.json`, `now.md`, `roadmap.md` included. **The rule shipped in 0.11.0 was
unadoptable by every repo already using CASP.** Verified in the code, not
recalled.

Two further reasons to invert:

- `facts-layer` also ships a new surface (`casp/facts.json`). Doing it first
  stacks a second undeliverable scaffold on top of the first.
- `upgrade` is 2-3 h against a 218-line, six-rule phase. It unblocks the delivery
  path for everything queued behind it.

Queue is now `facts-layer` → `demand-gated-tail`; `next_prompt` is unchanged.

## Scope shipped

### A — `src/upgrade.ts` (NEW)

The verb. Design decisions worth recording:

- **The refresh list is derived, not hardcoded.** `shippedFiles()` walks the
  packaged `templates/` tree; anything not in a three-entry `DATA_FILES` denylist
  (`state.json`, `now.md`, `roadmap.md`) is a refreshable scaffold. A scaffold
  added in a future release is delivered without touching this file. The denylist
  matches on the full path *and* the basename, so a future nested template named
  after a data file is still treated as the operator's data.
- **The scaffolded-on date is data, not a template value.** `casp/README.md`
  carries `**Scaffolded** : <date>`. `upgrade` reads the existing date back out
  and re-uses it, otherwise the file would differ every day and the verb would
  never be idempotent.
- **One additive state write.** `casp_version = pkgVersion()`, round-tripped
  through the parsed object via `saveState`.

### B — The `casp_version` state key (NEW, additive, optional)

`schemas/state.schema.json` (not in `required`), `templates/state.json` (via a
new `{{VERSION}}` interpolation in `init`), and `State` in `src/shared.ts`. A
cockpit carrying no stamp is legal and PASSes `check` — pinned by a test, because
a new required key would have reddened every existing user repo on upgrade.

### C — `src/doctor.ts` — the `cockpit.version` probe

`PASS` when the stamp equals the installed CLI; `WARN` when older (pointing at
`casp upgrade`), when absent, or — the inverse anomaly — when the cockpit was
stamped by a *newer* CASP than the one installed. Never `FAIL`; doctor still
always exits 0.

### D — `src/cli.ts`, `src/help.ts` (MODIFIED)

Dispatch, the focused help block, and the top-level COMMANDS deck line.

### E — Tests (`test/upgrade.test.mjs` NEW, `test/help.test.mjs` MODIFIED)

102 → **118**.

### F — Docs (MODIFIED)

`README.md` command deck + quickstart + a `0.12` roadmap entry (and a missing
`0.10` entry restored), `docs/doctor.md` probe table, `CHANGELOG.md` 0.12.0,
`package.json` 0.11.0 → 0.12.0.

## A deliberate deviation from the prompt's MUST-HAVE list

MUST-HAVE 2 asks `upgrade` to *"add any new optional keys the current schema
defines with their default"*. **It does not, on purpose.** Every optional key the
schema defines today — `sessions_dir`, `logs_dir`, `migrations_dir`,
`migrations_applied`, `last_deep_audit` — has for its default **its own absence**:
`resolveDirs()` supplies the layout defaults at read time, and a project that
tracks no migrations and runs no batch audit is *supposed* to carry neither key.
Writing a value for an unset key would assert a claim the operator never made —
the exact failure CASP exists to catch — and would also be a data change, which
MUST-HAVE 2 forbids in the same breath. An empty defaults table would be dead
code that drifts. The comment in `runUpgrade` names the block where the first key
with a real default will land. Recorded here because it is a deviation from a
written requirement and should be auditable from the log, not only from a code
comment.

## Verify

- `npm test` — **118/118 pass**, 0 fail (102 before).
- `npm run build` — clean.
- `casp help upgrade` renders the focused block; the top-level deck alignment is
  intact (every description still starts at column 32).
- **Dogfooded on this repo**: `casp upgrade --dry-run` then `casp upgrade` — 0
  scaffolds to refresh (this cockpit was already hand-current), stamp
  `unstamped → 0.12.0`. The resulting `casp/state.json` diff is a single appended
  key: the French `notes` blob with all its accents and em dashes is byte-identical,
  which also re-proves that `saveState` does not re-encode non-ASCII.
- `casp check` exits 0.

### Post-implementation audit — verdict GO-WITH-FIXES, all five folded in before the commit

1. **An uncaught write could abort the run half-applied.** A directory where a
   scaffold belongs (`EISDIR`), an unwritable file (`EACCES`), a regular file
   where `casp/templates/` belongs (`ENOTDIR`) — each threw out of the write loop,
   printing a Node stack trace, exiting 1 from a verb whose contract is *never
   gates*, **after** writing some scaffolds and **before** the version stamp. The
   cockpit would be left half-refreshed and unstamped, so every re-run repeats the
   same partial write. This is the identical class the 0.11.0 audit fixed in
   `check` (the `isFile()` guard) — the read was guarded here, the write was not.
   Now per-file try/catch → an `error <file> (CODE)` line → the run continues to
   the stamp and to exit 0. Pinned by a test.
2. **The state key was named `version`.** `state.json` has always accepted
   arbitrary extra keys, so a project recording its *own* product version under
   `version` would have had it silently overwritten — by the one verb that
   promises every existing value stays byte-identical. Renamed `casp_version`
   everywhere.
3. **Symlinks were written through.** `casp/README.md` symlinked to a shared doc
   outside the cockpit meant `upgrade` truncated and rewrote a file it was never
   pointed at. Now `lstat`-checked, reported as `symlink`, left alone. Pinned by a
   test that asserts the out-of-cockpit target is untouched.
4. **`casp/README.md` was replaced with no warning.** It is a scaffold by design,
   but it is the one refreshable file an operator plausibly hand-edits, and the
   success line only vouches for the three data files. Its `refresh` line now
   carries `(replaces your local edits — keep notes in now.md)`, echoed in the
   README row.
5. **Date preservation was silently coupled to the README.** `canonicalContent`
   applies the `**Scaffolded**` regex to *any* shipped file containing
   `{{TODAY}}`; a future template with the placeholder and no such line would be
   rewritten with today's date on every run and idempotency would die with no test
   catching it. Added a tripwire test asserting `README.md` is the only shipped
   non-data scaffold carrying `{{TODAY}}`.

Two nice-to-haves were taken as well: a `/^\d/` sanity guard so a hand-mangled
stamp (`""`, `"abc"`) renders as *not version-stamped* rather than a blank
version in doctor's label, and a friendly message instead of an `ENOENT` stack
when the packaged `templates/` directory is missing.

The audit also surfaced a gap **outside** this slice, fixed here because it is
one test: nothing asserted that the verbs `help.ts` documents and the verbs
`cli.ts` dispatches are the same set. The hardcoded list in `test/help.test.mjs`
had fallen five verbs behind (`doctor`, `rules`, `explain`, `audit`, `version`)
without failing, and the phase's own reference notes assumed the invariant
existed. It is now checked structurally in both directions.

## CASP state + housekeeping

- This log declares `phase: 0.12.0-upgrade-command`.
- `docs/plan/sessions/PHASE-UPGRADE-COMMAND.md` frontmatter flipped queued → shipped.
- `casp/state.json`, `casp/now.md`, `casp/roadmap.md` bumped; `next_prompt` stays
  `PHASE-FACTS-LAYER.md`.

## Deferred / risks

- **Two unpublished minors are now stacked.** 0.11.0 was never published to npm,
  and 0.12.0 sits on top of it — which is awkward, because 0.12.0 is precisely the
  verb that lets an installed user adopt 0.11.0's template. They should go out
  together. Publishing remains a separate, CEO-gated act and did not happen here.
- **Key order differs between an inited and an upgraded cockpit.** `init` writes
  `casp_version` first (from the template); `upgrade` appends it last, because
  reordering an existing `state.json` would produce a noisy diff for no semantic
  gain. Cosmetic, deliberate.
- **`compareVersions` ignores prerelease suffixes** (`1.0.0-beta.1` compares equal
  to `1.0.0`). It only drives a non-gating doctor WARN, so the blast radius is one
  advisory line; noted rather than solved.
- **`upgrade` never deletes.** A scaffold the package stops shipping stays in the
  cockpit forever. Removing files is a different, riskier contract and was not in
  scope.
