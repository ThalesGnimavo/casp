/**
 * `casp install-hook` — write `.git/hooks/pre-push` so `casp check` runs on
 * every push without anyone remembering to.
 *
 * This is P03 ("check before every push — not optional") turned from discipline
 * into mechanism. A hands-off self-verifying loop auto-commits and pushes; it
 * will not run `casp check` by hand. Wiring the deterministic state gate into
 * `pre-push` is what makes CASP fire INSIDE the autonomous loop instead of being
 * a step the agent skips.
 *
 * Scope guard (the prompt's DO NOT): we touch ONLY `<git-dir>/hooks/pre-push`.
 * We never write `core.hooksPath` or any git config, and `casp init` never calls
 * this — installation is explicit opt-in.
 */

import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { exit } from 'node:process';
import { c, git, readTextFile } from './shared.js';

// The line that marks a pre-push hook as CASP-managed. Idempotency, --force and
// --remove all key off this exact string: if it is present, the hook is ours to
// refresh or delete; if it is absent, the hook is a stranger we must not clobber.
const MARKER = 'CASP-MANAGED-HOOK';

/**
 * The hook body. A POSIX sh script that runs the deterministic gate and exits
 * with its code (0 clean / 1 drift), so git aborts the push on drift.
 *
 * Resolution order matches the prompt: prefer `npx --no-install
 * @justethales/casp` (the locally-installed package, no network), fall back to a
 * `casp` already on PATH. We probe with `--version` first because that cleanly
 * separates "package resolvable" from the check's own verdict — exec'ing `check`
 * directly off npx would conflate "not installed" with "drift", and a push could
 * sail through on a missing binary.
 */
function hookBody(): string {
  return `#!/bin/sh
# ${MARKER} — installed by \`casp install-hook\`. Do not edit by hand.
# Deterministic, local-only pre-push gate: blocks the push when casp/state.json
# has drifted from git. Remove with: casp install-hook --remove
# POSIX: -e aborts on any failure, -u treats an unset variable as an error. We
# intentionally omit pipefail (a bashism that would break under a strict #!/bin/sh).
set -eu
if npx --no-install @justethales/casp --version >/dev/null 2>&1; then
  exec npx --no-install @justethales/casp check --quiet
elif command -v casp >/dev/null 2>&1; then
  exec casp check --quiet
else
  echo "casp: not found (neither npx --no-install @justethales/casp nor casp on PATH)." >&2
  echo "      pre-push gate cannot run — install @justethales/casp or remove the hook." >&2
  exit 1
fi
`;
}

// Ours iff the marker appears as its own hook comment (`# CASP-MANAGED-HOOK …`),
// not merely as a substring — so a foreign hook that happens to mention the word
// in prose is never misclassified as CASP's and silently overwritten/removed.
export function isCaspHook(path: string): boolean {
  // A hook that cannot be read (a directory at pre-push, mode 000) is not ours.
  // Fail closed: `install` refuses to overwrite it, `--remove` refuses to delete
  // it — the same posture as any foreign hook, and never a crash.
  const read = readTextFile(path);
  return read.ok && read.content.includes(`# ${MARKER}`);
}

/**
 * Locate the pre-push hook path via git itself, so worktrees and `.git`-as-a-file
 * resolve correctly. Returns null when we are not in a git repo, or when
 * `core.hooksPath` is set — in that case git ignores `<git-dir>/hooks`, so writing
 * there would be a silent no-op. We refuse rather than touch core.hooksPath
 * (explicit DO NOT), leaving the caller to wire the check into their custom dir.
 */
export function resolveHookPath(
  root: string
): { ok: true; path: string } | { ok: false; reason: 'no-git' | 'hooks-path' } {
  if (git('rev-parse --is-inside-work-tree', root) !== 'true') {
    return { ok: false, reason: 'no-git' };
  }
  if (git('config --get core.hooksPath', root)) {
    return { ok: false, reason: 'hooks-path' };
  }
  // `--git-path hooks/pre-push` accounts for worktrees (hooks live in the common
  // dir) and `.git` files. It can be relative to cwd, so resolve against root.
  // The `|| '.git/hooks/pre-push'` fallback is only reached if git emits nothing
  // despite being inside a work tree (a broken repo) — in which case `.git` is a
  // plain directory and the default layout is the right guess.
  const rel = git('rev-parse --git-path hooks/pre-push', root) || '.git/hooks/pre-push';
  return { ok: true, path: resolve(root, rel) };
}

function failNoGit(): never {
  console.error(c.red('FAIL') + ' not a git repository');
  console.error(c.gray('       → casp install-hook writes .git/hooks/pre-push; run it inside a repo'));
  exit(1);
}

function failHooksPath(): never {
  console.error(c.red('FAIL') + ' core.hooksPath is set — git ignores .git/hooks here');
  console.error(c.gray('       → casp will not touch core.hooksPath (your config, your call)'));
  console.error(c.gray('       → add `casp check --quiet` to the pre-push hook in that directory yourself'));
  exit(1);
}

export function runInstallHook(args: string[]): void {
  const remove = args.includes('--remove');
  const force = args.includes('--force');
  const root = process.cwd();

  const resolved = resolveHookPath(root);
  if (!resolved.ok) {
    if (resolved.reason === 'no-git') failNoGit();
    failHooksPath();
  }
  const dest = resolved.path;
  const shown = relative(root, dest) || dest;

  if (remove) {
    if (!existsSync(dest)) {
      console.log(c.gray('nothing to remove — no pre-push hook present'));
      exit(0);
    }
    if (!isCaspHook(dest)) {
      console.error(c.red('FAIL') + ` ${shown} is not a CASP hook — refusing to remove it`);
      console.error(c.gray('       → delete it yourself if you mean to'));
      exit(1);
    }
    rmSync(dest);
    console.log(`${c.green('remove')}  ${shown}`);
    console.log(c.gray('pre-push gate uninstalled'));
    exit(0);
  }

  if (existsSync(dest) && !isCaspHook(dest) && !force) {
    console.error(c.red('FAIL') + ` ${shown} already exists and is not a CASP hook`);
    console.error(c.gray('       → re-run with --force to overwrite it'));
    exit(1);
  }

  const already = isCaspHook(dest);
  const clobbered = existsSync(dest) && !already; // a foreign hook, overwritten under --force
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, hookBody());
  chmodSync(dest, 0o755);

  if (already) {
    console.log(`${c.green('ok')}      ${shown} — CASP hook refreshed (already installed)`);
    exit(0);
  }
  console.log(`${c.green('write')}   ${shown}`);
  if (clobbered) console.log(c.yellow('overwrote a non-CASP pre-push hook (--force)'));
  console.log(c.gray('pre-push gate installed — `casp check --quiet` now runs on every push'));
  exit(0);
}
