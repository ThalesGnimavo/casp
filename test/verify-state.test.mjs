/**
 * `casp verify <commit>` + `casp state diff` — make "git log is your compliance
 * trail" inspectable.
 *
 *   verify     — validate a historical commit in a throwaway worktree, propagate
 *                the verdict, ALWAYS clean the worktree up (no leak)
 *   state diff — field-level diff of casp/state.json between two commits
 *
 * Both are READ-ONLY: they never mutate the user's worktree, index, or history.
 *
 * Runs the BUILT binary (dist/cli.js); `pretest` builds first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}
function gitOut(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
function run(cwd, ...args) {
  return spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}
function writeState(dir, state) {
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2) + '\n');
}

// A repo with two state-bump commits so there is real history to diff/verify.
function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'casp-verify-state-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@casp.sh');
  git(dir, 'config', 'user.name', 'casp test');

  mkdirSync(join(dir, 'casp'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'plan', 'sessions'), { recursive: true });
  mkdirSync(join(dir, 'session-logs'), { recursive: true });

  const sessionId = '26-01-01-001-first-slice';
  writeFileSync(join(dir, 'session-logs', `${sessionId}.md`), '# first slice\n');
  writeFileSync(
    join(dir, 'docs', 'plan', 'sessions', 'PHASE-1.md'),
    '---\nstatus: queued\nsession_id: pending\nsession_log: pending\n---\n\n# Phase 1\n'
  );
  const state = {
    updated_at: '2026-01-01',
    last_session_id: sessionId,
    last_commit: 'pending',
    current_phase: 'phase-0',
    next_phase: 'phase-1',
    next_prompt: 'docs/plan/sessions/PHASE-1.md',
    phases_shipped: ['phase-0'],
    phases_queued: ['phase-1']
  };
  writeState(dir, state);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  state.last_commit = gitOut(dir, 'rev-parse', '--short', 'HEAD');
  writeState(dir, state);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'state bump 1');

  // a SECOND state move: advance the phase
  state.current_phase = 'phase-1';
  state.phases_shipped = ['phase-0', 'phase-1'];
  state.phases_queued = [];
  state.current_phase = 'phase-1';
  writeState(dir, state);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'state bump 2: ship phase-1');
  return { dir, state };
}

const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

test('state diff: reports added/removed array elements and changed fields', () => {
  const { dir } = scaffold();
  try {
    const r = run(dir, 'state', 'diff', '--json', 'HEAD~1', 'HEAD');
    assert.equal(r.status, 0, r.stderr);
    const d = JSON.parse(r.stdout);
    assert.equal(d.from, 'HEAD~1');
    assert.equal(d.to, 'HEAD');
    const shipped = d.changes.find((c) => c.field === 'phases_shipped');
    assert.ok(shipped && shipped.op === 'changed', 'phases_shipped must show as changed');
    assert.deepEqual(shipped.after, ['phase-0', 'phase-1']);
    const phase = d.changes.find((c) => c.field === 'current_phase');
    assert.ok(phase && phase.before === 'phase-0' && phase.after === 'phase-1');
  } finally {
    cleanup(dir);
  }
});

test('state diff: identical state → no changes', () => {
  const { dir } = scaffold();
  try {
    const r = run(dir, 'state', 'diff', '--json', 'HEAD', 'HEAD');
    assert.equal(r.status, 0, r.stderr);
    const d = JSON.parse(r.stdout);
    assert.equal(d.changes.length, 0);
  } finally {
    cleanup(dir);
  }
});

test('verify: a clean historical commit → exit 0, worktree cleaned up', () => {
  const { dir } = scaffold();
  try {
    const before = gitOut(dir, 'worktree', 'list');
    const r = run(dir, 'verify', 'HEAD');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /PASS|sync/i, 'verify prints the validator report');
    // no worktree left registered
    const after = gitOut(dir, 'worktree', 'list');
    assert.equal(after, before, 'verify must leave no worktree behind');
  } finally {
    cleanup(dir);
  }
});

test('verify: a historically DRIFTED commit → exit 1, still cleans up', () => {
  const { dir } = scaffold();
  try {
    // make a drifted commit: next_prompt points at a missing file
    const bad = {
      updated_at: '2026-01-02',
      last_session_id: '26-01-01-001-first-slice',
      last_commit: gitOut(dir, 'rev-parse', '--short', 'HEAD'),
      current_phase: 'phase-1',
      next_phase: 'phase-2',
      next_prompt: 'docs/plan/sessions/GONE.md',
      phases_shipped: ['phase-0', 'phase-1'],
      phases_queued: []
    };
    writeState(dir, bad);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'drifted commit');
    const driftedSha = gitOut(dir, 'rev-parse', '--short', 'HEAD');

    // move HEAD on; verify the drifted commit by sha
    const r = run(dir, 'verify', driftedSha);
    assert.equal(r.status, 1, 'verifying a drifted historical commit must exit 1');
    // only the main worktree remains — the throwaway verify worktree is gone.
    const after = gitOut(dir, 'worktree', 'list').split('\n').filter((l) => l.trim());
    assert.equal(after.length, 1, 'verify must leave no extra worktree behind');
  } finally {
    cleanup(dir);
  }
});

test('verify: not a commit → exit 1', () => {
  const { dir } = scaffold();
  try {
    const r = run(dir, 'verify', 'nope-not-a-ref');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /not a commit/);
  } finally {
    cleanup(dir);
  }
});

// Regression: the multiset delta. Dropping ONE of a duplicated element must be
// reported as a single removal — the old index-based delta cancelled it out and
// showed nothing changed. Display-only path (`state diff`), never gates `check`.
test('state diff: dropping one of a duplicated array element reports a single removal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'casp-dup-delta-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@casp.sh');
    git(dir, 'config', 'user.name', 'casp test');
    mkdirSync(join(dir, 'casp'), { recursive: true });

    const base = { updated_at: '2026-01-01', phases_shipped: ['a', 'a', 'b'] };
    writeState(dir, base);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'dup present');

    writeState(dir, { ...base, phases_shipped: ['a', 'b'] });
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'drop one dup');

    // Human (non-JSON) render: arrayDelta drives the +/- element lines on stdout.
    const r = run(dir, 'state', 'diff', 'HEAD~1', 'HEAD');
    assert.equal(r.status, 0, r.stderr);
    const plain = r.stdout.replace(/\[[0-9;]*m/g, ''); // strip ANSI
    const removals = plain.split('\n').filter((l) => /^\s*- /.test(l));
    assert.equal(removals.length, 1, `expected exactly one removal line, got:\n${plain}`);
    assert.match(removals[0], /a/, 'the removed element is the duplicated one');
    assert.ok(!/^\s*\+ /m.test(plain), 'nothing was added');
  } finally {
    cleanup(dir);
  }
});
