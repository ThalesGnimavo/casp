---
status: queued
session_id: pending
session_log: pending
drafted_at: 2026-07-21
next_after: readme-lead-with-the-queue
parent_prompt: null
---

# PHASE — Prompt-chain integrity: prove the queue, not just its head

> **Status : QUEUED.** A gap found by reading `casp rules` rather than assuming, on
> 2026-07-21, while documenting the queue workflow for the README. The nine
> `CASP-PROMPT-*` / `CASP-SESSION-*` rules validate the **head** of the queue and the
> integrity of what has **already shipped**. Nothing validates the ordering of what
> has not run yet. The `next_after` chain is a template convention with no rule
> behind it.

---

## CONTEXT

### What is actually enforced today

Verified against `casp rules` on 0.12.1:

| Rule | Covers |
|---|---|
| `CASP-PROMPT-001` | `next_prompt` file exists |
| `CASP-PROMPT-002` | `next_prompt` has frontmatter |
| `CASP-PROMPT-003` | `next_prompt` is not already shipped |
| `CASP-PROMPT-004` | Session prompts have parseable frontmatter |
| `CASP-PROMPT-005` | Shipped prompts have a resolvable `session_log` |
| `CASP-PROMPT-006` | Prompt status values are canonical |
| `CASP-SESSION-001` | `last_session_id` maps to a session log |
| `CASP-SESSION-002` | Shipped history directories exist |
| `CASP-SESSION-003` | Shipped phases are declared by a session log |

Every one of these is about **one prompt** (the head) or about **the past** (what
shipped). The set of *queued* prompts is checked only for parseable frontmatter and
canonical status — never for whether they form a coherent order.

### Why it now matters

`templates/templates/session-prompt.md` ships a `next_after:` key, so the convention
is real and in every scaffolded prompt. The documented workflow — and the one this
project itself runs — is to draft a run of prompts ahead of time, chain them with
`next_after`, point `state.json.next_prompt` at the head, and then execute them one
per session without re-planning.

That workflow is only as good as the chain. Today the chain can be silently
incoherent while `casp check` stays green, because the gate only ever looks at the
first element:

- a queued prompt whose `next_after` names a slice that **does not exist** anywhere;
- a **cycle** — A after B, B after A — which no linear execution can satisfy;
- **two queued prompts claiming the same predecessor**, so "what runs after X" has
  two answers and the order is ambiguous;
- an **orphan** — a queued prompt no chain reaches, which will simply never run and
  whose absence is invisible until someone notices the feature never shipped.

None of these are drift between state and git. They are drift between the queue's
*claim* to be an ordered plan and what the files actually encode — the same class of
defect `migrations_applied` catches, applied to the plan instead of the schema.

### The design constraint, non-negotiable

**This rule cannot redden a repo that has not opted in.** The template ships
`next_after: <previous-session-id-or-prompt-slug>` as a **literal placeholder**, so a
large share of real prompts in the wild carry an unedited placeholder, an empty
value, or `null`. Those are *not* declarations and must produce no finding — exactly
the treatment `CASP-SESSION-003` gives a repo where no log declares a phase.

Adoption is derived from the data, never configured. No new state key.

---

## SCOPE

### MUST

1. **A new drift category for queue coherence.** Reserve codes in the existing
   `CASP-PROMPT-*` space (next free is `007`). Recommended split — settle it in the
   session and record the reasoning in the log:

   | Code | Finding | Recommended severity |
   |---|---|---|
   | `CASP-PROMPT-007` | `next_after` names a slice that resolves to nothing | **FAIL** |
   | `CASP-PROMPT-008` | The chain contains a cycle | **FAIL** |
   | `CASP-PROMPT-009` | Two or more queued prompts declare the same `next_after` | **WARN** |
   | `CASP-PROMPT-010` | A queued prompt is unreachable from `next_prompt` | **WARN** |

   Rationale for the split: a dangling reference and a cycle are claims that **cannot
   be true** — the plan is unexecutable as written, so they gate. A fork or an orphan
   is *ambiguous* rather than false — a deliberate parking lot of queued-but-unchained
   prompts is a legitimate way to work, and reddening it would punish a real
   workflow. If the session disagrees, argue it in the log; do not silently change it.

2. **Resolution rules, stated precisely and tested.** `next_after` must resolve
   against the same evidence the rest of the validator already reads:
   - a **prompt slug** (the `NN-slug` / `PHASE-SLUG` identity used by `next_prompt`), or
   - a **session id** that maps to a session log (the `CASP-SESSION-001` resolver), or
   - `null` / empty / the unedited placeholder → **not a declaration**, no finding.

   **Filenames are never fuzzy-matched.** Follow the precedent
   `CASP-SESSION-003` set: if the mapping would need a guess, there is no finding.
   Reuse the existing resolvers rather than writing a second, divergent one.

3. **Adoption window, derived.** A repo where no queued prompt carries a real
   `next_after` gets **no finding at all** — silence, not a nag. The first genuine
   declaration opens the window. Print the count of prompts skipped as
   non-declaring, the way the exempt count is printed today: never silent.

4. **Additive and backward-compatible.** No existing finding changes verdict, the
   `check --json` `schema_version` stays **1** (the new findings use the existing
   finding shape), no new required state key, and **every prior test stays green**.
   A cockpit scaffolded before this release must still PASS.

5. **`casp rules` / `casp explain <CODE>` cover the new codes**, as the rule-coverage
   test already enforces for every emitted finding id.

6. **Regression tests, each pinning a reproduced case**, not the abstract rule:
   never-adopted repo stays silent / a fully coherent chain passes / a dangling
   `next_after` FAILs and exits 1 / a two-node cycle FAILs / a self-referencing prompt
   (`next_after` naming itself) FAILs / two prompts sharing a predecessor WARN / an
   unreachable queued prompt WARNs / an unedited placeholder produces nothing / a
   `next_after` resolving to a *session id* rather than a prompt slug is accepted /
   a shipped prompt's `next_after` is not re-litigated (history is not blamed).

### SHOULD

7. `casp status --json` exposes the resolved chain order when it is coherent — the
   queue as an array, head first. Useful to an agent planning more than one session
   ahead. **Never gating**; `status` still exits 0 on a drifted chain.

### DEFER

- Any command that **reorders** or **repairs** a chain. Reporting is not fixing, and
  a verb that rewrites the operator's plan is a different, larger decision.
- Visualising the chain (a graph renderer) — tooling ergonomics, not the protocol.

---

## VERIFY

- `casp check` on this repo — the queue here is genuinely chained, so it is the first
  real fixture. It must stay **0 FAIL**.
- A repo with no `next_after` anywhere: **zero** new findings, and the skipped count
  printed.
- Every new code appears in `casp rules` and resolves in `casp explain`.
- `check --json` `schema_version` still `1`; the human report for a repo with no
  chain adoption is byte-for-byte unchanged.
- Full test suite green, including the 121 pre-existing tests.

---

## DO NOT

- **No LLM, no network.** Three comparisons over files on disk — resolve, walk, detect
  a cycle. If a rule here would need a model, it does not belong in the binary.
- **No fuzzy filename matching.** `CASP-SESSION-003` refused exactly this; refusing it
  twice is the point of having a precedent.
- Do not make `next_after` **required**. It is a declaration, like `phase:` in a
  session log — optional, and meaningful only when present.
- Do not add a state key, and do not bump the report schema.
- Do not turn `next` into an executor. This phase makes the queue provable; it does
  not make CASP run it. Orchestration stays on the anti-roadmap.

---

## AT END OF SESSION

1. Tests green; `git add` only this session's files (no `-A`).
2. Minor version bump (new drift category, additive) + `CHANGELOG.md` entry in the
   established shape: what shipped, why it cannot redden an existing repo, the test
   count delta.
3. Session log, next prompt drafted, state bump, `casp check` 0 FAIL, account-dance
   push. **npm publish stays a separate, CEO-gated act — do not bundle it.**

---

*The queue is the product's second half: you plan once and execute one slice per
session. Today the gate proves the first element of that plan and nothing else. This
phase makes the plan itself checkable — dangling, cyclic, ambiguous or unreachable —
without ever asking a model what the order should be.*
