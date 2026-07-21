---
phase: readme-lead-with-the-queue
---

# 26-07-21-006 — README leads with the queue, not only the gate (docs only, no code)

## The defect

Session 005 fixed the README's *on-ramp* — it now opens on a concrete problem
instead of a category claim. It did not fix the README's *coverage*.

The document described one half of the product well and the other half barely.
The gate — state vs git, exit 1 on drift, push blocked — was stated in the first
screen and reinforced throughout. The **queue** — you write the plan once and stop
hand-writing session prompts — appeared only at §05, and there only as a
*scoreboard* of shipped/queued phases.

A scoreboard shows a reader that CASP tracks order. It does not show them that
they stop composing a task at the start of every session, which is the change
people actually feel after a week. The mechanism that produces it —
`casp new prompt`, the `next_after` frontmatter, `state.json.next_prompt` at the
head of the line, `casp next` handing it over — was documented in scattered
pieces (§04's template note, the §07 command deck, the Quickstart's last line)
and never assembled into the workflow those pieces add up to.

## What shipped

**New `## 00` section, before the existing §01**, and one pointer line in the
intro so the second half is visible on a first read rather than at §05.

The section:

- States the claim directly: describe the work once, and every session starts by
  asking CASP what's next — the answer being a prompt nobody had to write.
- Shows the two commands (`casp new prompt --slug <name>`, `casp next`).
- Shows a five-file queue with `status` and `next_after` frontmatter, and marks
  which file `state.json.next_prompt` points at.
- Lists the five rules that make the queue trustworthy rather than merely stored:
  `CASP-PROMPT-001` / `-003` / `-005` / `-006` and `CASP-SESSION-003`.

Section numbering is unchanged from `01` onward — the new block is `00`, so no
existing anchor or inbound link moves.

## The scope line, and why it is in the section rather than a footnote

The felt experience of this workflow is "autopilot", and that word would be a
canon violation if the README implied CASP provides it. It does not. `casp next`
is a printer: it prints and never executes, deliberately, because orchestration
is on the anti-roadmap.

The section therefore closes by stating three limits in plain text:

1. CASP does not run sessions; the agent is the autopilot.
2. `casp next` never executes anything.
3. **`next_after` is a template convention, not an enforced rule.** It ships in
   `templates/templates/session-prompt.md` so a human can read the order at a
   glance, but no rule validates chain integrity. Verified against
   `casp rules`: the nine `CASP-PROMPT-*` / `CASP-SESSION-*` rules cover the
   *head* of the queue (exists, has frontmatter, not already shipped, canonical
   status) and the integrity of what has already shipped (shipped prompts have
   logs, shipped phases are declared). Nothing checks the ordering of prompts
   that have not run.

Writing "CASP manages your roadmap end to end" would have been the easy sentence
and would have promised a validator that does not exist. A reader who installs on
that promise finds a printer, and the deterministic wedge pays for the
overclaim.

## Verification

- `casp check` — 0 FAIL before and after.
- Both in-document anchors resolve under GitHub's slug algorithm (lowercase,
  strip non-`[\w\- ]`, each space to one hyphen — consecutive spaces produce
  consecutive hyphens, which the `·` in the heading does produce).
- Section numbering `00`-`10` contiguous.
- `README.md` is in `package.json.files`, so this is also the npm landing page.

## Deferred / risks

- **The npm page still shows the old README.** The registry only re-renders a
  package's README on publish, so npmjs.com/package/@justethales/casp keeps the
  0.12.1 copy until the next release. GitHub is current immediately. Publishing
  purely to refresh a README is a CEO decision, not a reason to cut a release;
  the natural path is for this text to ride along with the next version bump.
- **A `next_after` chain-integrity rule is a plausible future category** — it
  would turn the convention into something the gate can prove (a queued prompt
  whose `next_after` names a slice that never shipped, or a cycle, or two
  prompts claiming the same predecessor). Not proposed for the frozen protocol
  queue; recorded here because the honest scope line above is exactly the shape
  of a gap that a later rule could close.
