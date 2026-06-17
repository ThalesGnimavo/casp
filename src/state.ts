/**
 * `casp state diff [A] [B]` — how `casp/state.json` evolved between two commits.
 *
 * Reads `git show <ref>:casp/state.json` for each side — READ-ONLY, it never
 * touches the worktree or index — and reports a field-level diff: which keys were
 * added, removed, or changed (with element-level deltas for array fields like
 * `phases_shipped`). Default A = `HEAD~1`, B = `HEAD` (the most recent state
 * move). Human output by default; `--json` for a structured diff.
 *
 * This makes "git log is your compliance trail" inspectable: see exactly how the
 * recorded state changed across any two points, straight from git.
 */

import { exit } from 'node:process';
import { c, git } from './shared.js';

type Json = Record<string, unknown>;

interface Change {
  field: string;
  op: 'added' | 'removed' | 'changed';
  before: unknown;
  after: unknown;
}

function showState(ref: string, root: string): Json | null {
  const raw = git(`show ${ref}:casp/state.json`, root);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Json;
  } catch {
    return null;
  }
}

function fmt(v: unknown): string {
  if (v === undefined) return '∅';
  const s = JSON.stringify(v);
  return s.length > 80 ? s.slice(0, 77) + '…' : s;
}

function diffStates(a: Json, b: Json): Change[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const changes: Change[] = [];
  for (const k of keys) {
    const inA = k in a;
    const inB = k in b;
    if (inA && !inB) changes.push({ field: k, op: 'removed', before: a[k], after: undefined });
    else if (!inA && inB) changes.push({ field: k, op: 'added', before: undefined, after: b[k] });
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      changes.push({ field: k, op: 'changed', before: a[k], after: b[k] });
  }
  return changes;
}

// Element-level delta for two arrays — what `b` added and removed vs `a`.
function arrayDelta(before: unknown, after: unknown): { added: unknown[]; removed: unknown[] } | null {
  if (!Array.isArray(before) || !Array.isArray(after)) return null;
  const sa = before.map((x) => JSON.stringify(x));
  const sb = after.map((x) => JSON.stringify(x));
  const added = after.filter((_, i) => !sa.includes(sb[i]));
  const removed = before.filter((_, i) => !sb.includes(sa[i]));
  return { added, removed };
}

export function runState(args: string[]): void {
  const [sub, ...rest] = args;
  if (sub !== 'diff') {
    console.error(c.red(`unknown state subcommand: ${sub ?? '(none)'}`));
    console.error(c.gray('  → casp state diff [A] [B]   (default HEAD~1 → HEAD)'));
    exit(1);
  }
  const json = rest.includes('--json');
  const positional = rest.filter((a) => !a.startsWith('--'));
  const A = positional[0] ?? 'HEAD~1';
  const B = positional[1] ?? 'HEAD';

  const root = process.cwd();
  if (git('rev-parse --is-inside-work-tree', root) !== 'true') {
    console.error(c.red('FAIL') + ' not a git repository');
    exit(1);
  }
  const a = showState(A, root);
  const b = showState(B, root);
  if (a === null) {
    console.error(c.red('FAIL') + ` no readable casp/state.json at ${A}`);
    console.error(c.gray('  → pass commits that both carry casp/state.json'));
    exit(1);
  }
  if (b === null) {
    console.error(c.red('FAIL') + ` no readable casp/state.json at ${B}`);
    console.error(c.gray('  → pass commits that both carry casp/state.json'));
    exit(1);
  }

  const changes = diffStates(a, b);

  if (json) {
    console.log(JSON.stringify({ from: A, to: B, changes }, null, 2));
    exit(0);
  }

  console.error(c.bold('casp state diff') + ` · ${c.cyan(A)} → ${c.cyan(B)}`);
  console.error(c.gray('─'.repeat(70)));
  if (changes.length === 0) {
    console.log(c.gray('  (no change to casp/state.json between these commits)'));
    exit(0);
  }
  for (const ch of changes) {
    if (ch.op === 'added') {
      console.log(`  ${c.green('+')} ${ch.field} = ${c.green(fmt(ch.after))}`);
    } else if (ch.op === 'removed') {
      console.log(`  ${c.red('-')} ${ch.field} ${c.gray(`(was ${fmt(ch.before)})`)}`);
    } else {
      const delta = arrayDelta(ch.before, ch.after);
      if (delta) {
        console.log(`  ${c.yellow('~')} ${ch.field}`);
        for (const x of delta.added) console.log(`      ${c.green('+ ' + fmt(x))}`);
        for (const x of delta.removed) console.log(`      ${c.red('- ' + fmt(x))}`);
      } else {
        console.log(`  ${c.yellow('~')} ${ch.field}: ${c.gray(fmt(ch.before))} → ${c.cyan(fmt(ch.after))}`);
      }
    }
  }
  console.log('');
  exit(0);
}
