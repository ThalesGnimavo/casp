# CASP threat model

CASP runs against repository content — often automatically, inside a pre-push
hook or CI, on a state file and prompts that an autonomous agent wrote. So the
guiding assumption is blunt:

> **Repository content is untrusted input.** `casp/state.json`, prompt
> frontmatter, directory and file names, and CLI arguments may all be hostile or
> malformed. Verifying state must never execute code those inputs control.

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
- **No arbitrary code execution to verify state.** CASP never runs project
  build scripts, hooks, or test suites to reach a verdict. It reads files and
  asks git plumbing questions. Verifying state cannot, by construction, run the
  project's code.
- **Symlink cycles.** The `--all` fleet walk tracks resolved real paths, so a
  symlink cycle (`a/b -> ../a`) cannot recurse forever.
- **Malformed input.** Invalid JSON, missing frontmatter, and unexpected types
  degrade to findings (FAIL/WARN), not crashes.
- **The pre-push hook is hardened.** The installed `pre-push` runs under
  `set -eu` (POSIX; `pipefail` is intentionally omitted as a bashism that would
  break `#!/bin/sh`), refuses to clobber a foreign hook, and never touches
  `core.hooksPath`.

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
