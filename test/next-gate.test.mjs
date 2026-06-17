/**
 * `casp next` pre-session gate — the START boundary, symmetric with the push
 * boundary `install-hook` wires.
 *
 *   clean state  → prints the prompt to stdout, exit 0
 *   drifted state → refuses: drift summary on stderr, stdout EMPTY, exit 1
 *   --no-check    → bypasses the gate, prints the prompt even on drift
 *
 * `next` must run the validator IN-PROCESS (never shell out to itself) and stay
 * a printer — it never runs anything after printing.
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
function head(cwd) {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
}
function run(cwd, ...args) {
  return spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}
function writeState(dir, state) {
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2) + '\n');
}

// A committed, clean cockpit whose next_prompt is a real queued prompt.
function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'casp-nextgate-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@casp.sh');
  git(dir, 'config', 'user.name', 'casp test');

  mkdirSync(join(dir, 'casp'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'plan', 'sessions'), { recursive: true });
  mkdirSync(join(dir, 'session-logs'), { recursive: true });

  const sessionId = '26-01-01-001-first-slice';
  writeFileSync(join(dir, 'session-logs', `${sessionId}.md`), '# first slice\n');
  writeFileSync(
    join(dir, 'docs', 'plan', 'sessions', 'PHASE-2-NEXT.md'),
    '---\nstatus: queued\nsession_id: pending\nsession_log: pending\n---\n\n# Phase 2 — UNIQUE-PROMPT-MARKER\n'
  );
  const state = {
    updated_at: '2026-01-01',
    last_session_id: sessionId,
    last_commit: 'pending',
    current_phase: 'phase-1',
    next_phase: 'phase-2',
    next_prompt: 'docs/plan/sessions/PHASE-2-NEXT.md',
    phases_shipped: [],
    phases_queued: ['phase-2']
  };
  writeState(dir, state);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  state.last_commit = head(dir);
  writeState(dir, state);
  return { dir, state };
}

const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

test('next: clean state → prints the prompt to stdout, exit 0', () => {
  const { dir } = scaffold();
  try {
    const r = run(dir, 'next');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /UNIQUE-PROMPT-MARKER/, 'the prompt body must be printed on a clean state');
  } finally {
    cleanup(dir);
  }
});

test('next: drifted state → refuses, stdout empty, exit 1', () => {
  const { dir, state } = scaffold();
  try {
    // Drift that is NOT the missing-next_prompt / shipped cases (those have their
    // own sharper guards): a stale last_commit that is not HEAD's parent.
    state.last_commit = 'deadbee';
    writeState(dir, state);
    const r = run(dir, 'next');
    assert.equal(r.status, 1, 'a drifted state must make next refuse');
    assert.equal(r.stdout, '', 'no prompt may reach stdout when the gate blocks');
    assert.match(r.stderr, /drift/i, 'the refusal must explain it is drift');
  } finally {
    cleanup(dir);
  }
});

test('next --no-check: bypasses the gate, prints the prompt even on drift', () => {
  const { dir, state } = scaffold();
  try {
    state.last_commit = 'deadbee';
    writeState(dir, state);
    const r = run(dir, 'next', '--no-check');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /UNIQUE-PROMPT-MARKER/, '--no-check must print the prompt despite drift');
  } finally {
    cleanup(dir);
  }
});

test('next: a missing next_prompt keeps its own sharp guard (not the generic gate)', () => {
  const { dir, state } = scaffold();
  try {
    state.next_prompt = 'docs/plan/sessions/DOES-NOT-EXIST.md';
    writeState(dir, state);
    const r = run(dir, 'next');
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /missing file/, 'missing next_prompt keeps its specific message');
  } finally {
    cleanup(dir);
  }
});
