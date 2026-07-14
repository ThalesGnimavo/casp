# What CASP proves — and what it does not

CASP's wedge is a precise claim, and its precision is the point:

> **The model holds the context. CASP proves the state is true — against git.**

Read exactly: CASP proves that a project's **recorded execution state** is
**consistent with the evidence git can show** — the commit history, HEAD, the
working tree, the migrations directory, and the frontmatter of the prompts and
logs the state points at. Every verdict is a deterministic comparison of a
recorded claim against a defined evidence source. Nothing probabilistic enters
the gate.

That is a strong, narrow guarantee. Keeping it narrow is what keeps it true.

## What CASP proves

When `casp check` exits 0, it has verified — for every rule in the active set
(see `casp rules`) — that:

- `state.next_prompt` points at a file that exists and is **not already
  shipped** (the exact drift CASP was built to catch);
- `state.last_commit` is a real commit in this repository's history, consistent
  with HEAD;
- `state.last_session_id` maps to a session-log file that exists;
- `phases_shipped` has no duplicates;
- `migrations_applied` matches the migration files on disk (when the project
  tracks migrations);
- every shipped prompt carries a resolvable `session_log`;
- the state surface (`casp/`, sessions, logs) has no uncommitted changes.

Each of these is a claim with a **defined verifier and an accepted evidence
source**. `casp explain <CODE>` prints the exact claim, evidence, and
remediation for any rule.

## What CASP does NOT prove

CASP verifies only the claims it has a rule for, against the evidence git can
provide. A clean `casp check` deliberately says **nothing** about:

- **that the code is correct** — that a feature works, or that the software is
  bug-free. Tests and review cover code; CASP covers recorded state.
- **that a feature is deployed** — code existing in git is not the same as code
  running in production.
- **that a migration ran on a remote database** — CASP sees the migration
  *files*, not the state of any live database.
- **that business requirements were met** — CASP does not read intent, only the
  recorded state and the repository.
- **that every statement an agent made is true** — only the specific state
  claims a rule covers are checked.
- **infrastructure, secrets, or anything outside the repository** — CASP reads
  your filesystem and your `git`, nothing else.

This is why CASP is a **complement**, not a replacement. It is the deterministic
floor beneath tests, review, and CI — the one check that is a mechanical
comparison of recorded state against git evidence, not a judgement about your
code. Two agents agreeing that a phase is done is not evidence; a `last_commit`
that resolves in `git log` is.

> **Memory preserves a record. CASP checks defined claims against evidence.**
> It does not make an agent smarter — it makes the workflow harder to fool.
