# CASP threat model

CASP runs against repository content — often automatically, inside a pre-push
hook or CI, on a state file and prompts that an autonomous agent wrote. So the
guiding assumption is blunt:

> **Repository content is untrusted input.** `casp/state.json`, prompt
> frontmatter, directory and file names, and CLI arguments may all be hostile or
> malformed. Verifying state must never execute code those inputs control.

**One verb is a deliberate, consented exception: `casp fact verify <id>`.** It
replays a fact's declared `method` — a shell command the project wrote into
`casp/facts.json`, which is repository content and therefore untrusted by the
rule above. It is the only place in the binary that executes repository content,
it never runs during `casp check` or any gate, and it cannot run without an
explicit human yes (or `--yes`, typed on purpose). See *The one execution
surface* below.

CASP's core promise — deterministic, local-only, zero telemetry — is also its
security posture: there is no network path, no account, no remote to attack, and
nothing to exfiltrate. The review is one line: *it never leaves the machine.*
This document records the concrete threats the implementation defends against.

## Trust boundaries

| Input | Trust | Handling |
|---|---|---|
| `casp/state.json` values (`last_commit`, `sessions_dir`, `logs_dir`, …) | **Untrusted** | Parsed as data; interpolated into git only via the injection-safe `gitArgs()` path. |
| Prompt / log frontmatter | **Untrusted** | Parsed with a YAML parser; malformed frontmatter is a finding, never an error that runs code. |
| File and directory names on disk | **Untrusted** | Enumerated with `readdirSync`; never passed to a shell. |
| CLI arguments (`casp verify <ref>`, `casp state diff A B`) | **Semi-trusted** (the user's own shell) | Still routed through `gitArgs()` so a crafted ref cannot inject. |
| The `git` binary and the local filesystem | **Trusted** | The verification substrate. |

## Threats addressed

- **Command injection via repository content.** git is invoked in two forms.
  `git()` uses a shell and MUST only ever receive **static, literal** argument
  strings. Any call that interpolates untrusted input — a value from
  `state.json` or a CLI argument — goes through `gitArgs()`, which passes an
  **argv array to `execFileSync` with no shell**, so a value like
  `HEAD; rm -rf ~` becomes a single invalid git argument (git errors, we return
  `''`, the check FAILs), never a shell command. This is covered by a regression
  test.
- **No arbitrary code execution to reach a verdict.** CASP never runs project
  build scripts, hooks, or test suites to decide PASS/WARN/FAIL. It reads files
  and asks git plumbing questions. **Every gating path — `casp check`, the
  pre-push hook, `casp next`, `casp status`, `--all` — is execution-free by
  construction.** The single exception is `casp fact verify`, which gates
  nothing and cannot run unattended; see below.
- **Symlink cycles.** The `--all` fleet walk tracks resolved real paths, so a
  symlink cycle (`a/b -> ../a`) cannot recurse forever.
- **Malformed input.** Invalid JSON, missing frontmatter, and unexpected types
  degrade to findings (FAIL/WARN), not crashes.
- **Unreadable input.** A path that exists and cannot be opened — mode `000`, a
  directory squatting a `*.md` path, a symlink cycle, a file unlinked between the
  existence check and the read — degrades to a `CASP-IO-001` finding, not a
  crash. **A path that would BLOCK is refused before it is opened:** a FIFO,
  socket or device named like a document is rejected by a `stat` first, because
  `readFileSync` on a pipe with no writer does not fail, it hangs — and a gate
  that never returns is worse than one that crashes, producing neither a verdict
  nor an exit code. Every read of repository content goes through one door
  (`readTextFile` / `readDirEntries` / `readFrontmatter` in `src/shared.ts`),
  which returns a result instead of throwing. It fails **closed**: the finding is
  FAIL, because an unverifiable claim is not a passing claim. `check --json` and
  `status --json` still emit a valid, parseable report in this state — a machine
  contract that produces nothing is a contract that does not hold — and
  `status`/`doctor` keep their documented non-gating exit codes. A top-level
  handler in `src/cli.ts` backstops anything unforeseen with a one-line
  diagnostic and exit 1, never a Node stack trace.
- **The pre-push hook is hardened.** The installed `pre-push` runs under
  `set -eu` (POSIX; `pipefail` is intentionally omitted as a bashism that would
  break `#!/bin/sh`), refuses to clobber a foreign hook, and never touches
  `core.hooksPath`.

## The one execution surface — `casp fact verify`

A fact declares the `method` that produced its value so the claim can be
reproduced. `casp fact verify <id>` replays that method through a shell, in the
repository root, and offers to write the result back. Everything else in the
facts layer treats `method` as inert data: `casp check`, `casp fact check`,
`casp fact list` and `casp fact stale` read it, pattern-match it against the trap
registry, and never run it.

The rules that keep this honest:

- **Consent precedes execution.** The method is printed, then the operator is
  asked `run this command?` **before** anything runs. Declining, or `Ctrl+D`,
  aborts having run nothing.
- **No TTY means no execution.** In a non-interactive shell — CI, a hook, an
  agent's subprocess — `casp fact verify` refuses and exits 1 rather than
  assuming consent. `--yes` is the only bypass and has to be typed deliberately.
- **It never gates.** No rule, hook or CI path invokes it. A repository can be
  fully validated without it ever running.
- **Two regression tests pin this**, and they assert the *side effect* of the
  method, not just the state file. That distinction is the whole lesson: an
  earlier revision executed the method first and only then asked "write this
  fact?", so the existing test — which checked that nothing was written — passed
  while arbitrary shell ran with no TTY, no `--yes` and no consent. A test that
  asserts the wrong invariant is indistinguishable from no test.

**What this means for you.** Running `casp fact verify` on a repository you do
not trust is equivalent to running a command out of one of its files, because
that is exactly what it does. Read the printed method before answering yes. The
gate is real, but it is a consent gate, not a sandbox: CASP does not attempt to
constrain what the method can do once you approve it.

## Known residual work (defense-in-depth, tracked)

- **Full `gitArgs()` migration.** The interpolating call sites are already
  inject-safe. The remaining `git()` calls take only static literals (no
  injection surface), but migrating them all to the argv form is a defense-in-
  depth cleanup slated to land incrementally, not as one churny rewrite.
- **Path containment for configured directories.** `sessions_dir`, `logs_dir`
  and `migrations_dir` are read from state; today a value like `../../etc` would
  resolve outside the project root. This is a read-only enumeration (no writes,
  no execution) and a future rule may reject root-escaping paths outright.

## Reporting

Found a security issue? Please report it privately via the repository's security
contact rather than a public issue, so a fix can ship before disclosure.
