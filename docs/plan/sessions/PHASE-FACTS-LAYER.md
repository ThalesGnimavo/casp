---
status: shipped
session_id: 26-07-21-008-facts-layer
session_log: session-logs/26-07-21-008-facts-layer.md
drafted_at: 2026-07-20
next_after: PHASE-PROMPT-CHAIN-INTEGRITY
parent_prompt: null
---

# PHASE — Facts layer: proving freshness, not truth

> **Status: QUEUED at drafting time; shipped as 0.14.0** — see the session log named in the
> frontmatter. Drafted 2026-07-20 against **0.10.0**, **refreshed 2026-07-21** at the close of
> session `26-07-21-007` (0.13.0) — see the first `CONTEXT` sub-section for what moved. The
> diagnosis and the design held; three premises of detail were corrected.
>
> **Origin**: a real incident on 2026-07-20 in a production cockpit. A full working day was built
> on five false claims, **with `casp check` reporting nothing at all** — because none of them was
> state drift. `state.json` against git was right all day. What lied lived in the documents
> *orbiting* the cockpit.

---

## CONTEXT

### What changed since drafting — refreshed 2026-07-21

This prompt was drafted on 2026-07-20 against version **0.10.0**. Four releases shipped in
between. The diagnosis of the incident and the design of the layer hold in full; three premises
of detail moved and are corrected below.

| Release | What shipped | Effect on this prompt |
|---|---|---|
| `0.11.0` | `CASP-SESSION-003` — every shipped phase must be declared by a session log | The first precedent for **adoption derived from the data**: no state key, total silence until the repository declares something. That is the exact pattern `facts.json` must follow. |
| `0.12.0` | `casp upgrade` — refresh a cockpit's scaffolds without eating its state | **Unblocks this phase.** `casp/facts.json` is a data file at the cockpit root; without `upgrade`, no repository already on CASP could receive a new scaffold. |
| `0.12.1` | Data-loss fixes in `upgrade`; `saveState` made **atomic** | Invalidates part of the "atomic write" SHOULD. See below. |
| `0.13.0` | `CASP-PROMPT-007` … `010` — prompt-chain integrity | The second precedent for derived adoption, and confirmation that reserving codes inside an existing space works without breaking the report schema. |

Test suite at the start of this session: **143**, all green. `check --json` schema: **1**.
`status --json` schema: **1**. Both must stay there — `CASP-FACT-*` findings reuse the existing
finding shape.

The `CASP-FACT-*` code space is still entirely free; `CASP-PROMPT-*` now runs up to `010`.

### What actually happened on 2026-07-20

Five inconsistencies, all costly, all invisible to the current validator.

| What lied | Nature of the drift | Caught by CASP? |
|---|---|---|
| A unit cost quoted in the planning documents | A value **derived** from a configuration file, never recalculated after a provider migration that divided the source cost by four | No |
| "This instrumentation does not exist yet" | A claim **true when written**, made stale ten days later by a release | No |
| "Infrastructure rebuild still due" | A line of prose in a `roadmap.md`, true then false, never re-verified | No |
| A database row count | A **measurement with no provenance** — `n_live_tup` (a PostgreSQL planner estimate) read as an exact count; the real figure was roughly 40× higher | No |
| A key percentage in a summary document | A number reconciling with **no** source; the mechanical formula produced less than half of it | No |
| A prompt with no frontmatter | Structural drift | **Yes** (CASP-PROMPT-002) |

The score is honest: one out of six. And the only one caught was the cheapest.

Real cost: one false measurement propagated across five files in minutes, a six-prompt
implementation plan built on a stale premise, and a summary figure that does not survive a
multiplication.

### The design constraint, non-negotiable

`casp lint` — LLM-driven prose-against-reality checking — is **explicitly cut** (`README.md`,
section "Cut from earlier drafts, deliberately"; `TODO.md`, long-term section): an LLM verb in
the binary would break the deterministic promise. This phase respects that rule in full.
**Nothing below requires a model.**

> References by section rather than by line number: `README.md` has been rewritten twice since
> this prompt was drafted, and the `README.md:285` reference it carried pointed at unrelated
> prose by the time of the refresh.

### The reversal that makes this tractable

You cannot deterministically prove a claim is **true**. You can prove it has stopped being
**verified**:

- has the source changed since verification? → hash comparison;
- has the verification aged past its shelf life? → date comparison;
- was the production method recorded? → presence test.

Three comparisons, zero model. The same pattern as `migrations_applied`: a declaration, a proof
on disk, and a rule comparing the two.

The most dangerous fact is not the false one — it is the one that **used to be** true. And a
fact that used to be true is exactly what a source hash and a TTL catch.

---

## SCOPE

### MUST

One new primitive: `casp/facts.json`. Opt-in, like `migrations_applied` — a project that never
creates it sees no new rule and stays green.

```jsonc
{
  "schema_version": 1,
  "facts": [
    {
      "id": "unit-cost-per-minute",
      "value": "0.012 USD/min",
      "source": "backend/config/pricing.json",
      "source_hash": "sha256:ab12…",     // hash of the source AT verification time
      "method": "jq '.providers.current.cost_per_minute_usd' backend/config/pricing.json",
      "verified_at": "2026-07-20",
      "verified_commit": "0158df8",
      "ttl_days": 90,
      "used_in": [
        "docs/unit-economics.md",
        "docs/budget-allocation.md"
      ]
    },
    {
      "id": "cloud-monthly-cost",
      "value": "0 USD (free tier, 5000 units included)",
      "source": "external:cloud-provider-billing",   // outside the repo: no hash possible
      "method": "provider console → Billing → Statements",
      "verified_at": "2026-07-20",
      "ttl_days": 30                                 // the TTL is the ONLY guard here
    }
  ]
}
```

**The rules.** Stable codes following the existing registry (`src/rules.ts`), findings mapped
like every other.

| Code | Checks | Severity | Which 2026-07-20 case it catches |
|---|---|---|---|
| `CASP-FACT-001` | The declared source exists (a path in the repository), or starts with `external:` | FAIL | The percentage that reconciles with nothing |
| `CASP-FACT-002` | `source_hash` == the source's current hash | **FAIL** | **The unit cost never recalculated after the configuration migration** |
| `CASP-FACT-003` | `verified_at + ttl_days` ≥ today | WARN, FAIL past double the TTL | "Rebuild still due", the cloud bill, any external measurement |
| `CASP-FACT-004` | Every `used_in` path exists **and** carries the `casp:fact <id>` marker | WARN | A derived document deleted or renamed without an update |
| `CASP-FACT-005` | `method` is present and non-empty | WARN | A value that cannot be reproduced |
| `CASP-FACT-006` | `method` matches no **known trap** | FAIL | **`n_live_tup` read as a count** |

`CASP-FACT-002` is the one that matters. It is the only rule that would have caught the unit
cost's sedimentation, and it is purely mechanical: the source moved, the fact was never revisited.

**Marking derived documents** — an HTML comment, invisible when rendered:

```markdown
The unit cost is <!-- casp:fact unit-cost-per-minute -->0.012 USD/min<!-- /casp:fact -->.
```

`CASP-FACT-004` checks the marker is present. It does not read the value — deliberately:
comparing a number inside prose would require parsing natural language, therefore a model,
therefore the red line.

**The trap registry** (`src/traps.ts`, static data, in the spirit of `src/rules.ts`, which
declares *"No LLM, no network — this registry is static data"*). Method patterns that produce
estimates people read as facts:

```
n_live_tup / n_dead_tup without count(   → PostgreSQL planner estimate
EXPLAIN without ANALYZE                  → estimated cost, not measured
reltuples                                → same
docker stats --no-stream                 → a snapshot, not an average
```

Extensible per project via an optional `traps` field in `facts.json`. It is the only place in
the protocol where CASP encodes domain knowledge, and it stays declarative.

### SHOULD

**Compare-and-swap on state (multi-agent concurrency).**

> **Refreshed 2026-07-21.** The original draft described `saveState()` as a naked `writeFileSync`
> and asked for it to be made atomic. **Atomicity shipped in 0.12.1**: `saveState`
> (`src/shared.ts`) now writes to a temporary file then `rename`s, atomic within a filesystem,
> which protects `ship`, `close`, `audit` and `upgrade` from a state truncated by a crash or a
> full disk. **Do not re-implement that part.**

What remains open is the other half, and it is the one the 2026-07-20 incident actually
exhibited: atomicity protects a **partial** write, not an **overwritten** one. There is still
neither a lock nor a compare-and-swap. The implicit model is still "one agent, one session, one
branch". The observed reality: two agents writing into the same cockpit's `casp/` in parallel,
with the second correcting the first — by luck, not by design. Parallel multi-agent work is a
real usage mode, not a textbook case.

The minimal fix, no new concept, layered on top of the existing atomic write: remember the hash
of the file as it was read at load time, and re-check it just before the `rename`. If the source
moved in between, refuse with an actionable message ("state changed since it was read, re-run")
and write nothing. No lock, no CRDT, no merge — just an honest refusal. The residual TOCTOU
window is accepted: it is narrow, and a local CLI has no business claiming serializability.

**`casp fact` — the verbs.** Consistent with the existing grammar (one syllable, read-only by
default):

```
casp fact list [--json]        inventory, with each fact's freshness state
casp fact check                the FACT rules alone (a subset of casp check)
casp fact verify <id>          replays the method, updates hash + date, requires confirmation
casp fact stale [--json]       what expired or whose source moved — the work list
```

`casp fact verify` is the only mutating verb. It guesses nothing: it executes the declared
`method`, shows the before/after, and asks for confirmation — the same posture as `casp close`.

### DEFER

- Comparing the fact's **value** against the derived document's content. Requires parsing prose.
  Red line.
- Any form of fuzzy resolution. The refusal is now a precedent established **twice** —
  `CASP-SESSION-003` (shipped in 0.11.0) then `CASP-PROMPT-007` (shipped in 0.13.0): if a match
  needs a guess, there is no finding. A `source` or `used_in` path resolves exactly, or not at all.
- A central fact store shared across cockpits. Wait for a real need.
- Automatic detection of facts in existing documents. Marking is manual and deliberate: what
  matters enough to be verified deserves to be declared.

---

## DO NOT

- **Do not add an LLM**, in any form, not even advisory, not even optional.
- **Do not make `facts.json` mandatory.** A cockpit without the file sees no new rule. Adoption
  dies of constraint imposed all at once.
- **Do not redden histories.** Two categories already did this correctly — `CASP-SESSION-003`
  (0.11.0) and `CASP-PROMPT-007` … `010` (0.13.0): in both cases adoption is **derived from the
  data**, with no state key, and a repository that declared nothing emits **no finding, not even
  a PASS**. Read both implementations before coding this one; pre-adoption behaviour is settled
  **before** the rest, not after.
- Do not claim this layer proves truth. It proves **freshness**. The documentation must be as
  explicit about that limit as `docs/what-casp-proves.md` is today about its own.

---

## VERIFY

Expected tests, each replaying a real 2026-07-20 case:

- source modified after verification → `CASP-FACT-002` FAIL;
- expired fact → WARN, then FAIL past double the TTL;
- `used_in` pointing at a file with no marker → `CASP-FACT-004` WARN;
- `method` containing `n_live_tup` without `count(` → `CASP-FACT-006` FAIL;
- an `external:` source with no `ttl_days` → FAIL (otherwise the fact is never re-verifiable);
- **a cockpit without `facts.json` → no FACT rule emitted, verdict unchanged**;
- `saveState` with state modified between read and write → refusal, nothing written at all.

At the start of the session, **143 tests** pass. All must stay green, the `check --json` schema
must stay at **1**, and the human report of a repository without `facts.json` must stay
byte-identical.

---

## What this layer will not solve

To be written into `docs/what-casp-proves.md` alongside the code.

The 2026-07-20 error — reading `n_live_tup` as a count — was an **error of judgement**, not of
freshness. The trap registry would have caught it because that particular trap is known and
catalogued. The next unknown trap will pass. `CASP-FACT-005` (method recorded) makes the error
**auditable after the fact**, which is already a great deal — on the day itself, nothing recorded
where the number came from.

Likewise, a fact whose source has not moved and whose TTL is still running can be **false from
day one**. CASP will say "fresh". It will be right, and it will be wrong. The layer moves the
question from "is this true?" to "when did someone verify it, how, and has the source moved
since?". That is a considerable step forward and it is not truth.
