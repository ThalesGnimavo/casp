/**
 * Shared helpers — ANSI colors, git, frontmatter parsing.
 */

import { execSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

// Single source of truth: read package.json at runtime so the CLI strings can
// never drift from the published package again. dist/*.js lives in dist/,
// package.json one level up (npm always ships package.json).
function readPkg(): { name?: string; version?: string } {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return JSON.parse(
      readFileSync(join(here, '..', 'package.json'), 'utf8')
    ) as { name?: string; version?: string };
  } catch {
    return {};
  }
}

export function pkgVersion(): string {
  return readPkg().version ?? '0.0.0';
}

export function pkgName(): string {
  return readPkg().name ?? '@justethales/casp';
}

export const COLOR_ON = stdout.isTTY && !process.env.NO_COLOR;

export const c = {
  red: (s: string) => (COLOR_ON ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s: string) => (COLOR_ON ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (COLOR_ON ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s: string) => (COLOR_ON ? `\x1b[36m${s}\x1b[0m` : s),
  gray: (s: string) => (COLOR_ON ? `\x1b[90m${s}\x1b[0m` : s),
  bold: (s: string) => (COLOR_ON ? `\x1b[1m${s}\x1b[0m` : s)
};

export function setColor(on: boolean): void {
  // Used by --plain to disable colors mid-run.
  Object.keys(c).forEach((k) => {
    if (!on) (c as Record<string, (s: string) => string>)[k] = (s: string) => s;
  });
}

/**
 * Shell-based git. The command string is interpolated into a shell, so it MUST
 * only ever receive STATIC, literal arguments (`git('rev-parse --short HEAD')`).
 * Never pass a value read from casp/state.json or from a CLI argument through
 * here — a crafted value like `HEAD; rm -rf ~` would run in the shell. For any
 * interpolated/untrusted input use `gitArgs()` below, which cannot be injected.
 */
export function git(cmd: string, cwd: string = process.cwd()): string {
  try {
    return execSync(`git ${cmd}`, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

/**
 * Injection-safe git: arguments are passed as an argv array to `execFileSync`,
 * so NO shell is involved and no value can break out of its argument slot. This
 * is the required form for any git call that interpolates untrusted input —
 * values read from casp/state.json (last_commit, sessions_dir, logs_dir, …) or
 * from CLI arguments. A hostile value becomes a single, invalid git argument
 * (git errors, we return ''), never a shell command. Same '' -on-failure and
 * trimmed-stdout contract as git().
 */
export function gitArgs(args: string[], cwd: string = process.cwd()): string {
  try {
    return execFileSync('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

export function readFrontmatter(
  filePath: string
): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  try {
    return parseYaml(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface State {
  updated_at?: string;
  last_session_id?: string;
  last_commit?: string;
  current_phase?: string;
  next_phase?: string;
  next_prompt?: string;
  phases_shipped?: string[];
  phases_queued?: string[];
  migrations_applied?: string[];
  // All three are OPTIONAL. sessions_dir / logs_dir default to the protocol's
  // canonical layout; a project that keeps that layout sets neither. migrations
  // has no default — a project with no migration concept reports none.
  sessions_dir?: string;
  logs_dir?: string;
  migrations_dir?: string;
  [k: string]: unknown;
}

// The protocol's canonical layout — the defaults when state declares no override.
export const DEFAULT_SESSIONS_DIR = 'docs/plan/sessions';
export const DEFAULT_LOGS_DIR = 'session-logs';

/**
 * The three state-surface directories, resolved from state in ONE place so every
 * verb computes them identically. Returns each in two forms: repo-relative
 * (`*Rel`, for messages, git pathspecs and the state-bump surface match) and
 * absolute (`*Abs`, for filesystem calls). `sessions`/`logs` always resolve (to
 * the defaults when unset); `migrations` is null when the project declares none.
 */
export interface ResolvedDirs {
  sessionsRel: string;
  logsRel: string;
  migrationsRel: string | null;
  sessionsAbs: string;
  logsAbs: string;
  migrationsAbs: string | null;
}

export function resolveDirs(root: string, state: State): ResolvedDirs {
  const pick = (v: unknown, fallback: string): string =>
    typeof v === 'string' && v.trim() ? v.trim() : fallback;
  const sessionsRel = pick(state.sessions_dir, DEFAULT_SESSIONS_DIR);
  const logsRel = pick(state.logs_dir, DEFAULT_LOGS_DIR);
  const migrationsRel =
    typeof state.migrations_dir === 'string' && state.migrations_dir.trim()
      ? state.migrations_dir.trim()
      : null;
  return {
    sessionsRel,
    logsRel,
    migrationsRel,
    sessionsAbs: join(root, sessionsRel),
    logsAbs: join(root, logsRel),
    migrationsAbs: migrationsRel ? join(root, migrationsRel) : null
  };
}

export function loadState(path: string): State | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as State;
  } catch {
    return null;
  }
}

// Round-trips state.json: parse order is preserved, so mutating arrays/fields
// in place keeps the file's key order. 2-space indent + trailing newline match
// what `init` scaffolds and what every state-bump commit has written so far.
export function saveState(path: string, state: State): void {
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
