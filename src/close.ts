/**
 * `casp close` — the guided, deterministic session close.
 *
 * Auto-detects the implementation commit (HEAD) and the newest session log,
 * lets you confirm or override them, bumps `last_commit` / `last_session_id` /
 * `updated_at` in state.json, then runs `casp check` and exits with its verdict.
 *
 * HARD CONSTRAINT: close NEVER runs git (no add / commit / push). It mutates
 * casp/state.json and validates — the operator owns the commit. The moment it
 * commits it stops being a state verb and becomes a harness, which the protocol
 * forbids. `last_commit` is set to the CURRENT HEAD (the implementation commit);
 * the operator's own state-bump commit then moves HEAD one past it, which
 * `casp check` recognizes as the canonical close loop (PASS), not drift.
 *
 *   casp close                          # interactive: confirm detected HEAD + log
 *   casp close --yes                    # non-interactive: accept detected values
 *   casp close --commit 1a2b3c --log 26-06-15-004-foo
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { exit, stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { c, git, loadStateWithHash, resolveDirs, saveState, StateConflictError, todayISO } from './shared.js';
import { runCheck } from './check.js';

function getArg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  return args[i + 1];
}

// Newest session log by filename (YY-MM-DD-NNN-… sorts chronologically), id
// stripped of the .md extension. Empty string when there is no log yet.
function newestLogId(logsDir: string): string {
  if (!existsSync(logsDir) || !statSync(logsDir).isDirectory()) return '';
  const logs = readdirSync(logsDir)
    .filter((f) => /^\d{2}-\d{2}-\d{2}-\d{3}-.*\.md$/.test(f))
    .sort();
  if (logs.length === 0) return '';
  return logs[logs.length - 1].replace(/\.md$/, '');
}

export async function runClose(args: string[]): Promise<void> {
  const root = process.cwd();
  const statePath = join(root, 'casp', 'state.json');
  const loaded = loadStateWithHash(statePath);
  if (!loaded) {
    console.error(c.red('no readable casp/state.json found'));
    console.error(c.gray('  → run `casp init` first, or fix the JSON'));
    exit(1);
  }
  const { state, hash } = loaded;

  const yes = args.includes('--yes') || args.includes('-y');
  const interactive = Boolean(stdin.isTTY) && !yes;

  // Detect defaults.
  let commit = getArg(args, '--commit') ?? git('rev-parse --short HEAD', root);
  if (!commit) {
    console.error(c.red('cannot detect HEAD — is this a git repo with at least one commit?'));
    console.error(c.gray('  → pass --commit <sha> explicitly'));
    exit(1);
  }
  const dirs = resolveDirs(root, state);
  let logId = getArg(args, '--log') ?? newestLogId(dirs.logsAbs);

  if (interactive) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      const a1 = (
        await rl.question(
          `${c.bold('last_commit')} → ${c.cyan(commit)}  ${c.gray('[Enter to accept, or type a SHA]')} `
        )
      ).trim();
      if (a1) commit = a1;

      const shown = logId || c.gray('(none detected)');
      const a2 = (
        await rl.question(
          `${c.bold('last_session_id')} → ${c.cyan(shown)}  ${c.gray('[Enter to accept, or type an id]')} `
        )
      ).trim();
      if (a2) logId = a2;
    } finally {
      rl.close();
    }
  }

  // Apply. last_session_id is only overwritten when we actually have one —
  // never clobber a real id with an empty detection.
  state.last_commit = commit;
  if (logId) state.last_session_id = logId;
  state.updated_at = todayISO();
  try {
    saveState(statePath, state, hash);
  } catch (err) {
    if (err instanceof StateConflictError) {
      console.error(c.red(err.message));
      exit(1);
    }
    throw err;
  }

  console.log('');
  console.log(`${c.green('close')}   casp/state.json bumped`);
  console.log(`        ${c.gray(`last_commit     → ${commit}`)}`);
  console.log(`        ${c.gray(`last_session_id → ${state.last_session_id}`)}`);
  console.log(`        ${c.gray(`updated_at      → ${state.updated_at}`)}`);
  console.log(c.gray('        (no git operations — commit the state bump yourself)'));

  // Validate and exit with the check's verdict. runCheck prints its own report
  // and calls exit(), so this is the terminal action.
  runCheck([]);
}
