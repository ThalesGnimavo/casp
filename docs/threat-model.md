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
| `casp live hook` stdin (a harness hook payload) | **Untrusted** | `JSON.parse`d as data and read for three string fields; never executed, never shelled, never written back. Unparseable input exits 0. |
| `casp/live/claims.json`, `casp/live.config.json` | **Untrusted** | Parsed as data. Path entries are compared as strings — no globs, no regex, no shell. A corrupt or hostile file can only make the guard stand down. |

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

## `casp live` — two surfaces, neither of them execution

`casp live` (0.15.0) reads a hook payload on **stdin** and probes process ids
with **signal 0**. Both look like new attack surface at a glance; neither is an
execution surface, and this section states why in the same terms as the rest of
this document.

**stdin is parsed, never run.** `casp live hook` reads one JSON object from the
harness and uses exactly three fields — `session_id`, `hook_event_name`,
`tool_name` — plus `tool_input.file_path`. Every one is treated as an opaque
string: compared against claim owners, matched against a set of tool names, or
normalized as a path. Nothing from stdin reaches a shell, a `git` invocation, a
regular expression, or the filesystem as anything but a **relative path used for
string comparison**. A path that resolves outside the repository root is
discarded rather than policed. Malformed JSON, a missing field, an unknown
event: exit 0, silently. The worst a hostile payload achieves is a journal line
it chose the contents of, in a file that is gitignored and that nothing in the
gate reads.

**`kill(pid, 0)` signals nothing.** Liveness is `process.kill(pid, 0)`, which
performs the permission and existence check of a signal delivery and then
delivers no signal — the standard POSIX probe. It cannot stop, kill, or perturb
the target. The pid it probes comes from `claims.json` (untrusted), so a hostile
file can name any integer; the only outcomes are *this pid exists*, *it does
not* (`ESRCH`), or *it exists and belongs to another user* (`EPERM`, read as
alive — the conservative direction). The information disclosed is whether a
given pid is running, to a process already running as that user on that machine,
which could equally run `ps`. There is no path from that answer to anything but
a claim being kept or pruned.

**The blast radius, stated plainly.** This is the first CASP verb that can
refuse an action in *another* process: as a `PreToolUse` hook it returns exit 2
and the harness blocks the tool call. Every other verb only ever chose its own
exit code. Three properties bound it:

- **Fail-open is absolute.** Every degraded state — expired claim, dead holder,
  unparseable timestamp, corrupt claims file, bad stdin, unknown event, any
  internal throw — exits 0. The single non-zero case is a live foreign claim on
  the exact path. A coordination layer that breaks must degrade to *no
  coordination*, never to *no editing*.
- **The kill switch does not require the wedged session.** A misfiring guard
  blocks file writes, so an escape hatch that means "edit `settings.json`" is no
  escape hatch. `CASP_LIVE=0` is checked on every invocation before any file is
  touched; `casp live off` writes a repo marker; `casp live off --global` writes
  `~/.casp/live.off` and stands every guard on the machine down. `casp` is
  usually installed globally, so the off ramp is machine-sized too.
- **It is walled off from the gate.** `casp/live/` self-writes a `.gitignore` on
  first touch. `casp check` has no code path that reads anything under it, and
  the boundary is enforced by the filesystem rather than by convention. Deleting
  that `.gitignore` by hand degrades the cockpit to a **non-blocking WARN** on
  `workdir.clean` (never a FAIL, never an exit 1), and the next `casp live`
  command restores it.

**The limit that matters most, named rather than papered over: CASP guards
path WRITES, not the side effects of shared state.** A claim covers a path, and
the guard fires on a file-writing tool call against that path. It has nothing to
say about an action that stays inside its own lane and still reaches out through
some state the whole repository shares.

The canonical case, measured on this machine rather than imagined:
`git add casp/state.json && git commit` — one path, squarely inside the actor's
lane. The commit published **945 lines of unrelated deletions** another session
had staged, because `git commit` without a pathspec publishes the **entire
index**, and the index is one object shared by every process in the repository.
No claim would have prevented it, and no claim should be expected to: the guard
saw a `Bash` call, and `Bash` is deliberately unguarded because parsing
arbitrary shell for file targets is guesswork.

The index is not alone in this family. A dependency install that regenerates a
shared lockfile, a schema migration, a dev-server port, a build cache — each is
an in-lane action with an out-of-lane effect. **`casp live` does not detect any
of them, and this document would rather say so than let the first serious user
discover it.** The mitigations are procedural, not mechanical: commit by
pathspec (`git commit <paths> -m …`) instead of relying on `git add` discipline,
and keep genuinely shared surfaces in the reserved category so a lane is refused
the *direct* write at least.

**Residual, accepted and named.** Claim ownership is a session id, or failing
that a shared harness process id. Neither is authenticated: any process on the
machine can write `claims.json` or pass `--session <someone-else>`. This is by
design — claims are **advisory coordination between cooperating sessions on one
machine**, not an access-control mechanism, and treating them as one would be
the mistake. There is no trust boundary here to breach: an attacker who can
write `casp/live/claims.json` can already write the repository itself.

## Known residual work (defense-in-depth, tracked)

- **Full `gitArgs()` migration.** The interpolating call sites are already
  inject-safe. The remaining `git()` calls take only static literals (no
  injection surface), but migrating them all to the argv form is a defense-in-
  depth cleanup slated to land incrementally, not as one churny rewrite.
- **`casp live` claim matching does not resolve symlinks.** A repository reached
  through a symlink, or a payload spelling the same file through one, reads as
  "outside the repo" and the guard stands down for that call. The direction is
  ALLOW, consistent with the fail-open contract; resolving real paths would
  require the target to exist, which `Write` contradicts.
- **Path containment for configured directories.** `sessions_dir`, `logs_dir`
  and `migrations_dir` are read from state; today a value like `../../etc` would
  resolve outside the project root. This is a read-only enumeration (no writes,
  no execution) and a future rule may reject root-escaping paths outright.

## Reporting

Found a security issue? Please report it privately via the repository's security
contact rather than a public issue, so a fix can ship before disclosure.
