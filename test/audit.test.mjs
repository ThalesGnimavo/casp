/**
 * `casp audit` — the deep-audit watermark contract.
 *
 *   status (no watermark) → reports the whole tree unaudited, exit 0
 *   bump                  → writes last_deep_audit = HEAD short SHA
 *   status (at watermark) → up to date, exit 0
 *   status (behind)       → reports the unaudited count, exit 0
 *   bump <bogus>          → exit 1, state untouched
 *
 * Runs the BUILT binary (dist/cli.js) against a throwaway git repo. `pretest`
 * builds first, so `npm test` is self-contained.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function audit(cwd, ...args) {
  return spawnSync('node', [CLI, 'audit', ...args], { cwd, encoding: 'utf8' });
}

function head(cwd) {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
}

function readState(cwd) {
  return JSON.parse(readFileSync(join(cwd, 'casp', 'state.json'), 'utf8'));
}

function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'casp-audit-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@casp.sh');
  git(dir, 'config', 'user.name', 'casp test');
  mkdirSync(join(dir, 'casp'), { recursive: true });
  const state = {
    updated_at: '2026-01-01',
    last_session_id: 'pending',
    last_commit: 'pending',
    current_phase: 'phase-1',
    next_phase: 'phase-2',
    next_prompt: null,
    phases_shipped: []
  };
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

function commit(dir, name) {
  writeFileSync(join(dir, name), name + '\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', name);
}

test('status with no watermark → whole tree unaudited, exit 0', () => {
  const dir = scaffold();
  try {
    const r = audit(dir, 'status', '--json');
    assert.equal(r.status, 0);
    const s = JSON.parse(r.stdout);
    assert.equal(s.watermark, null);
    assert.equal(s.unauditedCount, 1); // the init commit
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bump writes last_deep_audit = HEAD; status then reports up to date', () => {
  const dir = scaffold();
  try {
    const b = audit(dir, 'bump');
    assert.equal(b.status, 0);
    assert.equal(readState(dir).last_deep_audit, head(dir));

    const r = audit(dir, 'status', '--json');
    const s = JSON.parse(r.stdout);
    assert.equal(s.watermark, head(dir));
    assert.equal(s.unauditedCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('status reports the count of commits since the watermark', () => {
  const dir = scaffold();
  try {
    audit(dir, 'bump');
    commit(dir, 'b.txt');
    commit(dir, 'c.txt');
    const r = audit(dir, 'status', '--json');
    const s = JSON.parse(r.stdout);
    assert.equal(s.unauditedCount, 2);
    assert.ok(s.files.includes('b.txt') && s.files.includes('c.txt'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bump on a bogus ref → exit 1, state untouched', () => {
  const dir = scaffold();
  try {
    const before = readState(dir);
    const r = audit(dir, 'bump', 'not-a-real-sha');
    assert.equal(r.status, 1);
    assert.deepEqual(readState(dir), before, 'a failed bump must not mutate state');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown subcommand → exit 1', () => {
  const dir = scaffold();
  try {
    assert.equal(audit(dir, 'frobnicate').status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
