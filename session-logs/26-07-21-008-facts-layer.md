---
phase: facts-layer
---

# 26-07-21-008 — The facts layer: proving freshness, never truth

## The gap

Every rule `casp check` has ever enforced is a claim **inside** `state.json`
against **git**. That is a precise, narrow, and until now complete description
of the product. It has never had an opinion about the documents *orbiting* the
cockpit — a unit-cost note, a roadmap line, a summary percentage — because none
of those is a state claim.

A real incident exposed the cost of that gap. A single working day produced a
plan built on six load-bearing claims. Five were false:

| What lied | What it actually was |
|---|---|
| A unit cost cited in planning documents | **Derived** from a config file, never recalculated after a provider migration changed the underlying number |
| "This instrumentation doesn't exist yet" | **True when written**, stale ten days later after a release |
| "Infrastructure rebuild still pending" | A prose line in a roadmap, true then false, never re-checked |
| A row count read off a live database | **A measurement with no provenance** — a PostgreSQL planner estimate (`n_live_tup`) read as an exact count, off by roughly 40x |
| A percentage in a summary document | Reconciled with **no** source at all; the mechanical formula gave less than half |
| A prompt with no frontmatter | Structural drift — **caught**, by `CASP-PROMPT-002` |

`casp check` stayed green throughout, correctly: none of these was drift between
state and git. The validator was never wrong; it was never asked the question.

## The reversal that makes this tractable without a model

CASP cannot prove a claim is **true** — that would require judging meaning, which
is exactly the line `casp lint` was cut for crossing (see README, "Cut from
earlier drafts, deliberately"). It can prove a claim has stopped being
**verified**:

- has the source it was derived from changed since verification? (hash)
- has the verification aged past its declared shelf life? (TTL)
- was a reproduction method ever recorded at all? (presence)

Three comparisons, zero model — the same shape `migrations_applied` already
uses: a declaration, a piece of evidence on disk, a rule that compares the two.

## What shipped

**`casp/facts.json`** (opt-in, `schemas/facts.schema.json`). A fact declares an
`id`, a claimed `value`, a `source` (a repo path, or `external:<label>` for
evidence outside the repository — a provider console, a dashboard), a
`source_hash` taken at verification time, a reproduction `method`, `verified_at`
+ `ttl_days`, and optionally `used_in` — documents that cite it.

**Six rules, `CASP-FACT-001` … `006`** (`src/facts.ts`, wired into
`checkOne` in `src/check.ts`):

| Code | Verifies | Severity | Catches |
|---|---|---|---|
| `001` | declared `source` resolves (repo path exists, or `external:` has a label) | FAIL | the percentage reconciling with nothing |
| `002` | `source_hash` matches the source's current content | FAIL | **the unit cost never recalculated after its source changed** — the incident's core case |
| `003` | `verified_at + ttl_days` has not passed | WARN, FAIL past double | "rebuild still pending", any external measurement |
| `004` | each `used_in` path exists and carries a `<!-- casp:fact <id> -->` marker | WARN | a derived doc renamed or edited without updating the citation |
| `005` | `method` is present and non-empty | WARN | a value with no way back to how it was produced |
| `006` | `method` matches no entry in the trap registry | FAIL | **the row count read off a planner estimate** |

`002` is the one that matters most: it is the only rule that would have caught
the incident's most expensive line, and it is purely mechanical — the source
moved, the fact was never revisited.

**The trap registry, `src/traps.ts`** — static data, same posture as
`src/rules.ts`'s own "no LLM, no network" declaration. Four cataloged shapes
that produce an estimate reading like a measurement: `n_live_tup`/`n_dead_tup`
without a paired `count(`, `EXPLAIN` without `ANALYZE`, `reltuples`, `docker
stats --no-stream`. Extensible per-project via a plain `traps` string array in
`facts.json` — matched as a **substring only**, never a regex. `facts.json` is
repository content; running an arbitrary pattern from it would be the exact
mistake this layer exists to avoid making with a model.

**The marker is checked for presence only** (`CASP-FACT-004`):

```markdown
The unit cost is <!-- casp:fact unit-cost-per-minute -->0.012 $/min<!-- /casp:fact -->.
```

Never the value written around it — comparing a number embedded in prose would
require parsing natural language, which is the line this product does not cross.

**`casp fact list|check|verify|stale`** (`src/fact.ts`). `list`/`check`/`stale`
are read-only; `check` is the `FACT`-only subset of `casp check` (reuses
`checkOne` + `ruleFor`, no duplicated logic); `stale` is the re-verify work
list. `verify <id>` is the **one deliberate code-execution surface in this
binary**: it runs the fact's declared `method`, shows the before/after (`value`,
`source_hash`, `verified_at`), and requires confirmation (`--yes` to skip it
non-interactively) before writing. Nothing else in CASP ever executes
repository content — see `docs/threat-model.md`.

## The design constraint honored throughout

**Opt-in, same posture as `CASP-SESSION-003` and the prompt-chain rules.** A
cockpit that never scaffolds `casp/facts.json` sees **zero** `CASP-FACT-*`
findings — not even a PASS. Verified by test: the human report of a repo with
no `facts.json` is unaffected, byte for byte, by every rule this release adds.

**Every fact requires `ttl_days`, including a repo-relative source with a
hash.** An unchanged hash proves the source hasn't moved; it says nothing about
whether the verification is still recent enough to trust. `external:` sources
have no hash to fall back on at all, so the TTL is their only guard — and the
schema does not special-case them: every fact declares one.

## Compare-and-swap on `state.json` — the incident's other half

The founding incident also exhibited something the freshness layer doesn't
touch: two agents wrote the same `casp/` in parallel that day, and the second
silently overwrote the first — by luck, not by design. `saveState` became
atomic in 0.12.1 (temp file + `rename`), which protects a **partial** write (a
crash, a full disk) but nothing about an **overwritten** one. The implicit
model until now was one agent, one session, one branch; the incident showed
that isn't always true.

Fix, layered on the existing atomicity without replacing it:
`loadStateWithHash()` (`src/shared.ts`) returns the state alongside the hash of
the exact bytes read. `saveState()` now accepts that hash and, right before the
`rename`, re-hashes the current on-disk content and refuses — a
`StateConflictError`, and no write at all — on any mismatch. No lock, no CRDT,
no merge: an honest refusal. The residual TOCTOU window between the check and
the rename is accepted deliberately; it is narrow, and a local CLI has no
business promising serializability.

Wired through every verb that mutates `state.json`: `close`, `ship`,
`audit bump`, and the version-stamp write in `upgrade`. Each now surfaces the
conflict as a clean, actionable message instead of an uncaught exception.

## Judgement calls worth recording

**A malformed `casp/facts.json` is a FAIL under `CASP-FACT-001`, not silence.**
The file's *presence* is the adoption signal; if it exists but doesn't even
minimally parse (no `facts` array), that's a broken opt-in, the same treatment
`state.json` gets from `CASP-STATE-001` — not "the project hasn't adopted this,
skip quietly."

**`casp fact verify` executes first, then asks.** The declared `method` runs
(read-only by the convention the schema documents), the before/after is shown,
*then* confirmation is required before anything is written. Running the method
is how the "after" value is produced in the first place — there is no way to
preview it without running it — so the consent gate is on the **write**, which
is the only irreversible step.

**Zero facts declared emits nothing, matching `migrations_applied`'s own
"0 files on disk → no PASS" precedent.** An empty `facts: []` array is a
legitimate, unremarkable state, not an incomplete one.

## Compatibility

- `check --json` `schema_version` stays **1** — `CASP-FACT-*` findings reuse the
  existing finding shape.
- No existing finding changes verdict, on any repository, adopted or not.
- A cockpit with no `casp/facts.json` is provably unaffected (pinned by test).
- `casp rules` / `casp explain <CODE>` cover all six codes, as the
  rule-coverage test requires of every emitted finding id.
- `saveState`'s new third parameter is optional; every existing call site that
  doesn't pass it keeps writing unconditionally, exactly as before.

## Tests

**151 → 176.** Twenty-five new, each pinning a reproduced shape rather than the
abstract rule: no `facts.json` → literally zero findings · a malformed
`facts.json` is one FAIL, not a crash · an unresolvable source and a
label-less `external:` both FAIL · a source changed after verification FAILs,
and `casp fact verify` clears it · a repo-relative source with no recorded
hash FAILs · TTL WARNs then FAILs past double · an `external:` fact with no
`ttl_days` FAILs · a `used_in` document with and without the marker PASS and
WARN respectively · the built-in trap registry FAILs a known bad pattern and
PASSes a real measurement · a project-declared trap also FAILs · `list`,
`check`, `stale`, and `verify` each round-trip correctly, including refusing to
write without confirmation in a non-interactive shell · `saveState`'s
compare-and-swap refuses a stale write, leaves the winning write untouched, and
cleans up its own temp file on refusal.

## Deferred

Straight from the phase prompt, and still the right call:

- **Comparing a fact's value to the prose around it.** Requires parsing natural
  language — the line this product does not cross.
- **Fuzzy resolution of `source` or `used_in` paths.** The refusal is now an
  established precedent three times over (`CASP-SESSION-003`, the prompt-chain
  rules, and this layer): a reference resolves exactly, or not at all.
- **A shared facts store across cockpits.** No real need observed yet.
- **Automatic fact detection in existing documents.** The marker is manual and
  deliberate — what's worth verifying is worth declaring.

## What this layer does not prove, stated in its own voice

Added to `docs/what-casp-proves.md`: an unchanged source hash and an unexpired
TTL mean "verified recently against this evidence," never "correct." The trap
registry catches only the traps it knows — the incident's actual error was a
**judgment** error, not a freshness error, and the next unknown measurement
trap will pass silently. Recording `method` doesn't prevent the next
misjudgment; it makes today's misjudgment auditable after the fact, which the
incident had none of.

## Not published

`0.14.0` is not on npm. Publishing stays a separate, deliberate act.
