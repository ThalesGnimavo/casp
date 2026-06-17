/**
 * `casp status --json` — the structured session handoff.
 *
 *   shape      — stable documented schema (schema_version, project, git, state, check)
 *   verdict    — embeds the in-process validator verdict (clean / drift)
 *   never gates — exit code stays 0 even when the embedded verdict is drift
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

function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'casp-statusjson-'));
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
    '---\nstatus: queued\nsession_id: pending\nsession_log: pending\n---\n\n# Phase 2\n'
  );
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo-proj', version: '1.2.3' }) + '\n');
  const state = {
    updated_at: '2026-01-01',
    last_session_id: sessionId,
    last_commit: 'pending',
    current_phase: 'phase-1',
    next_phase: 'phase-2',
    next_prompt: 'docs/plan/sessions/PHASE-2-NEXT.md',
    phases_shipped: ['phase-0a', 'phase-0b'],
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

test('status --json: stable shape, verdict clean on a clean cockpit, exit 0', () => {
  const { dir } = scaffold();
  try {
    const r = run(dir, 'status', '--json');
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.equal(j.schema_version, 1);
    assert.equal(j.project.name, 'demo-proj');
    assert.equal(j.project.version, '1.2.3');
    assert.equal(j.state.current_phase, 'phase-1');
    assert.equal(j.state.next_phase, 'phase-2');
    assert.equal(j.state.next_prompt_status, 'queued');
    assert.equal(j.state.next_prompt_exists, true);
    assert.equal(j.state.phases_shipped_count, 2);
    assert.equal(j.state.phases_queued_count, 1);
    assert.equal(j.check.verdict, 'clean');
    assert.equal(j.check.fail, 0);
  } finally {
    cleanup(dir);
  }
});

test('status --json: embeds a drift verdict but STILL exits 0 (reporting, not gating)', () => {
  const { dir, state } = scaffold();
  try {
    // Drift: next_prompt points at a missing file.
    state.next_prompt = 'docs/plan/sessions/DOES-NOT-EXIST.md';
    writeState(dir, state);
    const r = run(dir, 'status', '--json');
    assert.equal(r.status, 0, 'status must never gate — exit 0 even on drift');
    const j = JSON.parse(r.stdout);
    assert.equal(j.check.verdict, 'drift');
    assert.ok(j.check.fail > 0, 'the embedded verdict must reflect the drift');
    assert.equal(j.state.next_prompt_exists, false);
  } finally {
    cleanup(dir);
  }
});

test('status (human) still works and is unchanged in spirit', () => {
  const { dir } = scaffold();
  try {
    const r = run(dir, 'status', '--plain');
    assert.equal(r.status ?? 0, 0, r.stderr);
    assert.match(r.stdout, /current_phase/);
    assert.match(r.stdout, /demo-proj@1\.2\.3/);
  } finally {
    cleanup(dir);
  }
});
