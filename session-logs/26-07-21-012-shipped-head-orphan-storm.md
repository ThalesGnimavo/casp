---
phase: 0.14.1-shipped-head-orphan-storm
---

# 26-07-21-012 — a shipped head buried its own finding

Report-quality fix, found by dogfooding. No verdict changes, no exit code
changes, `check --json` stays schema v1, no rule added or removed.

## How it surfaced

Not by reading the code. I was capturing the README's proof screenshots against
a real cockpit — the demo repo, five phases shipped, a three-slice queue chained
with `next_after` — and set up the flagship drift for the gate shot:
`next_prompt` pointing at a slice that already shipped.

The shot came back `26 PASS · 3 WARN · 1 FAIL`. The FAIL was right. The three
warnings said each queued prompt was unreachable from the head.

They were not wrong about the walk. They were wrong about the repository. That
queue is perfectly coherent — `15 → 16 → 17`, every link resolving. Nothing is
unreachable. What is wrong is the head, and `CASP-PROMPT-003` already said so on
the line above.

## The defect

0.13.0 shipped a guard for exactly this. Its comment in `src/chain.ts` states the
intent in full:

> when `next_prompt` is missing **or already shipped**, `CASP-PROMPT-001`/`003`
> already FAIL, and burying that one actionable finding under an orphan warning
> per queued prompt would make the report worse.

The condition implemented half of that sentence:

```ts
const hasHead = headRel !== null && byRel.has(headRel);
```

`byRel` is built from **every** prompt (`src/chain.ts:282`), shipped ones
included. So a head that existed but had already shipped satisfied `hasHead`, the
reachability walk ran from a node that nothing chains forward from, and every
declaring queued prompt came back unreachable — one WARN each.

The blast radius is the worst possible one: `next_prompt` pointing at an
already-shipped slice is the single most common drift there is, and the specific
bug this product was built to catch. The report that matters most was the report
being degraded, and it degrades in proportion to how long the queue is — a repo
that plans further ahead gets more noise, which is precisely backwards.

## The fix

A usable head means a prompt that can still **run**, not merely a file that
exists:

```ts
const headPrompt = headRel !== null ? byRel.get(headRel) : undefined;
const hasHead =
  headPrompt !== undefined &&
  (headPrompt.status === 'queued' || headPrompt.status === 'in-progress');
```

`analysis.order` is only assigned when the walk ran and the chain is coherent, so
a shipped head now also yields `queue: null` in `status --json` rather than a
partial order — the same principle established in 0.13.0 when a false `queue`
shipped and had to be corrected post-review.

On the demo cockpit the same drift now reports `26 PASS · 0 WARN · 1 FAIL`.

## Why the existing test missed it

There *was* a test for this guard —
`no usable head → no orphan storm on top of the real finding`. It pointed
`next_prompt` at `GONE.md`: a head that does not exist. The other half of the
documented sentence, the head that exists but already shipped, was never
exercised.

A test that pins half a claim is indistinguishable, from the outside, from a test
that pins all of it. Same shape as 0.14.0's consent-gate test, which asserted
nothing was *written* while nothing asserted nothing was *run*.

Two tests added (193 → 195): a shipped head yields `CASP-PROMPT-003` and zero
`prompt_chain.orphan.*` findings; and `status --json` reports `queue: null` on a
shipped head.

## Also in this release

`docs/img/capture-readme-shots.sh` — the README's six proof screenshots are now
regenerated from a real cockpit by a committed script rather than by hand. It
**refuses to run unless `casp --version` matches the release it documents**,
because a screenshot taken on an older binary is a stale claim inside the one
document that argues stale claims are the problem.

The gate shot uses `check --quiet`. The full report opens with about 26 PASS
lines, and a wall of green above the one red line is how a reader misses the
point. The flag is real and documented, so the shot stays an honest output.

## Not queued

`next_phase` / `next_prompt` stay `null`. `demand-gated-tail` remains a holding
placeholder that must not be executed as a session.
