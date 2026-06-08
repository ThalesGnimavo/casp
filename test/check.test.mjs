/**
 * `casp check` exit-code contract — the property the CI gate depends on.
 *
 *   clean state  → exit 0   (the push is allowed through)
 *   drifted state → exit 1   (the push is blocked)
 *
 * If this ever regresses to "logs but always exits 0", the CI status check the
 * README and landing page sell becomes decorative. This test is the guardrail.
 *
 * Runs the BUILT binary (dist/cli.js) against a throwaway git repo. `pretest`
 * builds first, so `npm test` is self-contained.
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

function runCheck(cwd) {
  const r = spawnSync('node', [CLI, 'check', '--quiet'], { cwd, encoding: 'utf8' });
  return r.status;
}

function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'casp-test-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@casp.sh');
  git(dir, 'config', 'user.name', 'casp test');

  mkdirSync(join(dir, 'casp'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'plan', 'sessions'), { recursive: true });
  mkdirSync(join(dir, 'session-logs'), { recursive: true });

  const sessionId = '26-01-01-001-first-slice';
  writeFileSync(
    join(dir, 'session-logs', `${sessionId}.md`),
    '# first slice — session log\n'
  );
  writeFileSync(
    join(dir, 'docs', 'plan', 'sessions', 'PHASE-1-FIRST-SLICE.md'),
    '---\nstatus: queued\nsession_id: pending\nsession_log: pending\n---\n\n# Phase 1 — first slice\n'
  );
  const state = {
    updated_at: '2026-01-01',
    last_session_id: sessionId,
    last_commit: 'pending',
    current_phase: 'phase-1-first-slice',
    next_phase: 'phase-2',
    next_prompt: 'docs/plan/sessions/PHASE-1-FIRST-SLICE.md',
    phases_shipped: [],
    phases_queued: ['phase-1-first-slice'],
    migrations_applied: [],
    migrations_dir: 'drizzle'
  };
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));

  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: dir,
    encoding: 'utf8'
  }).trim();
  state.last_commit = head;
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));

  return { dir, state };
}

test('clean state → exit 0 (push allowed)', () => {
  const { dir } = scaffold();
  try {
    assert.equal(runCheck(dir), 0, 'a coherent state must exit 0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('drifted state → exit 1 (push blocked)', () => {
  const { dir, state } = scaffold();
  try {
    // Drift: next_prompt now points at a file that does not exist.
    state.next_prompt = 'docs/plan/sessions/DOES-NOT-EXIST.md';
    writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
    assert.equal(runCheck(dir), 1, 'a drifted state must exit 1 so the CI gate fails');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
