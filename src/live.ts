/**
 * `casp live` — ephemeral coordination between parallel sessions on ONE machine.
 *
 * The problem: N coding-agent sessions (plus the human) work the same repo at
 * once. state.json is the DURABLE record and syncs at session boundaries; in
 * between, nothing tells session B that session A holds `src/billing/` — the
 * human coordinates by hand, or the sessions collide.
 *
 * `casp live` adds the IN-FLIGHT record, three deterministic pieces:
 *
 *   claims   — advisory path locks with a TTL, enforced mechanically when the
 *              harness wires `casp live hook` as a PreToolUse hook (a foreign
 *              file edit gets exit 2 = blocked, with the owner named).
 *   journal  — an append-only casp/live/journal.jsonl every session writes
 *              through its lifecycle hooks. Who started, who edited what, who
 *              was denied, who shipped.
 *   watch    — the human's live view: a colorized tail of the journal. The
 *              human gets the whole stream; each agent's context gets none of
 *              it. Sharing STATE, not the chat stream, is the point.
 *
 * Boundary (as load-bearing as the features): casp/live/* is machine-local
 * RUNTIME state — gitignored by this verb on first write, pruned lazily, and
 * NEVER read by `casp check`. The gate stays exactly what it is; live never
 * gates a push and check never reads live. No LLM, no network, no telemetry.
 *
 * Session identity: Claude Code exports CLAUDE_CODE_SESSION_ID into tool
 * shells and sends the same id as `session_id` in hook payloads — that is the
 * whole identity scheme. Other harnesses can pass --session explicitly. When
 * neither exists, the owner falls back to `cli:<user>` so a human at a bare
 * terminal can still claim.
 *
 * Hook safety contract: `casp live hook` NEVER exits non-zero except for the
 * one documented case (PreToolUse on a path someone else holds). Malformed
 * stdin, unknown events, an unreadable claims file — all exit 0. A broken
 * coordination layer must degrade to "no coordination", never to "no editing".
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { exit } from 'node:process';
import { c, readTextFile } from './shared.js';

const ROOT = process.cwd();
const LIVE_DIR = join(ROOT, 'casp', 'live');
const CLAIMS = join(LIVE_DIR, 'claims.json');
const JOURNAL = join(LIVE_DIR, 'journal.jsonl');
const GITIGNORE = join(LIVE_DIR, '.gitignore');
/** Repo-scoped and machine-scoped kill-switch marker files. Written by
 *  `casp live off` FROM A TERMINAL — the wedged session is exactly the place
 *  where writing files no longer works, so the escape hatch must not require
 *  editing settings.json or any file the session owns. */
const OFF_LOCAL = join(LIVE_DIR, 'off');
const OFF_GLOBAL = join(homedir(), '.casp', 'live.off');

/** True when the guard must stand down entirely: env CASP_LIVE=0 (checked on
 *  EVERY hook invocation), a repo-local off marker, or the machine-wide one.
 *  casp is typically installed globally, so a misbehaving hook has a
 *  machine-sized blast radius — the off ramp must be machine-sized too. */
function liveDisabled(): boolean {
  if (process.env.CASP_LIVE === '0') return true;
  return existsSync(OFF_LOCAL) || existsSync(OFF_GLOBAL);
}

/** Default claim lifetime. Long enough for a real implementation session,
 *  short enough that a crashed session cannot brick the repo overnight. */
const DEFAULT_TTL_MINUTES = 480;

/** File-writing tools the PreToolUse guard screens. Bash is deliberately NOT
 *  screened: parsing arbitrary shell for file targets is guesswork, and a
 *  guard that guesses is worse than one with a documented blind spot. */
const FILE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

interface Claim {
  /** Repo-root-relative POSIX path (file or directory prefix). */
  path: string;
  /** Session id (or cli:<user>) that holds the claim. */
  owner: string;
  /** Optional human label ("mobile-train") shown next to the raw owner id. */
  label: string | null;
  note: string | null;
  /** PID of the claiming session's harness process (CLAUDE_PID) when known.
   *  A claim whose process is gone is DEAD and never blocks anyone — a
   *  crashed or closed session must not hold the repo hostage. Null when the
   *  claimer had no harness PID (bare terminal); TTL is then the only bound. */
  pid: number | null;
  created_at: string;
  expires_at: string;
}

interface ClaimsFile {
  version: 1;
  claims: Claim[];
}

interface JournalEvent {
  ts: string;
  session: string;
  type: string;
  path?: string;
  paths?: string[];
  label?: string;
  msg?: string;
  tool?: string;
  denied_owner?: string;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** Create casp/live/ with a self-gitignore on first touch. The ignore file is
 *  what keeps runtime churn out of `git status` and therefore out of every
 *  state-vs-git comparison — the boundary is enforced by the filesystem, not
 *  by asking agents to remember it. */
function ensureLiveDir(): void {
  if (!existsSync(LIVE_DIR)) mkdirSync(LIVE_DIR, { recursive: true });
  if (!existsSync(GITIGNORE)) {
    writeFileSync(
      GITIGNORE,
      '# casp live: machine-local runtime state, never committed, never gated.\n*\n'
    );
  }
}

function nowISO(): string {
  return new Date().toISOString();
}

function loadClaims(): ClaimsFile {
  const r = readTextFile(CLAIMS);
  if (!r.ok) return { version: 1, claims: [] };
  try {
    const parsed = JSON.parse(r.content) as ClaimsFile;
    if (!Array.isArray(parsed.claims)) return { version: 1, claims: [] };
    // Normalize rows written by other versions: a missing pid means "unknown",
    // which must read as null (TTL-only), never as undefined (would probe
    // kill(undefined) and prune the claim as dead).
    for (const cl of parsed.claims) if (cl.pid === undefined) cl.pid = null;
    return { version: 1, claims: parsed.claims };
  } catch {
    // A corrupt claims file must not wedge the repo: treat as empty. The
    // journal (append-only) is the audit trail; claims are reconstructible.
    return { version: 1, claims: [] };
  }
}

/** True when the claim's recorded harness process is still alive. kill(pid, 0)
 *  probes without signaling; ESRCH means gone. EPERM would mean "alive but not
 *  ours" — treated as alive, the conservative read. PID reuse is a accepted
 *  residual: the window is small and the failure mode is a claim living
 *  slightly longer than its session, bounded by the TTL anyway. */
function holderAlive(cl: Claim): boolean {
  if (cl.pid === null) return true; // no PID recorded — TTL is the only bound
  try {
    process.kill(cl.pid, 0);
    return true;
  } catch (err) {
    return (err as { code?: string }).code === 'EPERM';
  }
}

/** Load and lazily prune claims that no longer bind: expired TTL, or a holder
 *  whose process is gone. Pruning happens on READ so there is no daemon — and
 *  the default on any doubt is ALLOW: a dead session must never hold the repo. */
function loadActiveClaims(): ClaimsFile {
  const file = loadClaims();
  const now = nowISO();
  const active = file.claims.filter((cl) => cl.expires_at > now && holderAlive(cl));
  if (active.length !== file.claims.length) {
    saveClaims({ version: 1, claims: active });
  }
  return { version: 1, claims: active };
}

/** Same tmp+rename discipline as saveState(): a crash mid-write leaves the
 *  previous claims file intact. No cross-process CAS here — claims are
 *  advisory and last-writer-wins on the file is acceptable; the conflict
 *  detection that matters (two sessions claiming one path) happens above. */
function saveClaims(file: ClaimsFile): void {
  ensureLiveDir();
  const tmp = `${CLAIMS}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(file, null, 2) + '\n');
    renameSync(tmp, CLAIMS);
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best-effort cleanup */
    }
    throw err;
  }
}

/** Append one event. A single JSON line under PIPE_BUF is an atomic write on
 *  every platform we care about, so concurrent sessions can append without a
 *  lock and lines never interleave. */
function appendEvent(ev: JournalEvent): void {
  ensureLiveDir();
  appendFileSync(JOURNAL, JSON.stringify(ev) + '\n');
}

// ---------------------------------------------------------------------------
// Identity and paths
// ---------------------------------------------------------------------------

function sessionId(explicit?: string | null): string {
  if (explicit) return explicit;
  const env = process.env.CLAUDE_CODE_SESSION_ID;
  if (env) return env;
  return `cli:${userInfo().username}`;
}

/** Normalize a user-supplied path to a repo-root-relative POSIX string.
 *  Returns null for anything that escapes the root — a claim outside the repo
 *  is meaningless and a guard comparing against one would be undefined.
 *
 *  Known blind spot, accepted under fail-open: no symlink resolution. When the
 *  repo is reached through a symlink (or a payload path spells the same file
 *  through one), the comparison sees "outside the repo" and the guard stands
 *  down for that call. Wrong direction: ALLOW. Resolving realpaths here would
 *  need the target to exist (Write creates files) and buys little. */
function normalizePath(p: string): string | null {
  const abs = isAbsolute(p) ? p : resolve(ROOT, p);
  const rel = relative(ROOT, abs);
  if (rel === '' ) return null; // claiming the whole repo root is a mistake, not a lock
  if (rel === '..' || rel.startsWith(`..${sep}`)) return null;
  return rel.split(sep).join('/').replace(/\/+$/, '');
}

/** True when `target` (root-relative POSIX) falls under claim path `held`:
 *  exact match, or prefix on a `/` boundary. Segment-boundary matching keeps
 *  `src/app` from capturing `src/apples.ts`. No globs in v1: prefixes are
 *  deterministic, explainable in one sentence, and cover the real use case
 *  (claiming a directory or a file). */
function pathCovered(held: string, target: string): boolean {
  return target === held || target.startsWith(held + '/');
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

function parseFlag(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  if (i === -1 || i === args.length - 1) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

function runClaim(args: string[]): number {
  const label = parseFlag(args, '--label');
  const note = parseFlag(args, '--note');
  const ttlRaw = parseFlag(args, '--ttl');
  const explicitSession = parseFlag(args, '--session');
  const ttl = ttlRaw === null ? DEFAULT_TTL_MINUTES : Number(ttlRaw);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    console.error(c.red(`--ttl must be a positive number of minutes, got "${ttlRaw}"`));
    return 1;
  }
  if (args.length === 0) {
    console.error(c.red('claim needs at least one path: casp live claim <path> [...]'));
    return 1;
  }
  const owner = sessionId(explicitSession);
  const file = loadActiveClaims();
  const created = nowISO();
  const expires = new Date(Date.now() + ttl * 60_000).toISOString();
  const taken: string[] = [];

  for (const raw of args) {
    const p = normalizePath(raw);
    if (p === null) {
      console.error(c.red(`"${raw}" is outside this repo (or the repo root itself) — not claimable`));
      return 1;
    }
    // Overlap in EITHER direction with a foreign claim is a conflict: claiming
    // src/ over someone's src/app is the same collision as the reverse.
    const clash = file.claims.find(
      (cl) => cl.owner !== owner && (pathCovered(cl.path, p) || pathCovered(p, cl.path))
    );
    if (clash) {
      const who = clash.label ? `${clash.label} (${clash.owner})` : clash.owner;
      console.error(
        c.red(`"${p}" overlaps "${clash.path}", held by ${who} until ${clash.expires_at}`)
      );
      console.error(c.gray('coordinate with that session, or wait for the claim to expire'));
      return 1;
    }
    // Re-claiming your own path refreshes the TTL instead of stacking rows.
    const mine = file.claims.findIndex((cl) => cl.owner === owner && cl.path === p);
    if (mine !== -1) file.claims.splice(mine, 1);
    const pidRaw = process.env.CLAUDE_PID;
    const pid = pidRaw && Number.isInteger(Number(pidRaw)) ? Number(pidRaw) : null;
    file.claims.push({ path: p, owner, label, note, pid, created_at: created, expires_at: expires });
    taken.push(p);
  }

  saveClaims(file);
  appendEvent({ ts: created, session: owner, type: 'claim', paths: taken, label: label ?? undefined, msg: note ?? undefined });
  for (const p of taken) {
    console.log(`${c.green('claimed')} ${p} ${c.gray(`until ${expires}`)}`);
  }
  return 0;
}

function runRelease(args: string[]): number {
  const explicitSession = parseFlag(args, '--session');
  const owner = sessionId(explicitSession);
  const all = args.includes('--mine');
  const file = loadActiveClaims();

  let released: string[];
  if (all) {
    released = file.claims.filter((cl) => cl.owner === owner).map((cl) => cl.path);
    file.claims = file.claims.filter((cl) => cl.owner !== owner);
  } else {
    if (args.length === 0) {
      console.error(c.red('release needs paths or --mine: casp live release <path> [...] | --mine'));
      return 1;
    }
    released = [];
    for (const raw of args) {
      const p = normalizePath(raw);
      if (p === null) continue;
      const i = file.claims.findIndex((cl) => cl.owner === owner && cl.path === p);
      if (i !== -1) {
        file.claims.splice(i, 1);
        released.push(p);
      } else {
        console.error(c.yellow(`no claim of yours on "${p}" — nothing released`));
      }
    }
  }

  saveClaims(file);
  if (released.length > 0) {
    appendEvent({ ts: nowISO(), session: owner, type: 'release', paths: released });
    for (const p of released) console.log(`${c.green('released')} ${p}`);
  }
  return 0;
}

function runClaims(args: string[]): number {
  const file = loadActiveClaims();
  if (args.includes('--json')) {
    console.log(JSON.stringify(file, null, 2));
    return 0;
  }
  if (file.claims.length === 0) {
    console.log(c.gray('no active claims'));
    return 0;
  }
  for (const cl of file.claims) {
    const who = cl.label ? `${cl.label} ${c.gray(`(${cl.owner})`)}` : cl.owner;
    console.log(`${c.yellow(cl.path)}  ${who}  ${c.gray(`until ${cl.expires_at}`)}${cl.note ? `  ${c.gray(cl.note)}` : ''}`);
  }
  return 0;
}

function runLog(args: string[]): number {
  const msg = parseFlag(args, '--msg');
  const pathsRaw = parseFlag(args, '--paths');
  const explicitSession = parseFlag(args, '--session');
  const type = args[0];
  if (!type) {
    console.error(c.red('log needs a type: casp live log <type> [--msg ...] [--paths a,b]'));
    return 1;
  }
  appendEvent({
    ts: nowISO(),
    session: sessionId(explicitSession),
    type,
    msg: msg ?? undefined,
    paths: pathsRaw ? pathsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined
  });
  return 0;
}

function readJournalLines(): JournalEvent[] {
  const r = readTextFile(JOURNAL);
  if (!r.ok) return [];
  const out: JournalEvent[] = [];
  for (const line of r.content.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as JournalEvent);
    } catch {
      /* a torn or foreign line is skipped, never fatal */
    }
  }
  return out;
}

function formatEvent(ev: JournalEvent): string {
  const time = c.gray(ev.ts.slice(11, 19));
  const who = c.cyan(ev.label ?? shortSession(ev.session));
  const color =
    ev.type === 'denied' ? c.red
    : ev.type === 'claim' || ev.type === 'release' ? c.yellow
    : ev.type === 'session-start' || ev.type === 'stop' ? c.green
    : c.gray;
  const what = color(ev.type);
  const detail = [ev.tool, ev.path, ev.paths?.join(', '), ev.msg, ev.denied_owner ? `held by ${ev.denied_owner}` : null]
    .filter(Boolean)
    .join('  ');
  return `${time}  ${who}  ${what}${detail ? `  ${detail}` : ''}`;
}

function shortSession(s: string): string {
  return s.length > 8 ? s.slice(0, 8) : s;
}

function runTail(args: string[]): number {
  const nRaw = parseFlag(args, '-n');
  const n = nRaw === null ? 30 : Number(nRaw);
  const events = readJournalLines();
  for (const ev of events.slice(-Math.max(1, n))) console.log(formatEvent(ev));
  return 0;
}

/** The human's panopticon: active claims once, then new journal lines as they
 *  land. Polling (not fs.watch) because appendFileSync from N processes plus
 *  editor tooling makes watch events noisy and platform-flavored; a 500ms poll
 *  of the file size is boring and correct. */
function runWatch(): number {
  ensureLiveDir();
  const claims = loadActiveClaims();
  console.log(c.bold(`casp live — watching ${JOURNAL}`));
  if (claims.claims.length > 0) {
    console.log(c.bold('active claims:'));
    for (const cl of claims.claims) {
      const who = cl.label ? `${cl.label} (${cl.owner})` : cl.owner;
      console.log(`  ${c.yellow(cl.path)}  ${who}`);
    }
  }
  console.log(c.gray('--- live (Ctrl+C to quit) ---'));
  let offset = existsSync(JOURNAL) ? statSync(JOURNAL).size : 0;
  // Print a short backlog so the screen is not blank on entry.
  for (const ev of readJournalLines().slice(-10)) console.log(formatEvent(ev));
  setInterval(() => {
    if (!existsSync(JOURNAL)) return;
    const size = statSync(JOURNAL).size;
    if (size <= offset) {
      if (size < offset) offset = size; // journal was truncated/rotated
      return;
    }
    const buf = readFileSync(JOURNAL);
    const chunk = buf.subarray(offset).toString('utf8');
    // Only consume complete lines; a partial trailing line waits for the next tick.
    const lastNewline = chunk.lastIndexOf('\n');
    if (lastNewline === -1) return;
    offset += Buffer.byteLength(chunk.slice(0, lastNewline + 1));
    for (const line of chunk.slice(0, lastNewline).split('\n')) {
      if (!line.trim()) continue;
      try {
        console.log(formatEvent(JSON.parse(line) as JournalEvent));
      } catch {
        /* skip torn line */
      }
    }
  }, 500);
  return -1; // signal "do not exit" to the dispatcher
}

// ---------------------------------------------------------------------------
// The hook entry — one command wired for every event
// ---------------------------------------------------------------------------

interface HookPayload {
  session_id?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; notebook_path?: string };
}

function readStdinSync(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** stdin: one Claude Code hook payload (JSON). Behavior by event:
 *
 *    PreToolUse (Edit/Write/NotebookEdit) — the guard. If the target path is
 *        covered by an ACTIVE claim from ANOTHER session: journal a `denied`
 *        event, print the owner on stderr (the harness feeds stderr back to
 *        the model), exit 2. Otherwise exit 0.
 *    PostToolUse (same tools)            — journal an `edit` event.
 *    SessionStart / Stop / SubagentStop  — journal lifecycle events.
 *    anything else                       — exit 0, silently. Forward-compatible.
 *
 *  Every failure path (no stdin, bad JSON, unreadable claims) exits 0: the
 *  coordination layer degrades to "no coordination", never to "no editing".
 */
function runHook(): number {
  // Kill switch first, before touching stdin or any file: when live is off,
  // the hook must cost nothing and block nothing, unconditionally.
  if (liveDisabled()) return 0;
  let payload: HookPayload;
  try {
    payload = JSON.parse(readStdinSync()) as HookPayload;
  } catch {
    return 0;
  }
  const session = payload.session_id ?? 'unknown';
  const event = payload.hook_event_name ?? '';
  const tool = payload.tool_name ?? '';
  const rawPath = payload.tool_input?.file_path ?? payload.tool_input?.notebook_path;

  try {
    switch (event) {
      case 'PreToolUse': {
        if (!FILE_TOOLS.has(tool) || !rawPath) return 0;
        const target = normalizePath(rawPath);
        if (target === null) return 0; // outside the repo — not ours to police
        const foreign = loadActiveClaims().claims.find(
          (cl) => cl.owner !== session && pathCovered(cl.path, target)
        );
        if (!foreign) return 0;
        const who = foreign.label ? `${foreign.label} (${foreign.owner})` : foreign.owner;
        appendEvent({ ts: nowISO(), session, type: 'denied', path: target, tool, denied_owner: foreign.owner });
        console.error(
          `casp live: "${target}" is claimed by ${who} until ${foreign.expires_at}` +
            (foreign.note ? ` — ${foreign.note}` : '') +
            `. Work elsewhere, message that session, or have the human release the claim ` +
            `(casp live release ${foreign.path} --session ${foreign.owner}).`
        );
        return 2;
      }
      case 'PostToolUse': {
        if (!FILE_TOOLS.has(tool) || !rawPath) return 0;
        const target = normalizePath(rawPath);
        if (target === null) return 0;
        appendEvent({ ts: nowISO(), session, type: 'edit', path: target, tool });
        return 0;
      }
      case 'SessionStart':
        appendEvent({ ts: nowISO(), session, type: 'session-start' });
        return 0;
      case 'Stop':
        appendEvent({ ts: nowISO(), session, type: 'stop' });
        return 0;
      case 'SubagentStop':
        appendEvent({ ts: nowISO(), session, type: 'subagent-stop' });
        return 0;
      default:
        return 0;
    }
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// install — print the wiring, never write someone's settings
// ---------------------------------------------------------------------------

/** Merging JSON into .claude/settings.json would mean owning every way that
 *  file can already be shaped. Printing the exact block and letting the human
 *  (or their agent) paste it is deterministic and cannot clobber anything. */
function runInstall(): number {
  const hook = { type: 'command', command: 'casp live hook' };
  const snippet = {
    hooks: {
      PreToolUse: [{ matcher: 'Edit|Write|NotebookEdit', hooks: [hook] }],
      PostToolUse: [{ matcher: 'Edit|Write|NotebookEdit', hooks: [hook] }],
      SessionStart: [{ hooks: [hook] }],
      Stop: [{ hooks: [hook] }],
      SubagentStop: [{ hooks: [hook] }]
    }
  };
  console.log(c.bold('Add to .claude/settings.json (project) or ~/.claude/settings.json (user):'));
  console.log(JSON.stringify(snippet, null, 2));
  console.log('');
  console.log(c.gray('PreToolUse enforces claims (exit 2 blocks a foreign edit);'));
  console.log(c.gray('the rest feed casp/live/journal.jsonl. Watch it with: casp live watch'));
  return 0;
}

// ---------------------------------------------------------------------------
// off / on — the no-file-edit escape hatch
// ---------------------------------------------------------------------------

/** Run FROM A TERMINAL when a hook misbehaves inside a session: the session
 *  cannot write files precisely because the guard is misfiring, so the escape
 *  hatch lives outside it. `--global` writes ~/.casp/live.off and stands the
 *  guard down machine-wide (casp installs globally; so does its blast radius).
 *  `CASP_LIVE=0` in the environment achieves the same without any file. */
function runOff(args: string[]): number {
  const global = args.includes('--global');
  const marker = global ? OFF_GLOBAL : OFF_LOCAL;
  const dir = global ? join(homedir(), '.casp') : LIVE_DIR;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(marker, `disabled ${nowISO()}\n`);
  console.log(`${c.yellow('casp live is OFF')} ${global ? '(this machine)' : '(this repo)'} — hooks stand down, nothing blocks`);
  console.log(c.gray(`re-enable with: casp live on${global ? ' --global' : ''}`));
  return 0;
}

function runOn(args: string[]): number {
  const global = args.includes('--global');
  const marker = global ? OFF_GLOBAL : OFF_LOCAL;
  if (existsSync(marker)) unlinkSync(marker);
  console.log(`${c.green('casp live is ON')} ${global ? '(this machine)' : '(this repo)'}`);
  if (process.env.CASP_LIVE === '0') {
    console.log(c.yellow('note: CASP_LIVE=0 is set in this shell and still disables the guard'));
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function runLive(args: string[]): void {
  const [sub, ...rest] = args;
  let code: number;
  switch (sub) {
    case 'claim':
      code = runClaim(rest);
      break;
    case 'release':
      code = runRelease(rest);
      break;
    case 'claims':
      code = runClaims(rest);
      break;
    case 'log':
      code = runLog(rest);
      break;
    case 'tail':
      code = runTail(rest);
      break;
    case 'watch':
      code = runWatch();
      break;
    case 'hook':
      code = runHook();
      break;
    case 'install':
      code = runInstall();
      break;
    case 'off':
      code = runOff(rest);
      break;
    case 'on':
      code = runOn(rest);
      break;
    default:
      console.error(
        c.red(
          `unknown live subcommand "${sub ?? ''}" — expected claim | release | claims | log | tail | watch | hook | install | off | on`
        )
      );
      code = 1;
  }
  if (code >= 0) exit(code);
  // watch: fall through and let the interval keep the process alive.
}
