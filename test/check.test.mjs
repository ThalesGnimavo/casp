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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
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
    writeFileSync(p, prompt('[session-logs/part-a.md, session-logs/part-b.md]'));
    r = runCheckJson(dir);
    assert.equal(r.status, 0, 'YAML-array form is equivalent to the comma form');
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

test('security: a shell-metachar last_commit runs no shell (injection blocked)', () => {
  const { dir, state } = scaffold();
  try {
    // Old shell-based git() would run `touch INJECTED` here. gitArgs() passes
    // the value as one argv slot: git sees an invalid ref, we FAIL, no shell.
    const sentinel = join(dir, 'INJECTED');
    state.last_commit = 'HEAD; touch INJECTED';
    writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'malicious last_commit');

    const status = runCheck(dir);
    assert.equal(existsSync(sentinel), false, 'no shell command may execute from state content');
    assert.equal(status, 1, 'an unresolvable last_commit is drift → exit 1');
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

test('migrations_dir set + files on disk + migrations_applied absent → WARN, not blocking', () => {
  const { dir, state } = scaffold();
  try {
    // Reconfigure: real migrations dir with a file, but state never declares
    // migrations_applied. This is the silent gap the WARN closes.
    delete state.migrations_applied;
    state.migrations_dir = 'migrations';
    mkdirSync(join(dir, 'migrations'), { recursive: true });
    writeFileSync(join(dir, 'migrations', '0001_init.sql'), 'CREATE TABLE t (id int);\n');
    writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'add untracked migrations dir');

    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 0, 'a WARN must not block the push');
    const report = JSON.parse(stdout);
    const f = report.findings.find((x) => x.id === 'migrations.untracked');
    assert.ok(f, 'expected a migrations.untracked finding');
    assert.equal(f.severity, 'warn', 'untracked migrations is a WARN, never a FAIL');
    assert.ok(f.label.includes('1 migration file'), 'the WARN counts the on-disk files');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migrations_dir set but directory genuinely empty + migrations_applied absent → silent (no WARN)', () => {
  const { dir, state } = scaffold();
  try {
    delete state.migrations_applied;
    state.migrations_dir = 'migrations';
    mkdirSync(join(dir, 'migrations'), { recursive: true }); // empty dir, no files
    writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'add empty migrations dir');

    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 0);
    const report = JSON.parse(stdout);
    assert.ok(!report.findings.some((x) => x.id === 'migrations.untracked'),
      'a fresh empty migrations dir is legitimate — no noise');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/*
 * CASP-SESSION-003 — phases_shipped ↔ session logs.
 *
 * The mapping is DECLARED (`phase:` in a log's frontmatter), never inferred from
 * filenames, and adoption is DERIVED from the data: the first shipped entry any
 * log declares opens the enforcement window, everything before it is exempt.
 * These tests pin all four regimes — never adopted, adopted and complete,
 * adopted with a gap, and retroactive adoption over pre-CASP history.
 */

// Writes a log file, optionally declaring one or more phases in frontmatter.
function writeLog(dir, id, phase) {
  const fm =
    phase === undefined
      ? ''
      : `---\nphase: ${Array.isArray(phase) ? `[${phase.join(', ')}]` : phase}\n---\n\n`;
  writeFileSync(join(dir, 'session-logs', `${id}.md`), `${fm}# ${id} — log\n`);
}

// phases_shipped needs its history dirs to exist; scaffold() already makes both.
function shipPhases(dir, state, phases) {
  state.phases_shipped = phases;
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
}

test('no log declares a phase → category is silent (never-adopted repo, no noise)', () => {
  const { dir, state } = scaffold();
  try {
    shipPhases(dir, state, ['phase-a', 'phase-b']);
    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 0, 'not adopting the convention must not block the push');
    const report = JSON.parse(stdout);
    assert.ok(
      !report.findings.some((x) => x.id.startsWith('shipped_log.')),
      'a repo that never declares a phase gets no finding at all'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every shipped phase declared → PASS, exit 0', () => {
  const { dir, state } = scaffold();
  try {
    writeLog(dir, '26-01-02-001-a', 'phase-a');
    writeLog(dir, '26-01-03-001-b', 'phase-b');
    shipPhases(dir, state, ['phase-a', 'phase-b']);

    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 0);
    const f = JSON.parse(stdout).findings.find((x) => x.id === 'shipped_log.declared');
    assert.ok(f, 'expected a shipped_log.declared finding');
    assert.equal(f.severity, 'pass');
    assert.ok(f.detail.includes('all 2'), `expected the full-window wording, got: ${f.detail}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('shipped phase with no log → FAIL, exit 1 (the scoreboard outruns the record)', () => {
  const { dir, state } = scaffold();
  try {
    writeLog(dir, '26-01-02-001-a', 'phase-a');
    // phase-b is claimed shipped but no log declares it.
    shipPhases(dir, state, ['phase-a', 'phase-b']);

    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 1, 'an undeclared shipped phase must block the push');
    const f = JSON.parse(stdout).findings.find((x) => x.id === 'shipped_log.declared');
    assert.ok(f, 'expected a shipped_log.declared finding');
    assert.equal(f.severity, 'fail');
    assert.ok(f.detail.includes('phase-b'), 'the FAIL names the undeclared phase');
    assert.ok(!f.detail.includes('phase-a'), 'a declared phase is never named as missing');
    assert.ok(f.fix, 'a FAIL carries a → fix hint');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('retroactive adoption → pre-adoption phases exempt, window starts at the first declared', () => {
  const { dir, state } = scaffold();
  try {
    // Two phases predate CASP (no logs were ever written for them); the repo
    // adopts at phase-c and declares every entry from there on.
    writeLog(dir, '26-01-04-001-c', 'phase-c');
    writeLog(dir, '26-01-05-001-d', 'phase-d');
    shipPhases(dir, state, ['old-1', 'old-2', 'phase-c', 'phase-d']);

    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 0, 'history a repo never logged must not block it forever');
    const f = JSON.parse(stdout).findings.find((x) => x.id === 'shipped_log.declared');
    assert.equal(f.severity, 'pass');
    assert.ok(
      f.detail.includes('2 pre-adoption entries exempt'),
      `the exemption is stated, never silent — got: ${f.detail}`
    );
    assert.ok(f.detail.includes("since 'phase-c'"), 'the window names where adoption started');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a gap AFTER adoption still fails, even with pre-adoption history exempt', () => {
  const { dir, state } = scaffold();
  try {
    writeLog(dir, '26-01-04-001-c', 'phase-c');
    // phase-d lands after adoption with no log → inside the window.
    shipPhases(dir, state, ['old-1', 'phase-c', 'phase-d']);

    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 1);
    const f = JSON.parse(stdout).findings.find((x) => x.id === 'shipped_log.declared');
    assert.equal(f.severity, 'fail');
    assert.ok(f.detail.includes('phase-d'));
    assert.ok(!f.detail.includes('old-1'), 'pre-adoption history is never retroactively blamed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('one log declaring several phases (list form) satisfies each of them', () => {
  const { dir, state } = scaffold();
  try {
    writeLog(dir, '26-01-06-001-multi', ['phase-a', 'phase-b']);
    shipPhases(dir, state, ['phase-a', 'phase-b']);

    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 0, 'one session may legitimately ship several phases');
    const f = JSON.parse(stdout).findings.find((x) => x.id === 'shipped_log.declared');
    assert.equal(f.severity, 'pass');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('declared phase not in phases_shipped yet (template placeholder) → silent, no slice(-1) bug', () => {
  const { dir, state } = scaffold();
  try {
    // The `casp new log` template ships `phase: <phase-id>`. An unedited log, or
    // a log written before its state bump, declares something phases_shipped
    // does not contain — the window never opens.
    writeLog(dir, '26-01-07-001-fresh', '<phase-id>');
    shipPhases(dir, state, ['phase-a', 'phase-b']);

    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 0, 'an unopened window must not enforce against the last entry');
    assert.ok(
      !JSON.parse(stdout).findings.some((x) => x.id.startsWith('shipped_log.')),
      'no finding until adoption actually anchors in phases_shipped'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('filenames are never consulted — a matching name without `phase:` does not count', () => {
  const { dir, state } = scaffold();
  try {
    writeLog(dir, '26-01-08-001-a', 'phase-a');
    // A log whose slug matches phase-b exactly, but declares nothing. The
    // category refuses the inference on purpose: no fuzzy matching, ever.
    writeLog(dir, '26-01-09-001-phase-b', undefined);
    shipPhases(dir, state, ['phase-a', 'phase-b']);

    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 1, 'a suggestive filename is not a declaration');
    const f = JSON.parse(stdout).findings.find((x) => x.id === 'shipped_log.declared');
    assert.equal(f.severity, 'fail');
    assert.ok(f.detail.includes('phase-b'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a directory named *.md in the logs dir → CASP-IO-001 finding, no EISDIR crash', () => {
  const { dir, state } = scaffold();
  try {
    writeLog(dir, '26-01-02-001-a', 'phase-a');
    // Repo content is untrusted: a directory that ends in .md must not take the
    // whole report down when the category reads frontmatter. Since the hostile-
    // filesystem hardening it is no longer silently skipped either — a document
    // CASP enumerated and could not read is a finding (CASP-IO-001), because a
    // silent skip is how a broken state surface reads as clean.
    mkdirSync(join(dir, 'session-logs', 'not-a-log.md'), { recursive: true });
    shipPhases(dir, state, ['phase-a']);

    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 1, 'an unreadable document in the state surface gates');
    const report = JSON.parse(stdout);
    assert.ok(report.findings.length > 0, 'the report still renders');
    // The rest of the report is intact — the stray entry did not abort the run.
    const f = report.findings.find((x) => x.id === 'shipped_log.declared');
    assert.equal(f.severity, 'pass');
    const io = report.findings.find((x) => x.rule === 'CASP-IO-001');
    assert.ok(io, 'the stray directory is reported');
    assert.equal(io.severity, 'fail');
    assert.match(io.label, /is a directory, not a file \(EISDIR\)/);
    assert.match(io.detail, /not-a-log\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('non-string `phase:` values (number, bool, null, nested) are ignored, never declared', () => {
  const { dir, state } = scaffold();
  try {
    writeFileSync(join(dir, 'session-logs', '26-01-02-001-num.md'), '---\nphase: 42\n---\n\n# n\n');
    writeFileSync(join(dir, 'session-logs', '26-01-02-002-bool.md'), '---\nphase: true\n---\n\n# b\n');
    writeFileSync(join(dir, 'session-logs', '26-01-02-003-null.md'), '---\nphase:\n---\n\n# z\n');
    writeFileSync(join(dir, 'session-logs', '26-01-02-004-map.md'), '---\nphase:\n  id: phase-a\n---\n\n# m\n');
    shipPhases(dir, state, ['phase-a']);

    const { status, stdout } = runCheckJson(dir);
    assert.equal(status, 0, 'garbage frontmatter must not open the window');
    assert.ok(
      !JSON.parse(stdout).findings.some((x) => x.id.startsWith('shipped_log.')),
      'only string / string-list declarations count — nothing was declared here'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
