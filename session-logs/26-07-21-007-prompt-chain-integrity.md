---
phase: 0.13.0-prompt-chain-integrity
---

# 26-07-21-007 — Prompt-chain integrity: prove the queue, not just its head

## The gap

Nine rules covered prompts and sessions before this release. Read them together
and a pattern falls out: every one is about **one prompt** — the head, the file
`state.next_prompt` names — or about **the past**, what has already shipped.

| Rule | Subject |
|---|---|
| `CASP-PROMPT-001` … `003` | the head: exists, has frontmatter, is not already shipped |
| `CASP-PROMPT-004` … `006` | every prompt: parseable frontmatter, canonical status, shipped ones carry a log |
| `CASP-SESSION-001` … `003` | the past: the last session's log, the history dirs, the shipped scoreboard |

The set of *queued* prompts was checked for parseable frontmatter and a canonical
status value, and for nothing else. Never for whether they form a coherent order.

That matters because the queue is the product's second half. The documented
workflow — the one this repository runs — is to draft a run of prompts ahead of
time, chain them with `next_after`, point `next_prompt` at the head, and then
execute them one per session without re-planning. `templates/templates/session-prompt.md`
has shipped a `next_after:` key since the template existed, so the convention is
in every scaffolded prompt. It had no rule behind it.

A chain can therefore be silently unexecutable while `casp check` exits 0:

- a queued prompt whose `next_after` names a slice that exists nowhere;
- a cycle — A after B, B after A — that no linear execution satisfies;
- two queued prompts claiming the same predecessor, so "what runs after X" has
  two answers;
- an orphan no chain reaches, which will simply never run, and whose absence is
  invisible until someone notices the feature never shipped.

None of these are drift between state and git. They are drift between the queue's
*claim* to be an ordered plan and what the files actually encode.

## What shipped

**`src/chain.ts`** — new module, the resolver and the graph walk. Pure: reads
files, returns an analysis, never prints, never exits, never shells out. Three
comparisons over files on disk — resolve, walk, detect a ring. No model, no
network, per the phase's `DO NOT`.

**Four codes in the existing `CASP-PROMPT-*` space:**

| Code | Finding | Severity |
|---|---|---|
| `CASP-PROMPT-007` | `next_after` names a slice that resolves to nothing | FAIL |
| `CASP-PROMPT-008` | the chain contains a cycle (including self-reference) | FAIL |
| `CASP-PROMPT-009` | two or more queued prompts declare the same `next_after` | WARN |
| `CASP-PROMPT-010` | a queued prompt is unreachable from `next_prompt` | WARN |

The split was carried over from the phase prompt's recommendation unchanged, and
it holds up: a dangling reference and a cycle are claims that **cannot be true**,
so the plan is unexecutable as written and the push is blocked. A fork or an
orphan is **ambiguous** rather than false — a deliberate parking lot of
queued-but-unchained prompts is a legitimate way to work, and reddening it would
punish a real workflow.

## The design constraint that shaped everything

**This category cannot redden a repo that has not opted in.** The template ships
`next_after: <previous-session-id-or-prompt-slug>` as a literal placeholder, so a
large share of real prompts in the wild carry an unedited value. A rule that
fired on that would have broken every cockpit already on CASP — the exact failure
`casp upgrade` shipped two releases ago to repair.

So `next_after` is a **declaration**, like `phase:` in a session log: optional,
and meaningful only when present. Not a declaration, and therefore producing
nothing at all:

- a value wrapped in angle brackets (the template's placeholder, and any other);
- an empty or whitespace-only string;
- `null`, and the bare words `none` / `pending` / `tbd` / `-` / `n/a`;
- any non-string YAML value — a number, a boolean, a list, a map, a bare date.

A repo where **no queued prompt** carries a real declaration gets no finding at
all. Not a WARN, not a nag, not even a PASS line: the category is invisible until
the first genuine declaration switches it on. That is the treatment
`CASP-SESSION-003` gives a repo where no log declares a phase, and it is now the
established shape for an opt-in rule. Adoption is derived from the data — **no new
state key**, nothing to configure.

Prompts skipped as non-declaring are counted in the PASS line's detail, never
silently: a green line must not be readable as "the whole queue is chained" when
half of it opted out.

## Resolution: exact, after a documented normalization

`next_after` resolves against evidence the validator already reads. Nothing new
is invented, and no second, divergent resolver was written:

| Form | Example | Evidence |
|---|---|---|
| prompt filename stem | `PHASE-AUTH-GATE` | the sessions directory |
| …lowercased | `phase-auth-gate` | the sessions directory |
| …slug, scaffold prefix removed | `auth-gate` | the sessions directory |
| session id | `26-07-21-001-auth-gate` | `<logs_dir>/<id>.md` — the `CASP-SESSION-001` resolver |
| phase id | `0.11.0-auth-gate` | `phases_shipped` / `phases_queued` / `current_phase` / `next_phase` |

Every match is an **exact string** after a total, deterministic normalization.
Case folding and stripping the scaffold's own `PHASE-` prefix are normalizations,
not guesses. Nothing else is stripped, and there is no edit distance anywhere in
the module: `CASP-SESSION-003` refused fuzzy filename matching, and refusing it a
second time is the point of having a precedent. A near miss (`auth-gate-2` against
`PHASE-AUTH-GATE.md`) is a dangling reference, not a resolved one — pinned by a
test.

**Only queued prompts are subjects.** A shipped prompt is a valid resolution
*target* — a chain legitimately terminates on the slice that ran before it — but
its own `next_after` is history and is never re-litigated.

## Two judgement calls worth recording

**No orphan storm on top of a real finding.** The reachability walk starts at the
prompt `state.next_prompt` names. When that key is missing, or points at a file
that does not exist, or at a prompt that already shipped, `CASP-PROMPT-001` /
`003` already FAIL — and every declaring queued prompt would then be unreachable
by construction. Emitting a WARN for each would bury the one actionable finding
under noise proportional to the size of the queue. The walk stays silent when
there is no usable head.

**A prompt with no `next_after` is never an orphan.** Opting out is what parking a
prompt looks like. Only a prompt that *declares* a predecessor — and is therefore
claiming a place in the line — can be reported as unreachable from it.

**Identity collisions resolve by rule, not by directory order.** `A.md` and
`PHASE-A.md` both answer to the slug `a`. The first implementation let whichever
`readdirSync` returned last take the identity, which means the same repository
could resolve its chain differently on two filesystems — unacceptable in a
binary whose entire claim is determinism. Identities are now ranked
most-specific-first (stem, lowercase stem, slug) and inserted least-specific-first
over a path-sorted list, so an exact stem always beats a slug and the resolver is
a pure function of the filenames.

## `casp status --json` gains `queue`

The phase's SHOULD, shipped: the resolved chain as repo-relative prompt paths,
head first, so an agent can plan more than one session ahead.

```json
"queue": [
  "docs/plan/sessions/PHASE-PROMPT-CHAIN-INTEGRITY.md",
  "docs/plan/sessions/PHASE-FACTS-LAYER.md",
  "docs/plan/sessions/PHASE-DEMAND-GATED-TAIL.md"
]
```

`null` when the chain is not adopted, or not coherent — a dangling reference, a
cycle, a fork or an orphan means the order has no single answer, and `status`
reports no order rather than a guessed one. Additive: `status --json`'s
`schema_version` stays **1**, and `status` still exits `0` on a drifted chain.
Reporting, never gating; the chain's integrity is `check`'s business.

## Dogfooding found the first bug, in this repository

On its first real fixture — casp-core itself — the rule immediately reported two
`CASP-PROMPT-010` warnings, and they were correct. The queue was not actually
chained:

- `PHASE-FACTS-LAYER.md` declared `next_after: check-shipped-log`, a slice that
  shipped as 0.11.0;
- `PHASE-DEMAND-GATED-TAIL.md` declared `next_after: PHASE-VERIFY-AND-STATE-DIFF`,
  shipped well before that.

Both named real slices, so neither was dangling — they resolved cleanly and were
simply pointing at history. The chain existed on paper and encoded no order.
`phases_queued` said the real sequence was `prompt-chain-integrity → facts-layer
→ demand-gated-tail`; the frontmatter said nothing of the kind. Both values are
corrected in this release, and the chain now resolves in that order.

Worth stating plainly: the rule's first action was to find a defect in the
repository that wrote it.

## A pre-existing crash, found by attacking this slice

The commissioned review of this slice never returned a report. The three priority
checks were therefore re-run by hand — by execution, not by reading — and the
third found a real defect, outside this slice's scope:

`state.json` accepts any JSON. With `next_prompt: 42` — a number, a list, an
object — section 2 of `checkOne` passed the value straight to `join()`, which
throws `ERR_INVALID_ARG_TYPE`. **The entire report died on a raw stack trace**,
before any other check ran.

A gate that *crashes* is worse than a gate that *reddens*: CI reads it as
infrastructure failure rather than as drift, and the fifteen other findings in
the run are lost with it. This is precisely the class of defect the 0.12.1 review
fixed for a scalar `state.json` — `casp next` and `casp status` already coerce
the value through `String()`; `check` was the one unguarded verb.

A non-path value is now a `CASP-PROMPT-001` FAIL naming the offending type.
Out-of-scope fix, taken deliberately: shipping 0.13.0 while knowing about the
crash would have been dishonest, and the fix is three lines.

The other adversarial probes passed: a missing sessions directory, a file where
the directory belongs, a directory named `*.md` among the prompts, a missing
`session-logs/`, `phases_shipped` holding non-strings, a `next_prompt` escaping
via `../../../etc/passwd`, three disjoint cycles each reported separately with
the upstream node correctly excluded from the ring it feeds, and no non-string
YAML value treated as a declaration.

## Compatibility

- `check --json` `schema_version` stays **1** — the new findings use the existing
  finding shape.
- `status --json` `schema_version` stays **1** — `queue` is additive.
- No new state key. No existing finding changes verdict.
- A cockpit scaffolded before this release still PASSes, asserted by test.
- `casp rules` and `casp explain <CODE>` cover all four codes, as the
  rule-coverage test requires of every emitted finding id.

## Tests

**121 → 146.** Twenty-five new, each pinning a reproduced case rather than the
abstract rule:

never-adopting repo emits not even a PASS line · unedited placeholder produces
nothing · `null` and `''` produce nothing · coherent chain PASSes and states its
skipped count · the slug form resolves · a session id resolves · a phase id
resolves · a dangling reference FAILs and exits 1 · a near-miss filename is
dangling, not fuzzy-matched · a two-node cycle is one finding, not one per node ·
a self-reference FAILs · a fork WARNs and exits 0 · an orphan WARNs and exits 0 ·
a parked prompt is never an orphan · a shipped prompt's dangling `next_after` is
ignored · a shipped prompt is still a valid target · a missing head produces no
orphan storm · all four codes are in `casp rules` and resolve in `casp explain` ·
every chain finding carries a rule code · `status --json` exposes the order ·
`queue` is `null` on a drifted chain · `queue` is `null` when unadopted.

## Deferred

Both deferrals come straight from the phase prompt and stand:

- **No command that reorders or repairs a chain.** Reporting is not fixing, and a
  verb that rewrites the operator's plan is a different, larger decision.
- **No chain visualisation.** Tooling ergonomics, not the protocol.

`casp next` is unchanged and remains a printer. This phase makes the queue
provable; it does not make CASP run it. Orchestration stays on the anti-roadmap.

## Not published

`0.13.0` is not on npm. `0.11.0` and `0.12.0` were also never published
independently — publishing stays a separate, deliberate act.
