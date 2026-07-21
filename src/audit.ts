/**
 * `casp audit` — the deep-audit watermark.
 *
 * CASP separates two verification tiers that were previously conflated:
 *
 *   • Cheap per-merge proof — fmt / typecheck / lint / the touched module's own
 *     tests — gated by `casp check`, run EVERY session. Fast, and the only thing
 *     standing between a refactor and an irreversible bug (money, cross-tenant).
 *
 *   • The expensive holistic pass — an adversarial sub-agent audit + the full
 *     e2e battery + a security review. This is slow and token-heavy, so it runs
 *     in BATCH, on demand, over everything merged since the last one — NEVER per
 *     session. Running it every session is what turns a 7-minute close into 40.
 *
 * This command tracks the watermark separating the two: `last_deep_audit`, the
 * commit that last passed the holistic pass. Everything after it on the branch
 * is "unaudited" and must clear a deep audit before a production cutover.
 *
 *   casp audit status         what's unaudited: <last_deep_audit>..HEAD (read-only)
 *   casp audit bump [<sha>]    record HEAD (or <sha>) as deep-audited (writes state)
 *
 * The `/audit-batch` skill calls `status` to scope the review and `bump` on GO.
 * `casp check` never blocks on the watermark — the batch pass is a deploy gate,
 * not a merge gate. Skipping it delays a deploy; it never blocks a commit.
 */

import { exit } from 'node:process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { c, git, gitArgs, loadState, loadStateWithHash, saveState, StateConflictError, type State } from './shared.js';

const STATE_REL = 'casp/state.json';

function requireRepo(root: string): void {
  if (git('rev-parse --is-inside-work-tree', root) !== 'true') {
    console.error(c.red('FAIL') + ' not a git repository');
    exit(1);
  }
}

/** Full 40-char SHA of a ref, or '' if it does not resolve. Inject-safe. */
function resolveSha(ref: string, root: string): string {
  return gitArgs(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], root);
}

function shortSha(ref: string, root: string): string {
  return gitArgs(['rev-parse', '--short', ref], root);
}

interface AuditStatus {
  watermark: string | null;
  head: string;
  unauditedCount: number;
  commits: string[];
  files: string[];
  // watermark is set but no longer in history (rebased/squashed away).
  watermarkOrphaned: boolean;
}

function computeStatus(state: State, root: string): AuditStatus {
  const head = shortSha('HEAD', root);
  const raw = typeof state.last_deep_audit === 'string' ? state.last_deep_audit.trim() : '';
  const watermark = raw === '' ? null : raw;

  // No watermark yet → the whole history is unaudited (baseline not set).
  if (watermark === null) {
    const commits = gitArgs(['log', '--oneline', '--no-decorate', 'HEAD'], root)
      .split('\n')
      .filter((l) => l.trim() !== '');
    return { watermark: null, head, unauditedCount: commits.length, commits, files: [], watermarkOrphaned: false };
  }

  // Watermark set but gone from history (rebase/squash) → treat as orphaned.
  const wmResolved = resolveSha(watermark, root);
  if (wmResolved === '') {
    return { watermark, head, unauditedCount: -1, commits: [], files: [], watermarkOrphaned: true };
  }

  const range = `${watermark}..HEAD`;
  const commits = gitArgs(['log', '--oneline', '--no-decorate', range], root)
    .split('\n')
    .filter((l) => l.trim() !== '');
  const files = gitArgs(['diff', '--name-only', range], root)
    .split('\n')
    .filter((l) => l.trim() !== '');
  return { watermark, head, unauditedCount: commits.length, commits, files, watermarkOrphaned: false };
}

function runStatus(root: string, json: boolean): void {
  const statePath = join(root, STATE_REL);
  if (!existsSync(statePath)) {
    console.error(c.red('FAIL') + ` no ${STATE_REL} (run \`casp init\` first)`);
    exit(1);
  }
  const state = loadState(statePath);
  if (state === null) {
    console.error(c.red('FAIL') + ` ${STATE_REL} is not valid JSON`);
    exit(1);
  }

  const s = computeStatus(state, root);

  if (json) {
    console.log(JSON.stringify(s, null, 2));
    exit(0);
  }

  console.error(c.bold('casp audit status'));
  console.error(c.gray('─'.repeat(70)));

  if (s.watermarkOrphaned) {
    console.log(
      `  ${c.yellow('⚠')} watermark ${c.cyan(s.watermark ?? '')} is not in history (rebased/squashed).`
    );
    console.log(c.gray('     → re-run the deep audit and `casp audit bump` to reset the baseline.'));
    console.log('');
    exit(0);
  }

  if (s.watermark === null) {
    console.log(`  ${c.yellow('no deep-audit watermark set')} — the whole tree is unaudited.`);
    console.log(c.gray(`     ${s.unauditedCount} commit(s) in history at ${c.cyan(s.head)}.`));
    console.log(c.gray('     → run `/audit-batch`, or set a baseline with `casp audit bump`.'));
    console.log('');
    exit(0);
  }

  if (s.unauditedCount === 0) {
    console.log(`  ${c.green('✓ up to date')} — HEAD ${c.cyan(s.head)} is deep-audited.`);
    console.log('');
    exit(0);
  }

  console.log(
    `  ${c.yellow(String(s.unauditedCount) + ' commit(s) unaudited')} · ` +
      `${c.cyan(s.watermark)}..${c.cyan(s.head)}`
  );
  console.log(c.gray(`  ${s.files.length} file(s) changed since the last deep audit.`));
  console.log('');
  for (const line of s.commits.slice(0, 15)) console.log(`    ${c.gray(line)}`);
  if (s.commits.length > 15) console.log(c.gray(`    … and ${s.commits.length - 15} more`));
  console.log('');
  console.log(c.gray('  → run `/audit-batch` before the next production cutover.'));
  console.log('');
  exit(0);
}

function runBump(root: string, rest: string[]): void {
  const statePath = join(root, STATE_REL);
  if (!existsSync(statePath)) {
    console.error(c.red('FAIL') + ` no ${STATE_REL} (run \`casp init\` first)`);
    exit(1);
  }
  const loaded = loadStateWithHash(statePath);
  if (loaded === null) {
    console.error(c.red('FAIL') + ` ${STATE_REL} is not valid JSON`);
    exit(1);
  }
  const { state, hash } = loaded;

  const positional = rest.filter((a) => !a.startsWith('--'));
  const target = positional[0] ?? 'HEAD';

  // target may be a CLI argument (untrusted) → inject-safe resolution only.
  const full = resolveSha(target, root);
  if (full === '') {
    console.error(c.red('FAIL') + ` '${target}' is not a commit in this repository`);
    exit(1);
  }
  const shortForm = shortSha(full, root);

  const previous = typeof state.last_deep_audit === 'string' ? state.last_deep_audit : null;
  state.last_deep_audit = shortForm;
  try {
    saveState(statePath, state, hash);
  } catch (err) {
    if (err instanceof StateConflictError) {
      console.error(c.red('FAIL') + ` ${err.message}`);
      exit(1);
    }
    throw err;
  }

  console.error(c.bold('casp audit bump'));
  console.error(c.gray('─'.repeat(70)));
  if (previous && previous !== shortForm) {
    console.log(`  ${c.green('✓')} deep-audit watermark ${c.gray(previous)} → ${c.cyan(shortForm)}`);
  } else {
    console.log(`  ${c.green('✓')} deep-audit watermark set to ${c.cyan(shortForm)}`);
  }
  console.log(c.gray(`  ${STATE_REL} updated — commit it so the trail is in git history.`));
  console.log('');
  exit(0);
}

export function runAudit(args: string[]): void {
  const [sub, ...rest] = args;
  const root = process.cwd();
  requireRepo(root);

  switch (sub) {
    case undefined:
    case 'status':
      runStatus(root, rest.includes('--json'));
      break;
    case 'bump':
      runBump(root, rest);
      break;
    default:
      console.error(c.red(`unknown audit subcommand: ${sub}`));
      console.error(c.gray('  → casp audit status        (default; what is unaudited)'));
      console.error(c.gray('  → casp audit bump [<sha>]  (record HEAD/<sha> as deep-audited)'));
      exit(1);
  }
}
