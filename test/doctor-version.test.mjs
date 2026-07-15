/**
 * `casp doctor`, `casp version`, and the additive check-json expected/actual.
 *
 *   doctor  — environment diagnostic; PASS/WARN/FAIL per line but NEVER gates
 *             (exit 0 always, even on a FAIL — check is the only gate).
 *   version — plain form == `casp -V`; --json emits the machine handoff
 *             { name, version, node, schema_version }.
 *   check --json expected/actual — additive structured diff on the findings
 *             where a single expected-vs-actual pair is natural; schema stays v1.
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

/** A committed, clean cockpit. `extraState` overrides top-level keys. */
function scaffold(extraState = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'casp-doctor-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@casp.sh');
  git(dir, 'config', 'user.name', 'casp test');

  mkdirSync(join(dir, 'casp'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'plan', 'sessions'), { recursive: true });
  mkdirSync(join(dir, 'session-logs'), { recursive: true });

  const sessionId = '26-01-01-001-slice';
  writeFileSync(join(dir, 'session-logs', `${sessionId}.md`), '# slice\n');
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
    next_prompt: 'docs/plan/sessions/PHASE-2.md',
    phases_shipped: ['phase-0'],
    phases_queued: ['phase-2'],
    ...extraState
  };
  writeState(dir, state);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  state.last_commit = head(dir);
  writeState(dir, state);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'state bump');
  return { dir, sessionId };
}

const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

/* ---- doctor ----------------------------------------------------------- */

test('doctor: healthy cockpit → PASS lines, exit 0', () => {
  const { dir } = scaffold();
  try {
    const r = run(dir, 'doctor', '--plain');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /casp:doctor/);
    assert.match(r.stdout, /PASS  Node/);
    assert.match(r.stdout, /PASS  git version/);
    assert.match(r.stdout, /inside a git repository/);
    assert.match(r.stdout, /casp\/state\.json present and valid JSON/);
  } finally {
    cleanup(dir);
  }
});

test('doctor: missing casp/state.json → FAIL line but STILL exit 0 (never gates)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'casp-doctor-nostate-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@casp.sh');
    git(dir, 'config', 'user.name', 'casp test');
    const r = run(dir, 'doctor', '--plain');
    assert.equal(r.status, 0, 'doctor must never gate — exit 0 even with a FAIL');
    assert.match(r.stdout, /FAIL  no casp\/state\.json found/);
    assert.match(r.stdout, /doctor never blocks/);
  } finally {
    cleanup(dir);
  }
});

test('doctor: invalid state.json → state.valid FAIL, exit 0', () => {
  const { dir } = scaffold();
  try {
    writeFileSync(join(dir, 'casp', 'state.json'), '{ not: valid json, }');
    const r = run(dir, 'doctor', '--json');
    assert.equal(r.status, 0);
    const j = JSON.parse(r.stdout);
    const f = j.checks.find((k) => k.id === 'state.valid');
    assert.ok(f && f.severity === 'fail', 'invalid JSON surfaces as a state.valid FAIL');
  } finally {
    cleanup(dir);
  }
});

test('doctor --json: stable envelope (schema_version, node, summary, checks), exit 0', () => {
  const { dir } = scaffold();
  try {
    const r = run(dir, 'doctor', '--json');
    assert.equal(r.status, 0);
    const j = JSON.parse(r.stdout);
    assert.equal(j.schema_version, 1);
    assert.equal(typeof j.casp_version, 'string');
    assert.equal(j.node, process.version);
    assert.equal(typeof j.summary.pass, 'number');
    assert.ok(Array.isArray(j.checks) && j.checks.length > 0);
    assert.ok(j.checks.every((k) => k.id && k.severity && typeof k.label === 'string'));
    // summary tallies match the checks array.
    const count = (s) => j.checks.filter((k) => k.severity === s).length;
    assert.equal(j.summary.pass, count('pass'));
    assert.equal(j.summary.warn, count('warn'));
    assert.equal(j.summary.fail, count('fail'));
  } finally {
    cleanup(dir);
  }
});

test('doctor: no pre-push hook → WARN; after install-hook → PASS', () => {
  const { dir } = scaffold();
  try {
    let j = JSON.parse(run(dir, 'doctor', '--json').stdout);
    let hook = j.checks.find((k) => k.id === 'hook.pre_push');
    assert.ok(hook && hook.severity === 'warn', 'no hook yet → WARN');

    assert.equal(run(dir, 'install-hook').status, 0);
    j = JSON.parse(run(dir, 'doctor', '--json').stdout);
    hook = j.checks.find((k) => k.id === 'hook.pre_push');
    assert.ok(hook && hook.severity === 'pass', 'installed CASP hook → PASS');
    assert.match(hook.label, /pre-push gate installed/);
  } finally {
    cleanup(dir);
  }
});

test('doctor: a directory-named pre-push hook still exits 0 (never crashes)', () => {
  // Locks the "doctor always exits 0" invariant against a filesystem throw:
  // isCaspHook would readFileSync a directory (EISDIR). doctor must swallow it.
  const { dir } = scaffold();
  try {
    mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
    mkdirSync(join(dir, '.git', 'hooks', 'pre-push'), { recursive: true });
    const r = run(dir, 'doctor', '--json');
    assert.equal(r.status, 0, 'a pathological hook path must not crash doctor');
    const j = JSON.parse(r.stdout);
    const hook = j.checks.find((k) => k.id === 'hook.pre_push');
    assert.ok(hook, 'the hook check still runs');
    assert.notEqual(hook.severity, 'pass', 'a directory is not a CASP hook');
  } finally {
    cleanup(dir);
  }
});

test('doctor outside a git repo → git.repo WARN, still exit 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'casp-doctor-nogit-'));
  try {
    const r = run(dir, 'doctor', '--json');
    assert.equal(r.status, 0);
    const j = JSON.parse(r.stdout);
    const repo = j.checks.find((k) => k.id === 'git.repo');
    assert.ok(repo && repo.severity === 'warn', 'not-a-repo is a WARN, not a hard gate');
  } finally {
    cleanup(dir);
  }
});

/* ---- version ---------------------------------------------------------- */

test('casp version: plain form prints the version, identical to -V, exit 0', () => {
  const { dir } = scaffold();
  try {
    const v = run(dir, 'version');
    assert.equal(v.status, 0);
    assert.match(v.stdout.trim(), /^\d+\.\d+\.\d+$/);
    assert.equal(v.stdout, run(dir, '-V').stdout, 'casp version == casp -V');
    assert.equal(v.stdout, run(dir, '--version').stdout, 'casp version == casp --version');
  } finally {
    cleanup(dir);
  }
});

test('casp version --json: { name, version, node, schema_version }, exit 0', () => {
  const { dir } = scaffold();
  try {
    const r = run(dir, 'version', '--json');
    assert.equal(r.status, 0);
    const j = JSON.parse(r.stdout);
    assert.equal(j.name, '@justethales/casp');
    assert.match(j.version, /^\d+\.\d+\.\d+$/);
    assert.equal(j.node, process.version);
    // schema_version is the check --json report schema version.
    const check = JSON.parse(run(dir, 'check', '--json').stdout);
    assert.equal(j.schema_version, check.schema_version, 'version.schema_version == check --json schema_version');
  } finally {
    cleanup(dir);
  }
});

/* ---- check --json: additive expected / actual ------------------------- */

test('check --json: every finding carries expected + actual keys (null by default)', () => {
  const { dir } = scaffold();
  try {
    const j = JSON.parse(run(dir, 'check', '--json').stdout);
    assert.ok(j.findings.length > 0);
    assert.ok(
      j.findings.every((f) => 'expected' in f && 'actual' in f),
      'both additive keys are present on every finding'
    );
    // schema stays v1 — the fields are additive, not a breaking change.
    assert.equal(j.schema_version, 1);
  } finally {
    cleanup(dir);
  }
});

test('check --json: next_prompt shipped → expected "queued", actual "shipped"', () => {
  const { dir } = scaffold();
  try {
    // Flip the next_prompt to a shipped status — the canonical drift.
    writeFileSync(
      join(dir, 'docs', 'plan', 'sessions', 'PHASE-2.md'),
      '---\nstatus: shipped\nsession_id: 26-01-01-001-slice\nsession_log: session-logs/26-01-01-001-slice.md\n---\n\n# Phase 2\n'
    );
    const r = run(dir, 'check', '--json');
    assert.equal(r.status, 1, 'a shipped next_prompt is drift');
    const j = JSON.parse(r.stdout);
    const f = j.findings.find((x) => x.id === 'next_prompt.status');
    assert.ok(f && f.severity === 'fail');
    assert.equal(f.expected, 'queued');
    assert.equal(f.actual, 'shipped');
  } finally {
    cleanup(dir);
  }
});

test('check --json: unresolvable last_commit → expected HEAD, actual the bad sha', () => {
  const { dir } = scaffold();
  try {
    const state = JSON.parse(
      execFileSync('git', ['show', 'HEAD:casp/state.json'], { cwd: dir, encoding: 'utf8' })
    );
    state.last_commit = 'deadbeef';
    writeState(dir, state);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'break last_commit');
    const h = head(dir);
    const r = run(dir, 'check', '--json');
    assert.equal(r.status, 1);
    const j = JSON.parse(r.stdout);
    const f = j.findings.find((x) => x.id === 'last_commit.git');
    assert.ok(f && f.severity === 'fail', 'a sha absent from history is a FAIL');
    assert.equal(f.expected, h, 'expected is HEAD');
    assert.equal(f.actual, 'deadbeef', 'actual is the recorded sha');
  } finally {
    cleanup(dir);
  }
});

test('check --json: a passing finding leaves expected/actual null', () => {
  const { dir } = scaffold();
  try {
    const j = JSON.parse(run(dir, 'check', '--json').stdout);
    const pass = j.findings.find((f) => f.severity === 'pass');
    assert.ok(pass, 'there is at least one PASS');
    assert.equal(pass.expected, null);
    assert.equal(pass.actual, null);
  } finally {
    cleanup(dir);
  }
});
