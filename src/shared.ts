/**
 * Shared helpers — ANSI colors, git, frontmatter parsing.
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { stdout } from 'node:process';
import { parse as parseYaml } from 'yaml';

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
  migrations_dir?: string;
  [k: string]: unknown;
}

export function loadState(path: string): State | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as State;
  } catch {
    return null;
  }
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
