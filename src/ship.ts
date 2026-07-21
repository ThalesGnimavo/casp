/**
 * `casp ship <slug>` — mark a phase shipped, deterministically.
 *
 * The mechanical half of closing a session: flip the prompt's frontmatter
 * status to `shipped`, wire its `session_log` pointer, and move the slug from
 * `phases_queued` to `phases_shipped`. Pure file + state mutation — it does NOT
 * touch git (no add / commit / push). The operator owns the commit; this verb
 * only edits the files. That line is what keeps `ship` a state verb and not a
 * harness.
 *
 *   casp ship 0.4-close-loop                 # log id taken from state.last_session_id
 *   casp ship install-hook --log 26-06-15-004-install-hook
 *   casp ship some-phase --prompt docs/plan/sessions/CUSTOM.md
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { exit } from 'node:process';
import { c, describeFsFailure, isDir, loadStateWithHash, readDirEntries, readTextFile, resolveDirs, saveState, StateConflictError } from './shared.js';

function getArg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  return args[i + 1];
}

// Match a queue slug ('0.4-close-loop') against a prompt filename
// ('PHASE-04-CLOSE-LOOP.md'): drop a leading PHASE-, lowercase, strip every
// non-alphanumeric. Both collapse to '04closeloop'.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.md$/, '')
    .replace(/^phase-/, '')
    .replace(/[^a-z0-9]/g, '');
}

function fail(msg: string, hint?: string): never {
  console.error(c.red(msg));
  if (hint) console.error(c.gray(`  → ${hint}`));
  exit(1);
}

export function runShip(args: string[]): void {
  const root = process.cwd();
  const slug = args.find((a) => !a.startsWith('--'));
  if (!slug) {
    fail('casp ship <slug> — slug is required', 'e.g. `casp ship install-hook`');
  }

  const statePath = join(root, 'casp', 'state.json');
  const loaded = loadStateWithHash(statePath);
  if (!loaded) {
    fail('no readable casp/state.json found', 'run `casp init` first, or fix the JSON');
  }
  const { state, hash } = loaded;

  const dirs = resolveDirs(root, state);

  // 1. Resolve the prompt file. --prompt wins; otherwise normalize-match the
  //    slug against the configured sessions dir's *.md.
  const sessionsDir = dirs.sessionsAbs;
  let promptPath: string;
  const promptArg = getArg(args, '--prompt');
  if (promptArg) {
    promptPath = join(root, promptArg);
    if (!existsSync(promptPath)) fail(`--prompt file not found: ${promptArg}`);
  } else {
    if (!isDir(sessionsDir)) {
      fail(
        `${dirs.sessionsRel}/ not found`,
        'pass --prompt <path> to point at the prompt explicitly'
      );
    }
    const target = normalize(slug as string);
    const listed = readDirEntries(sessionsDir);
    if (!listed.ok) {
      fail(
        `${dirs.sessionsRel}/ ${describeFsFailure(listed.error)}`,
        'pass --prompt <path> to point at the prompt explicitly'
      );
    }
    const matches = listed.entries
      .filter((f) => f.endsWith('.md'))
      .filter((f) => normalize(f) === target);
    if (matches.length === 0) {
      fail(
        `no prompt in ${dirs.sessionsRel}/ matches slug '${slug}'`,
        'pass --prompt <path>, or check the slug'
      );
    }
    if (matches.length > 1) {
      fail(
        `slug '${slug}' is ambiguous: ${matches.join(', ')}`,
        'pass --prompt <path> to disambiguate'
      );
    }
    promptPath = join(sessionsDir, matches[0]);
  }

  // 2. Resolve the session-log id. Must be real — a shipped prompt with
  //    session_log: pending FAILs `casp check`, so refuse rather than write it.
  const logId = getArg(args, '--log') ?? state.last_session_id;
  if (!logId || logId === 'pending' || String(logId).trim() === '') {
    fail(
      'no session-log id to wire into the shipped prompt',
      'write the session log first then `casp close`, or pass --log <session-id>'
    );
  }
  const logPointer = `${dirs.logsRel}/${logId}.md`;

  // 3. Validate EVERYTHING before any write. ship mutates two files (the prompt
  //    and state.json); if the slug is unknown or the frontmatter is malformed,
  //    nothing must be left half-written. Validate, compute, then write at the end.
  const queued = Array.isArray(state.phases_queued) ? (state.phases_queued as string[]) : [];
  const shipped = Array.isArray(state.phases_shipped) ? (state.phases_shipped as string[]) : [];
  const inQueue = queued.includes(slug as string);
  const alreadyShipped = shipped.includes(slug as string);
  if (!inQueue && !alreadyShipped) {
    fail(
      `slug '${slug}' is not in phases_queued (nor phases_shipped)`,
      'add it to the queue first, or check the slug'
    );
  }

  const read = readTextFile(promptPath);
  if (!read.ok) {
    fail(
      `prompt ${describeFsFailure(read.error)}: ${relative(root, promptPath)}`,
      'make the file readable — `casp ship` rewrites its frontmatter in place'
    );
  }
  const raw = read.content;
  // Tolerate CRLF on the frontmatter fences so a Windows-edited prompt is not
  // mistaken for one with no frontmatter.
  const m = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!m) {
    fail(
      `prompt has no frontmatter block: ${relative(root, promptPath)}`,
      'a prompt must start with a --- ... --- frontmatter block'
    );
  }
  const fmMatch = m as RegExpMatchArray;
  let fm = fmMatch[2];

  if (/^status:.*$/m.test(fm)) {
    fm = fm.replace(/^status:.*$/m, 'status: shipped');
  } else {
    fm = `status: shipped\n${fm}`;
  }
  if (/^session_log:.*$/m.test(fm)) {
    fm = fm.replace(/^session_log:.*$/m, `session_log: ${logPointer}`);
  } else if (/^session_id:.*$/m.test(fm)) {
    fm = fm.replace(/^session_id:.*$/m, (line) => `${line}\nsession_log: ${logPointer}`);
  } else {
    fm = `${fm}\nsession_log: ${logPointer}`;
  }
  // Reassemble: opening fence + edited frontmatter + closing fence + body.
  const rebuilt = fmMatch[1] + fm + fmMatch[3] + raw.slice(fmMatch[0].length);

  // 4. All validations passed — now write both files. Move the slug between
  //    phase arrays (idempotent: already-shipped makes no array change).
  if (inQueue) state.phases_queued = queued.filter((p) => p !== slug);
  if (!alreadyShipped) {
    shipped.push(slug as string);
    state.phases_shipped = shipped;
  }
  writeFileSync(promptPath, rebuilt);
  try {
    saveState(statePath, state, hash);
  } catch (err) {
    if (err instanceof StateConflictError) fail(err.message);
    throw err;
  }

  console.log(`${c.green('ship')}    ${relative(root, promptPath)} → status: shipped`);
  console.log(`        ${c.gray(`session_log: ${logPointer}`)}`);
  if (inQueue) console.log(`        ${c.gray(`moved '${slug}' → phases_shipped`)}`);
  else console.log(`        ${c.gray(`'${slug}' already shipped (no array change)`)}`);
  console.log('');
  console.log(c.gray('next: `casp close` to bump last_commit / last_session_id, then `casp check`'));
}
