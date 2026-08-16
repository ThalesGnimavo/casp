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

/** The controller row: the one session allowed to write RESERVED paths while
 *  a fleet is active. Same liveness rules as a claim (TTL + PID probe). */
interface Controller {
  owner: string;
  label: string | null;
  pid: number | null;
  created_at: string;
  expires_at: string;
}

/** Ownership has THREE states, not two — and the file format carries all
 *  three even where enforcement is minimal, because the format is what costs
 *  to change later:
 *    owned by X      — a claim row (a fleet lane is claims declared at launch)
 *    controller-only — RESERVED paths (shared state: cockpit, logs, root
 *                      instruction files, lockfiles) that no lane owns; only
 *                      the declared controller writes them, and ONLY while a
 *                      fleet is active (see reservedEnforced)
 *    free            — everything else
 */
interface ClaimsFile {
  version: 2;
  controller: Controller | null;
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

/** Is this row still within its TTL?
 *
 *  Parsed, never string-compared. `expires_at > nowISO()` looks equivalent for
 *  timestamps this binary wrote — and is a fail-CLOSED hole for every one it
 *  did not: `"not-a-date"`, a `+02:00` offset, a year-9999 typo all sort ABOVE
 *  the current instant and make the row immortal. A row that never expires and
 *  carries no PID blocks its path forever, which is precisely the wedge the
 *  fail-open contract forbids. Unparseable → EXPIRED → allow. */
function stillValid(row: { expires_at?: unknown }, now: number): boolean {
  const t = typeof row.expires_at === 'string' ? Date.parse(row.expires_at) : NaN;
  return Number.isFinite(t) && t > now;
}

function emptyFile(): ClaimsFile {
  return { version: 2, controller: null, claims: [] };
}

function loadClaims(): ClaimsFile {
  const r = readTextFile(CLAIMS);
  if (!r.ok) return emptyFile();
  try {
    const parsed = JSON.parse(r.content) as ClaimsFile;
    if (!Array.isArray(parsed.claims)) return emptyFile();
    // Normalize rows written by other versions: a missing pid means "unknown",
    // which must read as null (TTL-only), never as undefined (would probe
    // kill(undefined) and prune the claim as dead). A v1 file has no
    // controller key — that reads as "none declared", never as corrupt.
    for (const cl of parsed.claims) if (cl.pid === undefined) cl.pid = null;
    const controller = parsed.controller ?? null;
    if (controller && controller.pid === undefined) controller.pid = null;
    return { version: 2, controller, claims: parsed.claims };
  } catch {
    // A corrupt claims file must not wedge the repo: treat as empty. The
    // journal (append-only) is the audit trail; claims are reconstructible.
    return emptyFile();
  }
}

/** True when the claim's recorded harness process is still alive. kill(pid, 0)
 *  probes without signaling; ESRCH means gone. EPERM would mean "alive but not
 *  ours" — treated as alive, the conservative read. PID reuse is a accepted
 *  residual: the window is small and the failure mode is a claim living
 *  slightly longer than its session, bounded by the TTL anyway. */
function holderAlive(cl: { pid: number | null }): boolean {
  if (cl.pid === null) return true; // no PID recorded — TTL is the only bound
  try {
    process.kill(cl.pid, 0);
    return true;
  } catch (err) {
    return (err as { code?: string }).code === 'EPERM';
  }
}

/** Load and prune what no longer binds: claims (and the controller row) past
 *  their TTL or whose holder process is gone. Pruning happens on READ so there
 *  is no daemon — and the default on any doubt is ALLOW: a dead session must
 *  never hold the repo.
 *
 *  Pruning is IN MEMORY and writes nothing. It used to persist the pruned file
 *  on every read, which made the PreToolUse hook — the hottest path in the
 *  system, one run per tool call across N sessions — a writer of claims.json.
 *  Two writers with no CAS is last-writer-wins, and the interleaving that
 *  matters is a prune (holding a pre-claim snapshot) landing after a fresh
 *  `claim`: the claim is reported taken and silently vanishes. The window is
 *  narrow and did not reproduce in 12 forced trials, but it is real and the
 *  cure is free — the mutating commands rewrite the pruned file anyway, and a
 *  dead row costs nothing but bytes until one of them runs. */
function loadActiveClaims(): ClaimsFile {
  const file = loadClaims();
  const now = Date.now();
  const claims = file.claims.filter((cl) => stillValid(cl, now) && holderAlive(cl));
  const controller =
    file.controller && stillValid(file.controller, now) && holderAlive(file.controller)
      ? file.controller
      : null;
  return { version: 2, controller, claims };
}

// ---------------------------------------------------------------------------
// Reserved paths — the controller-only category
// ---------------------------------------------------------------------------

/** Shared state no lane may own: the cockpit, session logs, root instruction
 *  files, lockfiles. Two entry kinds, both deterministic, still no globs:
 *    with a '/' or naming a top-level dir → root-relative prefix rule
 *    without a '/'                        → exact BASENAME match at any depth
 *  These are DEFAULTS, not law: a repo overrides the whole list with
 *  `casp/live.config.json` `{ "reserved": [...] }` (committed, unlike the
 *  runtime dir). An empty override list disables the category entirely. */
const DEFAULT_RESERVED = [
  // Trailing slash on purpose: these are ROOT-RELATIVE PREFIXES, never
  // basenames. `casp` as a basename entry would reserve `bin/casp` (a
  // compiled binary is not shared state) and would still miss a nested
  // cockpit — the prefix form says exactly what it means and nothing else.
  'casp/',
  'session-logs/',
  'CLAUDE.md',
  'AGENTS.md',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'Podfile.lock',
  'Cargo.lock',
  'poetry.lock',
  'uv.lock',
  'composer.lock',
  'Gemfile.lock'
];

const LIVE_CONFIG = join(ROOT, 'casp', 'live.config.json');

function reservedList(): string[] {
  const r = readTextFile(LIVE_CONFIG);
  if (!r.ok) return DEFAULT_RESERVED;
  try {
    const parsed = JSON.parse(r.content) as { reserved?: unknown };
    if (Array.isArray(parsed.reserved) && parsed.reserved.every((e) => typeof e === 'string')) {
      return parsed.reserved;
    }
    return DEFAULT_RESERVED;
  } catch {
    return DEFAULT_RESERVED;
  }
}

/** Two entry kinds, chosen by whether the entry contains a '/':
 *    `casp/`, `docs/plan`   → ROOT-RELATIVE PREFIX only (exact, or on a '/'
 *                             boundary). The explicit form.
 *    `CLAUDE.md`, `uv.lock` → root-relative prefix OR exact BASENAME at any
 *                             depth. The forgiving form: someone overriding
 *                             the list with `shared-types` means the directory,
 *                             and `package-lock.json` means every one of them.
 *  Still no globs. Each rule fits in one sentence, which is the bar for a rule
 *  that decides whether a tool call gets refused.
 *
 *  The defaults spell `casp/` and `session-logs/` with the slash on purpose:
 *  as bare basenames they reserved `bin/casp` — a compiled binary is not shared
 *  state, and a guard that blocks on a name collision is a guard people turn
 *  off. */
function isReserved(target: string): boolean {
  const base = target.slice(target.lastIndexOf('/') + 1);
  for (const entry of reservedList()) {
    if (pathCovered(entry.replace(/\/+$/, ''), target)) return true;
    if (!entry.includes('/') && entry === base) return true;
  }
  return false;
}

/** THE dormancy rule — the number-one trap of this design. Reserved paths are
 *  only enforced while a fleet is DEMONSTRABLY flying: a controller is
 *  declared AND at least one OTHER lane is held, and BOTH rows are backed by a
 *  live process this machine can probe. A solo session (with or without the
 *  controller hat) writes its own cockpit, logs and lockfiles like it always
 *  has — a guard that blocked casp/state.json for a solo session would break
 *  the tool's primary single-session use.
 *
 *  Why PID-backed and not merely un-expired: a row with `pid: null` carries no
 *  liveness evidence at all, only an 8-hour default TTL. Two such rows — a
 *  controller and one lane, both left by sessions that died hours ago — used
 *  to arm this category against a brand-new SOLO session and lock it out of
 *  its own `casp/state.json` until the TTL ran out. Reproduced, then closed
 *  here. A PID-less row still binds its own path (that is the claimer's
 *  explicit intent, and it is advisory); what it may no longer do is extend
 *  the reserved category over a third party's shared state on no evidence.
 *
 *  The cost is honest and small: a fleet whose harness exports no process id
 *  gets claims without reserved enforcement. Claude Code exports CLAUDE_PID,
 *  so the case this was built for keeps working — and when the evidence is
 *  absent the answer is ALLOW, every time. */
function reservedEnforced(file: ClaimsFile): boolean {
  return reservedStatus(file).armed;
}

/** Why reserved paths are, or are not, being enforced — in the operator's
 *  words rather than as a bare boolean.
 *
 *  Failing OPEN is the contract. Failing open in SILENCE is a different thing
 *  and it is not defensible: a controller declared from a bare terminal has no
 *  process id, so it arms nothing, and until now the only way to learn that was
 *  to notice that a guard which should have fired never did. A protection
 *  believed to be on and actually off is worse than no protection, because it
 *  is trusted. So the reason travels with the verdict, and `casp live claims`
 *  prints it. CASP records and reports; an unarmed guard is a fact of state,
 *  which is exactly its business. */
function reservedStatus(file: ClaimsFile): { armed: boolean; reason: string } {
  const ctl = file.controller;
  if (ctl === null) {
    return { armed: false, reason: 'no controller declared' };
  }
  if (ctl.pid === null) {
    return {
      armed: false,
      reason:
        'the controller row carries NO PROCESS ID, so it arms nothing — it was ' +
        'declared from a bare terminal rather than from inside the session'
    };
  }
  const foreign = file.claims.filter((cl) => cl.owner !== ctl.owner);
  if (foreign.length === 0) {
    return { armed: false, reason: 'no other lane is held — a solo session is never blocked' };
  }
  if (!foreign.some((cl) => cl.pid !== null)) {
    return {
      armed: false,
      reason:
        `no other lane carries a process id (${foreign.length} lane(s) bounded by TTL alone), ` +
        'so none of them can arm the reserved category'
    };
  }
  return { armed: true, reason: 'a controller and another lane are both backed by a live process' };
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

/** Hard ceiling on the journal before it rolls. One `edit` line is ~120 bytes,
 *  so 5 MB is on the order of 40 000 tool calls — weeks of fleet work, and a
 *  file `tail` and `watch` still read instantly. */
const JOURNAL_MAX_BYTES = 5 * 1024 * 1024;
const JOURNAL_PREV = join(LIVE_DIR, 'journal.1.jsonl');

/** Roll the journal when it crosses the ceiling: rename to journal.1.jsonl
 *  (replacing the previous roll) and start fresh. Lazy, on write, no daemon —
 *  same principle as pruning. Two generations are kept; the journal is a live
 *  view and a short forensic trail, not an archive. `watch` already treats a
 *  size drop as a rotation and re-syncs its offset. Best-effort by
 *  construction: a rotation that fails must never cost an event, let alone a
 *  tool call. */
function rotateJournalIfNeeded(): void {
  try {
    if (!existsSync(JOURNAL)) return;
    if (statSync(JOURNAL).size < JOURNAL_MAX_BYTES) return;
    renameSync(JOURNAL, JOURNAL_PREV);
  } catch {
    /* a journal that cannot roll keeps growing — never a reason to fail */
  }
}

/** Append one event. A single JSON line under PIPE_BUF is an atomic write on
 *  every platform we care about, so concurrent sessions can append without a
 *  lock and lines never interleave. */
function appendEvent(ev: JournalEvent): void {
  ensureLiveDir();
  rotateJournalIfNeeded();
  appendFileSync(JOURNAL, JSON.stringify(ev) + '\n');
}

// ---------------------------------------------------------------------------
// Identity and paths
// ---------------------------------------------------------------------------

/** The harness process id of the CURRENT process, when the harness exports
 *  one. Null everywhere else — and a null never matches anything. */
function callerPid(): number | null {
  const raw = process.env.CLAUDE_PID;
  return raw && Number.isInteger(Number(raw)) ? Number(raw) : null;
}

/** Does the caller of this hook own `row`?
 *
 *  Session id first — that is the identity scheme. The PID fallback covers the
 *  case the session id alone gets wrong: a SUBAGENT. A subagent runs inside its
 *  parent's harness process but a harness is free to hand it its own
 *  `session_id`, and then the subagent would be DENIED on the very lane its
 *  parent claimed — a block, the one direction this design is not allowed to
 *  fail in. Same process id means same session for every harness that forks
 *  subagents in-process, and when no PID is recorded on either side the test
 *  simply does not fire. */
function callerOwns(row: { owner: string; pid: number | null }, session: string): boolean {
  if (row.owner === session) return true;
  const mine = callerPid();
  return mine !== null && row.pid === mine;
}

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
    const pid = callerPid();
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

/** Declare (or release) this session as the fleet controller — the only
 *  writer of RESERVED paths while at least one other lane is live. Dormant
 *  when the session is alone: declaring controller solo changes nothing
 *  until a worker claims a lane. */
function runController(args: string[]): number {
  const label = parseFlag(args, '--label');
  const ttlRaw = parseFlag(args, '--ttl');
  const explicitSession = parseFlag(args, '--session');
  const ttl = ttlRaw === null ? DEFAULT_TTL_MINUTES : Number(ttlRaw);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    console.error(c.red(`--ttl must be a positive number of minutes, got "${ttlRaw}"`));
    return 1;
  }
  const owner = sessionId(explicitSession);
  const file = loadActiveClaims();

  if (args.includes('--release')) {
    if (file.controller?.owner === owner) {
      file.controller = null;
      saveClaims(file);
      appendEvent({ ts: nowISO(), session: owner, type: 'controller-release' });
      console.log(c.green('controller released'));
    } else {
      console.log(c.gray('you are not the controller — nothing released'));
    }
    return 0;
  }

  if (file.controller && file.controller.owner !== owner) {
    const who = file.controller.label ? `${file.controller.label} (${file.controller.owner})` : file.controller.owner;
    console.error(c.red(`controller is already ${who} until ${file.controller.expires_at}`));
    return 1;
  }
  file.controller = {
    owner,
    label,
    pid: callerPid(),
    created_at: nowISO(),
    expires_at: new Date(Date.now() + ttl * 60_000).toISOString()
  };
  saveClaims(file);
  appendEvent({ ts: nowISO(), session: owner, type: 'controller', label: label ?? undefined });
  console.log(`${c.green('controller declared')} ${label ?? owner} ${c.gray(`until ${file.controller.expires_at}`)}`);
  console.log(c.gray('reserved paths are enforced only while another session holds a lane'));
  return 0;
}

function runClaims(args: string[]): number {
  const file = loadActiveClaims();
  const reserved = reservedStatus(file);
  if (args.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          ...file,
          enforcing: !liveDisabled(),
          reserved_paths: { armed: reserved.armed && !liveDisabled(), reason: reserved.reason }
        },
        null,
        2
      )
    );
    return 0;
  }
  // A list of claims read as a list of things being enforced. When a kill
  // switch is set they are enforcing nothing, and the human reading this
  // screen to debug a guard has to be told so on the first line.
  if (liveDisabled()) {
    console.log(
      c.yellow('casp live is OFF') +
        c.gray(' — the guard stands down; the rows below block nothing (casp live on)')
    );
  }
  // Restore the self-gitignore if it was removed by hand: without it the
  // runtime dir surfaces in `git status` and the cockpit carries a standing
  // workdir warning. Read-only commands are a safe place to heal it.
  try {
    ensureLiveDir();
  } catch {
    /* best-effort */
  }
  if (file.controller) {
    const who = file.controller.label ? `${file.controller.label} (${file.controller.owner})` : file.controller.owner;
    console.log(`${c.bold('controller')}  ${who}`);
  }
  // Always state where the reserved category stands, and WHY — including when
  // no controller was declared at all. A silent "not armed" is the failure mode
  // this line exists to remove.
  console.log(
    reserved.armed
      ? `${c.bold('reserved paths')}  ${c.yellow('ENFORCED')}  ${c.gray(reserved.reason)}`
      : `${c.bold('reserved paths')}  ${c.gray('not enforced')}  ${c.gray(reserved.reason)}`
  );
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
        const file = loadActiveClaims();
        // Reserved paths first: while a fleet is flying (controller declared
        // AND another lane live), only the controller writes shared state.
        // Solo sessions never hit this branch — see reservedEnforced().
        if (
          reservedEnforced(file) &&
          !callerOwns(file.controller!, session) &&
          isReserved(target)
        ) {
          appendEvent({ ts: nowISO(), session, type: 'denied', path: target, tool, denied_owner: file.controller!.owner });
          console.error(
            `casp live: "${target}" is RESERVED shared state — while a fleet is active, only the ` +
              `controller (${file.controller!.label ?? file.controller!.owner}) writes it. ` +
              `Report what should be recorded there via SendMessage instead of editing it.`
          );
          return 2;
        }
        const foreign = file.claims.find(
          (cl) => !callerOwns(cl, session) && pathCovered(cl.path, target)
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
  try {
    runLiveInner(args);
  } catch (err) {
    // Belt and braces over runHook's own catch: an unexpected throw anywhere
    // under `casp live hook` must still exit 0. Nothing this verb can fail at
    // is worth blocking a tool call over.
    if (args[0] === 'hook') exit(0);
    console.error(c.red(`casp live: ${err instanceof Error ? err.message : String(err)}`));
    exit(1);
  }
}

function runLiveInner(args: string[]): void {
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
    case 'controller':
      code = runController(rest);
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
          `unknown live subcommand "${sub ?? ''}" — expected claim | release | claims | controller | log | tail | watch | hook | install | off | on`
        )
      );
      code = 1;
  }
  if (code >= 0) exit(code);
  // watch: fall through and let the interval keep the process alive.
}
