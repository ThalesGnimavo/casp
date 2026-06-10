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

function runCheckJson(cwd) {
  const r = spawnSync('node', [CLI, 'check', '--json'], { cwd, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout };
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

/*
 * `casp check --json` contract — same checks, same exit code, machine-readable
 * format. Other tools (CI annotations, notification payloads, status roll-ups)
 * consume this; the shape below is the documented v1 schema (docs/check-json.md).
 */

test('--json on clean state → exit 0, verdict clean, valid schema', () => {
  const { dir } = scaffold();
  try {
    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 0, 'exit code must stay 0 on a clean state');
    const report = JSON.parse(stdout);
    assert.equal(report.schema_version, 1);
    assert.match(report.casp_version, /^\d+\.\d+\.\d+/);
    assert.equal(report.verdict, 'clean');
    assert.equal(report.exit_code, 0);
    assert.equal(report.summary.fail, 0);
    assert.ok(Array.isArray(report.findings) && report.findings.length > 0);
    assert.equal(
      report.findings.length,
      report.summary.pass + report.summary.warn + report.summary.fail,
      'summary counts must add up to the findings array'
    );
    for (const f of report.findings) {
      assert.equal(typeof f.id, 'string');
      assert.ok(['pass', 'warn', 'fail'].includes(f.severity));
      assert.equal(typeof f.label, 'string');
      assert.equal(typeof f.detail, 'string');
      assert.ok(f.fix === null || typeof f.fix === 'string');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--json on drifted state → exit 1, verdict drift, failing finding present', () => {
  const { dir, state } = scaffold();
  try {
    state.next_prompt = 'docs/plan/sessions/DOES-NOT-EXIST.md';
    writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 1, 'exit code must stay 1 on drift — --json never changes the verdict');
    const report = JSON.parse(stdout);
    assert.equal(report.verdict, 'drift');
    assert.equal(report.exit_code, 1);
    assert.ok(report.summary.fail > 0);
    const failing = report.findings.find(
      (f) => f.id === 'next_prompt.exists' && f.severity === 'fail'
    );
    assert.ok(failing, 'the missing next_prompt must surface as a fail finding');
    assert.ok(failing.fix, 'fail findings carry their → fix hint');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--json with no casp/state.json → exit 1, still valid JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'casp-test-'));
  try {
    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 1);
    const report = JSON.parse(stdout);
    assert.equal(report.verdict, 'drift');
    assert.equal(report.findings[0].id, 'state.file');
    assert.equal(report.findings[0].severity, 'fail');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('default human-readable output carries no JSON braces (format untouched)', () => {
  const { dir } = scaffold();
  try {
    const r = spawnSync('node', [CLI, 'check'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('casp:check'), 'human header intact');
    assert.ok(!r.stdout.trimStart().startsWith('{'), 'default output is not JSON');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
