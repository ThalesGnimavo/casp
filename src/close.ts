/**
 * `casp close` — the guided, deterministic session close.
 *
 * Auto-detects the implementation commit (HEAD) and this session's log (from git),
 * lets you confirm or override them, bumps `last_commit` / `last_session_id` /
 * `updated_at` in state.json, runs `casp check`, prints THE BOARD (the status
 * rendering, plus the schedule rendering when casp/schedule.json exists), and
 * exits with the check's verdict.
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

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { exit, stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { c, git, gitArgs, isDir, loadStateWithHash, resolveDirs, readDirEntries, saveState, StateConflictError, todayISO } from './shared.js';
import { DEFAULT_WINDOW_WEEKS } from './pace.js';
import { checkOneSafe, printReport, summarize } from './check.js';
import { runStatus } from './status.js';
import { assemble, printSchedule } from './schedule-report.js';

function getArg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  return args[i + 1];
}

// The session log this close should wire, detected from git — never from the
// filename. Projects mix naming styles (`YY-MM-DD-NNN-slug`, compact `YYMMDD-slug`,
// sequence counters such as `261024b-slug`); no sort order is meaningful across
// them, and filtering to one style made a close pick the lone file of that style
// forever, regressing last_session_id on every run. Order of precedence:
//   1. a log that is new in the working tree (untracked or staged-added) — the
//      one written this session and not yet committed;
//   2. the log most recently ADDED in git history (`--diff-filter=A`), which is
//      the session's log when it went out in the implementation commit;
//   3. outside git only, the old filename sort, as a last resort.
// Several new logs at once is ambiguous: the lexically last is proposed and the
// caller is told, so `--yes` never picks silently. Empty id when nothing is found.
interface LogDetection {
  id: string;
  ambiguous: string[];
  /** A candidate refused because git added it before the current log. */
  regressed?: string;
}

function isLogName(name: string): boolean {
  return name.endsWith('.md') && !name.startsWith('.') && name.toLowerCase() !== 'readme.md';
}

export function detectSessionLog(
  root: string,
  logsAbs: string,
  logsRel: string,
  current = ''
): LogDetection {
  const none: LogDetection = { id: '', ambiguous: [] };
  if (!isDir(logsAbs)) return none;
  const dir = readDirEntries(logsAbs);
  if (!dir.ok) return none;
  const present = new Set(dir.entries.filter(isLogName));
  if (present.size === 0) return none;
  const toId = (name: string): string => name.replace(/\.md$/, '');

  const inGit = gitArgs(['rev-parse', '--is-inside-work-tree'], root) === 'true';
  if (inGit) {
    // Only direct children of the logs dir count, matching how check resolves
    // `<logs_dir>/<id>.md`. git prints paths relative to the repository top, not
    // to the cwd, so the project's own offset (`--show-prefix`, '' at the top)
    // goes in front — a cockpit in a subdirectory of its repo otherwise matches
    // nothing and silently falls back to the filename sort.
    const rel = logsRel.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/+$/, '');
    const dirPart = rel === '' || rel === '.' ? '' : `${rel}/`;
    const prefix = gitArgs(['rev-parse', '--show-prefix'], root) + dirPart;
    const childName = (path: string): string | null => {
      if (!path.startsWith(prefix)) return null;
      const name = path.slice(prefix.length);
      return !name.includes('/') && present.has(name) ? name : null;
    };
    // --literal-pathspecs: logs_dir comes from state.json, and a leading ':'
    // must stay a directory name, never become pathspec magic.
    const scoped = ['--literal-pathspecs'];

    // --no-renames: a log moved or renamed in a commit counts as added there.
    // Newest addition first, one entry per name — the order "older" is measured in.
    const history: string[] = [];
    const added = gitArgs(
      [...scoped, 'log', '--no-renames', '--diff-filter=A', '--name-only', '--format=', '--', logsRel],
      root
    );
    for (const line of added.split('\n')) {
      const name = childName(line.trim());
      if (name && !history.includes(name)) history.push(name);
    }
    // Never go backwards: a candidate git added BEFORE the current log (an old
    // log restored untracked, a replayed commit) is refused, not wired. The
    // measure is git's own order, never the filename.
    const older = (name: string): boolean => {
      const at = history.indexOf(name);
      const cur = history.indexOf(`${current}.md`);
      return at !== -1 && cur !== -1 && at > cur;
    };

    // -z: no quoting of unusual filenames; -uall: list untracked files, not dirs.
    // New = untracked (`??`), added in the index (`A`), intent-to-add (` A`), or
    // staged rename/copy (`R`/`C`, whose record is followed by the source path).
    const records = gitArgs([...scoped, 'status', '--porcelain', '-z', '-uall', '--', logsRel], root).split('\0');
    const fresh: string[] = [];
    for (let i = 0; i < records.length; i++) {
      const e = records[i];
      if (e.length < 4) continue;
      const x = e[0];
      const y = e[1];
      if (x === 'R' || x === 'C') i++; // skip the source path record
      if (e.startsWith('??') || x === 'A' || y === 'A' || x === 'R' || x === 'C') {
        const name = childName(e.slice(3));
        if (name) fresh.push(name);
      }
    }
    fresh.sort();
    if (fresh.length > 0) {
      const pick = fresh[fresh.length - 1];
      const ambiguous = fresh.length > 1 ? fresh.map(toId) : [];
      return older(pick) ? { id: '', ambiguous, regressed: toId(pick) } : { id: toId(pick), ambiguous };
    }
    if (history.length > 0) return { id: toId(history[0]), ambiguous: [] };
  }


  const dated = [...present].filter((f) => /^\d{2}-\d{2}-\d{2}-\d{3}-.*\.md$/.test(f)).sort();
  return dated.length > 0 ? { id: toId(dated[dated.length - 1]), ambiguous: [] } : none;
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
  const logFlag = getArg(args, '--log');
  const detected = logFlag === undefined ? detectSessionLog(root, dirs.logsAbs, dirs.logsRel, state.last_session_id ?? '') : null;
  let logId = logFlag ?? detected?.id ?? '';
  if (detected && detected.ambiguous.length > 0) {
    console.error(
      c.yellow(`${detected.ambiguous.length} uncommitted session logs: ${detected.ambiguous.join(', ')}`)
    );
    console.error(c.gray(`  → proposing ${logId || '(none)'}; pass --log <id> to choose another`));
  }
  if (detected?.regressed) {
    console.error(
      c.yellow(`refusing ${detected.regressed}: git added it before the current log ${state.last_session_id}`)
    );
    console.error(c.gray('  → last_session_id left unchanged; pass --log <id> if that log really is this session\'s'));
  }

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

  // Validate, then print THE BOARD, then exit with the check's verdict.
  //
  // Why close is where the picture belongs: nothing in the close protocol
  // produced one, so no session ever showed where the project stood and the
  // operator rebuilt it by hand from the logs. The verb every close already
  // runs is the only place a picture is guaranteed to be seen. It is the SAME
  // renderer `casp status` and `casp schedule` use — a second one drifts from
  // the first, and then the close prints a different picture from the verb.
  //
  // close still runs no git WRITES — no add, no commit, no push, which is the
  // hard constraint at the top of this file. It does read: `git rev-parse` above,
  // and the pace walk inside printSchedule. The window bounds that walk.
  const findings = checkOneSafe(root);
  printReport(findings, false);
  runStatus([]);
  if (existsSync(join(root, 'casp', 'schedule.json'))) {
    printSchedule(assemble(root, state, todayISO(), DEFAULT_WINDOW_WEEKS));
  }
  exit(summarize(findings).fail > 0 ? 1 : 0);
}
