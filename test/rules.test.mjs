/**
 * The rule registry — `casp rules`, `casp explain`, and the coverage guarantee
 * that every finding `casp check` emits carries a stable rule code. If a new
 * check lands without a matching rule, the coverage test fails loudly rather
 * than shipping a null `rule` to consumers.
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
function run(cwd, ...args) {
  return spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}

// A repo whose state deliberately trips several checks (a mix of pass / warn /
// fail) so the coverage assertion sees many distinct finding ids at once.
function scaffold({ drift = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'casp-rules-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@casp.sh');
  git(dir, 'config', 'user.name', 'casp test');
  mkdirSync(join(dir, 'casp'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'plan', 'sessions'), { recursive: true });
  mkdirSync(join(dir, 'session-logs'), { recursive: true });
  mkdirSync(join(dir, 'migrations'), { recursive: true });

  const sessionId = '26-01-01-001-slice';
  writeFileSync(join(dir, 'session-logs', `${sessionId}.md`), '# slice\n');
  writeFileSync(join(dir, 'migrations', '0001_init.sql'), 'CREATE TABLE t (id int);\n');
  writeFileSync(
    join(dir, 'docs', 'plan', 'sessions', 'PHASE-1.md'),
    '---\nstatus: shipped\nsession_id: ' +
      sessionId +
      '\nsession_log: session-logs/' +
      sessionId +
      '.md\n---\n\n# Phase 1\n'
  );
  writeFileSync(
    join(dir, 'docs', 'plan', 'sessions', 'PHASE-2.md'),
    '---\nstatus: queued\nsession_id: pending\nsession_log: pending\n---\n\n# Phase 2\n'
  );
  const state = {
    updated_at: '2026-01-01',
    last_session_id: sessionId,
    last_commit: 'pending',
    current_phase: 'phase-1',
    next_phase: 'phase-2',
    next_prompt: drift ? 'docs/plan/sessions/GONE.md' : 'docs/plan/sessions/PHASE-2.md',
    phases_shipped: ['phase-1'],
    phases_queued: ['phase-2'],
    migrations_applied: ['0001_init'],
    migrations_dir: 'migrations'
  };
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: dir,
    encoding: 'utf8'
  }).trim();
  state.last_commit = drift ? 'deadbeef' : head;
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'state bump');
  return dir;
}

const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

test('casp rules: lists the catalogue, exit 0', () => {
  const dir = scaffold();
  try {
    const r = run(dir, 'rules');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /CASP-GIT-001/);
    assert.match(r.stdout, /CASP-STATE-001/);
    const json = run(dir, 'rules', '--json');
    const arr = JSON.parse(json.stdout);
    assert.ok(Array.isArray(arr) && arr.length >= 15, 'JSON catalogue is a non-trivial array');
    assert.ok(arr.every((x) => x.code && x.title && x.verifies && x.evidence && x.remediation));
    assert.ok(!('matches' in arr[0]), 'the matcher function is not serialized');
  } finally {
    cleanup(dir);
  }
});

test('casp explain: by code (exit 0), by finding id (exit 0), unknown (exit 1)', () => {
  const dir = scaffold();
  try {
    assert.equal(run(dir, 'explain', 'CASP-GIT-001').status, 0);
    assert.equal(run(dir, 'explain', 'casp-git-001').status, 0, 'code lookup is case-insensitive');
    assert.equal(run(dir, 'explain', 'last_commit.git').status, 0, 'resolves an internal finding id');
    const bad = run(dir, 'explain', 'CASP-NOPE-999');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /no rule matches/);
    assert.equal(run(dir, 'explain').status, 1, 'no argument is an error');
  } finally {
    cleanup(dir);
  }
});

for (const drift of [false, true]) {
  test(`coverage: every check finding carries a rule code (drift=${drift})`, () => {
    const dir = scaffold({ drift });
    try {
      const r = run(dir, 'check', '--json');
      const report = JSON.parse(r.stdout);
      assert.ok(report.findings.length > 0, 'the run produced findings');
      const orphan = report.findings.filter((f) => !f.rule);
      assert.deepEqual(
        orphan.map((f) => f.id),
        [],
        'these finding ids map to no rule — add them to src/rules.ts'
      );
      assert.ok(
        report.findings.every((f) => /^CASP-[A-Z]+-\d{3}$/.test(f.rule)),
        'every rule code follows the CASP-AREA-NNN shape'
      );
    } finally {
      cleanup(dir);
    }
  });
}
