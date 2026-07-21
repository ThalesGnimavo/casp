/**
 * `casp verify <commit>` — run the validator against a historical commit.
 *
 * Materializes the commit in a throwaway DETACHED worktree, runs the exact same
 * check there (`checkOne` — its git calls are scoped to the worktree), prints the
 * report, propagates the exit code, and ALWAYS removes the worktree.
 *
 * Read-only by construction: it never mutates the user's worktree, index, or
 * history — only `git worktree add/remove` on a temp path. The exit code is
 * computed INSIDE the try and applied AFTER the finally, because `process.exit()`
 * does not run finally blocks — exiting mid-try would leak the worktree.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exit } from 'node:process';
import { c, git, gitArgs } from './shared.js';
import { checkOneSafe, printReport, summarize } from './check.js';

export function runVerify(args: string[]): void {
  const noGit = args.includes('--no-git');
  const ref = args.find((a) => !a.startsWith('--'));
  if (!ref) {
    console.error(c.red('usage: casp verify <commit> [--no-git]'));
    exit(1);
  }
  const root = process.cwd();
  if (git('rev-parse --is-inside-work-tree', root) !== 'true') {
    console.error(c.red('FAIL') + ' not a git repository');
    exit(1);
  }
  // ref is a CLI argument — inject-safe form (no shell).
  const sha = gitArgs(['rev-parse', '--verify', `${ref}^{commit}`], root);
  if (!sha) {
    console.error(c.red('FAIL') + ` not a commit: ${ref}`);
    console.error(c.gray('  → pass a commit, tag, or branch that exists in this repo'));
    exit(1);
  }

  // mkdtemp creates the PARENT; git worktree add creates `wt` inside it (the
  // target must not pre-exist). Cleanup removes the whole parent.
  const parent = mkdtempSync(join(tmpdir(), 'casp-verify-'));
  const wt = join(parent, 'wt');
  let code = 0;
  try {
    gitArgs(['worktree', 'add', '--detach', wt, sha], root);
    if (!existsSync(wt)) {
      console.error(c.red('FAIL') + ` could not create a worktree for ${sha}`);
      code = 1;
    } else {
      console.error(c.bold('casp verify') + ` · ${c.cyan(ref)} → ${c.gray(sha)}`);
      const findings = checkOneSafe(wt, { noGit });
      printReport(findings, false);
      code = summarize(findings).fail > 0 ? 1 : 0;
    }
  } finally {
    // ALWAYS tear the worktree down — registered worktree first, then the dir.
    gitArgs(['worktree', 'remove', '--force', wt], root);
    rmSync(parent, { recursive: true, force: true });
    git('worktree prune', root);
  }
  exit(code);
}
