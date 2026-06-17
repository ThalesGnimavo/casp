# 26-06-17-001 — 0.6.0: `casp install-hook`

## What shipped
- `casp install-hook` writes an executable `.git/hooks/pre-push` that runs
  `casp check --quiet`, turning "check before every push" from discipline into
  mechanism — the deterministic state gate fires inside a hands-off autonomous
  loop instead of being a step the agent skips.
- Safe by construction: a `CASP-MANAGED-HOOK` marker on its comment line; refuses
  to clobber a foreign hook without `--force`; idempotent re-install; `--remove`
  only removes a hook CASP wrote.
- Boundaries: opt-in only (`init` never installs it); never touches
  `core.hooksPath` (refuses when set rather than writing a dead hook);
  worktree / `.git`-file safe via `git rev-parse --git-path`.
- Hook resolution prefers `npx --no-install @justethales/casp` and falls back to
  `casp` on PATH, `--version`-probed so a missing binary never reads as drift.

## Tests
- Eight new tests (42 total): install / idempotent / `--force` / `--remove`, the
  installed hook run directly blocks a drifted push (exit 1) and passes a clean
  one (exit 0), `core.hooksPath` refusal, linked-worktree resolution, no-git
  refusal.

## Audit
- Read-only audit verdict GO-WITH-FIXES: hardened the hook marker match against
  substring collision; added the `core.hooksPath` and worktree tests.
