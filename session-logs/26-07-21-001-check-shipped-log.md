---
phase: 0.11.0-check-shipped-log
---

# 26-07-21-001 — 0.11.0 : `CASP-SESSION-003`, shipped phases must be declared by a session log

**Session prompt :** `docs/plan/sessions/PHASE-CHECK-SHIPPED-LOG.md`.
**Previous session end :** `e0fb456` (cockpit regularization to 0.10.0, `facts-layer` queued).
**Delegation :** Executed inline; a read-only reviewer sub-agent audited the slice before commit.
**State at session start :** cockpit green at `0.10.0-audit-watermark`, 92 tests, `check-shipped-log` the queued next slice.

This is the first **new drift category** since rule codes landed in 0.8.0. A new
rule can change a repo's verdict on upgrade, so most of the design work went into
making sure it cannot redden a repo that has not opted in.

## The design decision — settled before any code

The prompt required a mapping with **no heuristic**, and the artifacts made the
choice for us. Session logs carried no frontmatter at all: they open with
`# <session-id> — <title>`. The two candidate mappings were:

- **Filename → phase id.** Rejected. `26-07-19-001-0-10-0-audit-watermark.md`
  against the phase id `0.10.0-audit-watermark` needs exactly the fuzzy match the
  prompt bans — dot/dash normalization plus a date-prefix strip is a guess wearing
  a regex.
- **A declared `phase:` key in the log's frontmatter.** Deterministic, no
  inference. Chosen — and, as the prompt anticipated, it makes the session-log
  template change part of this slice, flagged as protocol.

### Adoption is derived, not configured

The hard part is not the mapping, it is adoption. Declaring the key naively means
every repo with history — including this one, with 21 shipped phases and no
`phase:` anywhere — goes red the moment the rule ships.

Solved with **no new state key**. `phases_shipped` is ordered and append-only, so
the data already contains the watermark: the first entry any log declares is where
the convention was adopted. Every entry from that index on must be declared;
everything before it is exempt as pre-adoption, and the exempt count is printed so
a green line cannot be misread as "all of history is logged".

Three consequences, all deliberate:

- A repo where **no log declares a phase** gets **no finding at all** — silence,
  the same treatment migrations get in a project that tracks none.
- **Backfilling never lies.** Adding `phase:` to an old log that genuinely exists
  pulls the window earlier and enforces everything after it. It cannot fabricate
  a log that was never written.
- **Removing an entry from `phases_shipped` is a legitimate third fix.** A
  scoreboard that claims less than the record is not drift.

## Scope shipped

### A — `src/check.ts` (MODIFIED)

New section `3c. phases_shipped → declaring session log`, between 3b and 4.
Collects the `phase:` frontmatter (scalar or list) from every `.md` in the
resolved `logs_dir`, derives the window, and records one finding:

- `shipped_log.declared` — **PASS** when every in-window entry is declared,
  **FAIL** (with a `→ fix` hint and `expected`/`actual`) when any is not.
- Emitted only when `phases_shipped` is a non-empty array, the logs dir resolves,
  at least one log declares a phase, **and** at least one declared id is actually
  in `phases_shipped`. That last guard matters: `findIndex` returns `-1` when
  nothing matches, and `slice(-1)` would have silently enforced against the last
  entry alone. An unedited template placeholder hits exactly that path.

### B — `src/rules.ts` (MODIFIED)

`CASP-SESSION-003 — Shipped phases are declared by a session log`, area SESSION,
`matches: id.startsWith('shipped_log.')`. The registry text states the derived
window and that filenames are never consulted.

### C — `templates/templates/session-log.md`, `casp/templates/session-log.md` (MODIFIED)

Both gain YAML frontmatter with a documented `phase: <phase-id>` placeholder,
including the list form and the instruction to drop the key entirely for a session
that shipped no phase (a state-surface bump, a queue edit).

### D — `test/check.test.mjs` (MODIFIED)

Ten new tests, 92 → **102**, pinning all four regimes plus the traps:

never-adopted repo stays silent · fully declared passes · an undeclared shipped
phase FAILs and exits 1 · retroactive adoption exempts pre-adoption history and
names where the window opened · a gap after adoption still FAILs while history is
not retroactively blamed · one log declaring a list satisfies each entry · a
declared phase absent from `phases_shipped` keeps the window closed (the
`findIndex` → `slice(-1)` guard) · a suggestively-named log without `phase:` does
not count · a directory named `*.md` in the logs dir is skipped rather than
crashing the report · non-string `phase:` values (number, bool, null, nested map)
are ignored rather than declared.

### E — Docs (MODIFIED)

`README.md` rule bullet + the roadmap's "Next" line replaced by a shipped 0.11
entry; `docs/rules.md` catalogue row; `CHANGELOG.md` 0.11.0; `package.json`
0.10.0 → 0.11.0.

## What this catches — and what it does not

Stated plainly because the boundary is easy to overclaim: this rule catches **the
scoreboard claiming more than the record supports**. It does **not** catch
shipping without recording. The 0.10.0 incident regularized in the previous
session — a whole minor released with no log and no cockpit bump — would still
have passed, because `phases_shipped` was never appended and so offered nothing to
test. Closing that gap is the queued `facts-layer` phase's job, not this one's.

## Verify

- `npm test` — **102/102 pass**, 0 fail (92 before).
- `npm run build` — clean.
- `casp explain CASP-SESSION-003` renders the full definition.
- `casp check` on this repo: silent for the new category before the state bump
  (no log declared a phase yet) — the intended never-adopted behaviour, dogfooded.
- Post-implementation audit: read-only reviewer sub-agent over the full diff.
  Verdict **GO-WITH-FIXES**; all five fixes applied before the commit:

  1. **A real crash path.** `readFrontmatter` ran on every `*.md` entry without an
     `isFile()` guard, so a *directory* named `*.md` under the logs dir threw an
     uncaught `EISDIR` and took the whole report down — under `--all` it would
     have aborted every remaining cockpit. Guarded, and pinned by a test.
  2. **A README overclaim.** "silent until a log carries `phase:`" understated the
     guard: the rule is silent until a log declares a phase that *appears in*
     `phases_shipped`. Corrected, so the shipped template does not read as armed.
  3. **`expected` / `actual` were not a diffable pair** (a scope sentence against a
     count). Now the window's entries against the missing ones, per
     `docs/check-json.md`.
  4. **Unrelated churn in two published npm fields** — a JSON re-encode had turned
     the em dashes in `description` / `author` into `\u2014` escapes. Reverted; the
     `package.json` diff is now the one-line version bump.
  5. **A duplicated `phases_shipped` entry was named twice** in the FAIL message
     while `CASP-STATE-003` was already reporting the duplication. Deduplicated.

## CASP state + housekeeping

- This log declares `phase: 0.11.0-check-shipped-log`, which opens the enforcement
  window on this repo at that entry — 21 pre-adoption entries stay exempt. The
  rule's own adoption path is the first real use of it.
- `docs/plan/sessions/PHASE-CHECK-SHIPPED-LOG.md` frontmatter flipped queued → shipped.
- `casp/state.json`, `casp/now.md`, `casp/roadmap.md` bumped; `next_prompt` → `PHASE-FACTS-LAYER.md`.

## Deferred / risks

- **Frontmatter is read for every `.md` in the logs dir on every `check`.** Fine at
  current scale (tens of files, a pre-push gate already shelling out to git); worth
  revisiting only if a repo with hundreds of logs reports a slow gate.
- **The derived window is implicit by design.** A user's first `phase:` declaration
  turns on a FAIL gate for every later entry. That is the intent, and `casp explain
  CASP-SESSION-003` states it, but it is the one behaviour in this slice that a
  reader could be surprised by.
- **npm publish is a separate, CEO-gated act** and did not happen in this session.
