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

/*
 * False-green regression guards — a check that cannot find what it needs must
 * never report green. A state CLAIM (real session id, non-empty migrations,
 * shipped phases) whose backing dir is missing is a FAIL; a fresh-init
 * placeholder is not a claim and must not FAIL.
 */

test('claimed last_session_id + missing session-logs/ → exit 1 (no silent green)', () => {
  const { dir } = scaffold();
  try {
    rmSync(join(dir, 'session-logs'), { recursive: true, force: true });
    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 1, 'a claim the validator cannot verify must FAIL');
    const report = JSON.parse(stdout);
    const f = report.findings.find((x) => x.id === 'last_session.logs_dir');
    assert.ok(f && f.severity === 'fail', 'missing logs dir surfaces as its own fail finding');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('claimed migrations_applied + missing migrations dir → exit 1 (the canonical false-green)', () => {
  const { dir, state } = scaffold();
  try {
    state.migrations_applied = ['0001_init', '0002_users'];
    writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 1, 'claimed migrations with no dir to verify against must FAIL');
    const report = JSON.parse(stdout);
    const f = report.findings.find((x) => x.id === 'migrations.dir');
    assert.ok(f && f.severity === 'fail');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('claimed phases_shipped + missing dirs → exit 1', () => {
  const { dir, state } = scaffold();
  try {
    rmSync(join(dir, 'docs'), { recursive: true, force: true });
    rmSync(join(dir, 'session-logs'), { recursive: true, force: true });
    // Park next_prompt and the session id so this test isolates the
    // shipped-history claim from the other dir-backed claims.
    state.next_prompt = null;
    state.next_phase = null;
    state.last_session_id = 'pending';
    state.phases_shipped = ['phase-1-first-slice'];
    writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 1);
    const report = JSON.parse(stdout);
    assert.ok(report.findings.some((x) => x.id === 'shipped_history.sessions_dir' && x.severity === 'fail'));
    assert.ok(report.findings.some((x) => x.id === 'shipped_history.logs_dir' && x.severity === 'fail'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fresh parked state (placeholders, no claims, no dirs) → exit 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'casp-test-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@casp.sh');
    git(dir, 'config', 'user.name', 'casp test');
    mkdirSync(join(dir, 'casp'), { recursive: true });
    const state = {
      updated_at: '2026-01-01',
      last_session_id: 'pending',
      last_commit: 'pending',
      current_phase: 'phase-0-init',
      next_phase: null,
      next_prompt: null,
      phases_shipped: [],
      phases_queued: [],
      migrations_applied: [],
      migrations_dir: 'drizzle'
    };
    writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'init');
    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 0, 'placeholders are not claims — a fresh parked cockpit is clean');
    const report = JSON.parse(stdout);
    assert.equal(report.summary.fail, 0);
    const pendingSession = report.findings.find((x) => x.id === 'last_session.log_exists');
    assert.equal(pendingSession.severity, 'warn', "pending last_session_id is a WARN, not a FAIL");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("empty-string last_session_id → exit 1 (neither an id nor the 'pending' placeholder)", () => {
  const { dir, state } = scaffold();
  try {
    state.last_session_id = '';
    writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 1, 'an empty id must FAIL, not silently skip the check');
    const report = JSON.parse(stdout);
    assert.ok(report.findings.some((x) => x.id === 'last_session.id_empty' && x.severity === 'fail'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migrations_dir path is a FILE → graceful FAIL, valid JSON, no crash', () => {
  const { dir, state } = scaffold();
  try {
    state.migrations_applied = ['0001_init'];
    writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
    writeFileSync(join(dir, 'drizzle'), 'not a directory\n');
    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 1);
    const report = JSON.parse(stdout, undefined);
    assert.ok(report.findings.some((x) => x.id === 'migrations.dir' && x.severity === 'fail'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('docs/plan/sessions path is a FILE → graceful report, no readdirSync crash', () => {
  const { dir, state } = scaffold();
  try {
    rmSync(join(dir, 'docs'), { recursive: true, force: true });
    mkdirSync(join(dir, 'docs', 'plan'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'plan', 'sessions'), 'not a directory\n');
    // Park next_prompt so the missing prompt file doesn't dominate the test.
    state.next_prompt = null;
    state.next_phase = null;
    state.phases_shipped = ['phase-1-first-slice'];
    writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 1, 'shipped-history claim against a file-squatted path must FAIL');
    const report = JSON.parse(stdout);
    assert.ok(report.findings.some((x) => x.id === 'shipped_history.sessions_dir' && x.severity === 'fail'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/*
 * State-bump recognition — the canonical close loop (commit session → bump
 * last_commit → commit the bump) must read as PASS, not a permanent WARN.
 */

test('state-bump commit (parent of HEAD, state-surface only) → last_commit PASS, exit 0', () => {
  const { dir } = scaffold();
  try {
    // scaffold() left state.last_commit = SHA of the init commit, with the
    // bumped state.json uncommitted. Commit that bump: HEAD moves one past
    // last_commit, touching only casp/state.json.
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'chore(casp): bump state');
    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 0);
    const report = JSON.parse(stdout);
    const f = report.findings.find((x) => x.id === 'last_commit.git');
    assert.equal(f.severity, 'pass', 'a state-bump commit is the canonical loop, not drift');
    assert.match(f.label, /parent of HEAD/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('non-bump commit past last_commit (source files touched) → still WARN', () => {
  const { dir } = scaffold();
  try {
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'chore(casp): bump state');
    // A second commit touching real source: last_commit is now two behind and
    // the latest commit is not a state bump — must stay WARN.
    writeFileSync(join(dir, 'app.js'), 'console.log("hi")\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'feat: app');
    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 0, 'WARN does not block');
    const report = JSON.parse(stdout);
    const f = report.findings.find((x) => x.id === 'last_commit.git');
    assert.equal(f.severity, 'warn');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/*
 * Field-test fixes (0.3.1) — found by running 0.3.0 against a production
 * Alembic repo: migrations are not always .sql, and a phase shipped across
 * several sessions lists its logs comma-separated.
 */

test('alembic .py migrations match state (dunder files ignored)', () => {
  const { dir, state } = scaffold();
  try {
    mkdirSync(join(dir, 'backend', 'alembic', 'versions', '__pycache__'), { recursive: true });
    writeFileSync(join(dir, 'backend', 'alembic', 'versions', '1f106a2_module_vehicules.py'), '# rev\n');
    writeFileSync(join(dir, 'backend', 'alembic', 'versions', '__init__.py'), '');
    state.migrations_dir = 'backend/alembic/versions';
    state.migrations_applied = ['1f106a2_module_vehicules'];
    writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 0, 'a matching alembic dir must not FAIL');
    const report = JSON.parse(stdout);
    const f = report.findings.find((x) => x.id === 'migrations.match');
    assert.equal(f.severity, 'pass');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('comma-separated session_log: all entries exist → pass, one missing → FAIL', () => {
  const { dir } = scaffold();
  try {
    writeFileSync(join(dir, 'session-logs', 'part-a.md'), '# a\n');
    writeFileSync(join(dir, 'session-logs', 'part-b.md'), '# b\n');
    const prompt = (logs) =>
      `---\nstatus: shipped\nsession_id: 26-01-01-001-first-slice\nsession_log: ${logs}\n---\n\n# Multi-session phase\n`;
    const p = join(dir, 'docs', 'plan', 'sessions', 'PHASE-MULTI.md');
    writeFileSync(p, prompt('session-logs/part-a.md, session-logs/part-b.md'));
    let r = runCheckJson(dir);
    assert.equal(r.status, 0, 'all listed logs exist — no FAIL');
    writeFileSync(p, prompt('session-logs/part-a.md, session-logs/part-MISSING.md'));
    r = runCheckJson(dir);
    assert.equal(r.status, 1, 'one missing entry in the list must FAIL');
    const report = JSON.parse(r.stdout);
    const f = report.findings.find((x) => x.id.endsWith('session_log_exists') && x.severity === 'fail');
    assert.ok(f && f.detail.includes('part-MISSING.md') && !f.detail.includes('part-a.md'),
      'the FAIL names only the missing entries');
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
