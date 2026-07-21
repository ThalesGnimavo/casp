/**
 * Hostile filesystem — a gate that crashes is not a verdict.
 *
 * `existsSync` answers "is there a name here", never "can this process open it".
 * Until 0.14.0 a file that existed and could not be READ threw straight out of
 * whichever verb touched it: `check` printed a Node stack trace, `check --json`
 * and `status --json` printed NOTHING at all, and `status --json` returned a
 * non-zero exit from a verb docs/status-json.md documents as never gating. A
 * consumer parsing the documented report got an empty stdout and no way to tell
 * "the cockpit is broken" from "casp is broken".
 *
 * Every test below asserts OBSERVABLE behaviour of the built binary against a
 * deliberately hostile tree: exit codes, stdout that parses, and the absence of
 * a stack trace on stderr.
 *
 * SKIP-IF-ROOT: `chmod 000` does not deny root, so the unreadable-file cases
 * cannot reproduce in a container running as uid 0. They skip cleanly rather
 * than fail confusingly.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const IS_ROOT = process.getuid?.() === 0;
const SKIP_ROOT = IS_ROOT ? 'chmod 000 does not deny root — cannot reproduce EACCES' : false;

const PROMPT = 'docs/plan/sessions/PHASE-1-FIRST-SLICE.md';

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function run(cwd, ...args) {
  const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/**
 * A Node stack trace, as opposed to a one-line diagnostic. Matches all three
 * shapes a real trace can take: a `SomeError: …` header, a `    at fn (file)`
 * frame, and the parenthesis-free ESM form `    at file:///x.js:3:1`.
 */
function hasStackTrace(stderr) {
  return (
    /^\s*\w*Error: /m.test(stderr) ||
    /\n\s+at\s+\S/.test(stderr) ||
    /node:internal/.test(stderr)
  );
}

function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'casp-hostile-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@casp.sh');
  git(dir, 'config', 'user.name', 'casp test');

  mkdirSync(join(dir, 'casp'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'plan', 'sessions'), { recursive: true });
  mkdirSync(join(dir, 'session-logs'), { recursive: true });

  const sessionId = '26-01-01-001-first-slice';
  writeFileSync(join(dir, 'session-logs', `${sessionId}.md`), '# first slice — session log\n');
  writeFileSync(
    join(dir, PROMPT),
    '---\nstatus: queued\nsession_id: pending\nsession_log: pending\n---\n\n# Phase 1 — first slice\n'
  );
  const state = {
    updated_at: '2026-01-01',
    last_session_id: sessionId,
    last_commit: 'pending',
    current_phase: 'phase-1-first-slice',
    next_phase: 'phase-2',
    next_prompt: PROMPT,
    phases_shipped: [],
    phases_queued: ['phase-1-first-slice']
  };
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

/** The scaffold with the next_prompt made unopenable. */
function hostile() {
  const dir = scaffold();
  chmodSync(join(dir, PROMPT), 0o000);
  return dir;
}

function cleanup(dir) {
  try {
    chmodSync(join(dir, PROMPT), 0o644);
  } catch {
    /* already readable, or already gone */
  }
  rmSync(dir, { recursive: true, force: true });
}

/* The five reproduced cases ------------------------------------------------ */

test('unreadable prompt → check FAILs with CASP-IO-001, no stack trace', { skip: SKIP_ROOT }, () => {
  const dir = hostile();
  try {
    const { status, stdout, stderr } = run(dir, 'check');
    assert.equal(status, 1, 'an unverifiable claim gates');
    assert.ok(!hasStackTrace(stderr), `stderr must carry no stack trace, got:\n${stderr}`);
    assert.match(stdout, /CASP-IO-001/);
    // The finding names the path AND the reason — either alone is unactionable.
    assert.match(stdout, /is unreadable \(EACCES\)/);
    assert.match(stdout, /PHASE-1-FIRST-SLICE\.md/);
  } finally {
    cleanup(dir);
  }
});

test('unreadable prompt → check --json still emits a valid v1 report', { skip: SKIP_ROOT }, () => {
  const dir = hostile();
  try {
    const { status, stdout, stderr } = run(dir, 'check', '--json');
    assert.ok(!hasStackTrace(stderr), `stderr must carry no stack trace, got:\n${stderr}`);
    // The whole point: a consumer of the documented contract gets a DOCUMENT.
    const report = JSON.parse(stdout);
    assert.equal(report.schema_version, 1, 'the machine contract is unchanged');
    assert.equal(report.verdict, 'drift');
    assert.equal(report.exit_code, 1);
    assert.equal(status, 1);
    const io = report.findings.find((f) => f.rule === 'CASP-IO-001');
    assert.ok(io, 'the unreadable prompt is carried as a finding');
    assert.equal(io.severity, 'fail');
    assert.match(io.detail, /PHASE-1-FIRST-SLICE\.md/);
  } finally {
    cleanup(dir);
  }
});

test('unreadable prompt → status --json parses and exits 0', { skip: SKIP_ROOT }, () => {
  const dir = hostile();
  try {
    const { status, stdout, stderr } = run(dir, 'status', '--json');
    assert.ok(!hasStackTrace(stderr), `stderr must carry no stack trace, got:\n${stderr}`);
    // docs/status-json.md: "always exits 0" for any valid cockpit, drift included.
    // status reports; it never gates. This is the row that broke the contract.
    assert.equal(status, 0, 'status never gates');
    const report = JSON.parse(stdout);
    assert.equal(report.schema_version, 1);
    assert.equal(report.check.verdict, 'drift', 'the drift is REPORTED, not exited on');
    assert.ok(report.check.fail > 0);
    assert.equal(report.state.next_prompt, PROMPT);
  } finally {
    cleanup(dir);
  }
});

test('unreadable prompt → doctor still exits 0', { skip: SKIP_ROOT }, () => {
  const dir = hostile();
  try {
    const { status, stderr } = run(dir, 'doctor');
    assert.ok(!hasStackTrace(stderr), `stderr must carry no stack trace, got:\n${stderr}`);
    assert.equal(status, 0, 'doctor reports; it never gates');
  } finally {
    cleanup(dir);
  }
});

test('unreadable prompt → next refuses in one line, no stack trace', { skip: SKIP_ROOT }, () => {
  const dir = hostile();
  try {
    const { status, stdout, stderr } = run(dir, 'next');
    assert.equal(status, 1, 'a session must not start on an unreadable prompt');
    assert.ok(!hasStackTrace(stderr), `stderr must carry no stack trace, got:\n${stderr}`);
    assert.equal(stdout, '', 'no prompt body on stdout when the gate refuses');
    assert.match(stderr, /unreadable \(EACCES\)/);
  } finally {
    cleanup(dir);
  }
});

/* Shape errors: a directory where a document is expected (EISDIR) ----------- */

test('a directory named *.md in sessions_dir → finding, not crash', () => {
  const dir = scaffold();
  try {
    mkdirSync(join(dir, 'docs', 'plan', 'sessions', 'PHASE-2-NOT-A-FILE.md'));
    const { status, stdout, stderr } = run(dir, 'check', '--json');
    assert.ok(!hasStackTrace(stderr), `stderr must carry no stack trace, got:\n${stderr}`);
    const report = JSON.parse(stdout);
    assert.equal(status, 1);
    const io = report.findings.find((f) => f.rule === 'CASP-IO-001');
    assert.ok(io, 'the squatting directory is reported');
    assert.match(io.label, /is a directory, not a file \(EISDIR\)/);
    assert.match(io.detail, /PHASE-2-NOT-A-FILE\.md/);
    // The report is COMPLETE, not truncated at the bad entry: the categories
    // after the sessions walk still ran.
    assert.ok(report.findings.some((f) => f.id === 'workdir.clean'));
  } finally {
    cleanup(dir);
  }
});

/* Vanishing files ---------------------------------------------------------- *
 *
 * The genuine TOCTOU — the file is unlinked in the window between `existsSync`
 * and the `open` — is NOT deterministically reproducible from outside the
 * process: winning that race from a test would need a sleep (flaky) or a stub of
 * node:fs inside the spawned CLI (which would stop testing the built binary,
 * the thing every other test here asserts against). Per the prompt's own
 * instruction, this is stated rather than faked.
 *
 * What IS covered deterministically: the race's errno (ENOENT) enters through
 * the same door as every other failure — `readTextFile` in src/shared.ts — and
 * `classifyFsError` maps it to `vanished`, whose handling is exercised by the
 * two cases below. There is no code path where an ENOENT can reach a caller as
 * a throw, because there is no unguarded read left to throw from.
 */

test('an unsearchable sessions directory → finding, not crash', { skip: SKIP_ROOT }, () => {
  const dir = scaffold();
  const sessions = join(dir, 'docs', 'plan', 'sessions');
  try {
    // The directory exists and cannot be listed: every prompt inside it is
    // simultaneously unreadable. The gate must say so once, and still complete.
    chmodSync(sessions, 0o000);
    const { status, stdout, stderr } = run(dir, 'check', '--json');
    assert.ok(!hasStackTrace(stderr), `stderr must carry no stack trace, got:\n${stderr}`);
    const report = JSON.parse(stdout);
    assert.equal(status, 1);
    assert.ok(
      report.findings.some((f) => f.rule === 'CASP-IO-001'),
      'the unlistable directory is reported'
    );
    assert.ok(report.findings.some((f) => f.id === 'workdir.clean'), 'the report is complete');
  } finally {
    try {
      chmodSync(sessions, 0o755);
    } catch {
      /* nothing to restore */
    }
    cleanup(dir);
  }
});

test('a next_prompt whose file is removed → the ordinary missing-file finding, not an IO one', () => {
  const dir = scaffold();
  try {
    // A file that is genuinely gone is NOT an IO failure: `existsSync` answers
    // honestly and CASP-PROMPT-001 already covers it. The hardening must not
    // reclassify ordinary drift.
    rmSync(join(dir, PROMPT));
    const { status, stdout, stderr } = run(dir, 'check', '--json');
    assert.ok(!hasStackTrace(stderr), `stderr must carry no stack trace, got:\n${stderr}`);
    const report = JSON.parse(stdout);
    assert.equal(status, 1);
    assert.ok(
      report.findings.some((f) => f.rule === 'CASP-PROMPT-001' && f.severity === 'fail'),
      'a missing prompt stays CASP-PROMPT-001'
    );
    assert.ok(
      !report.findings.some((f) => (f.rule ?? '').startsWith('CASP-IO-')),
      'a missing file is not an unreadable one'
    );
  } finally {
    cleanup(dir);
  }
});

/* The no-regression guard: a normal repo is untouched ---------------------- */

// NOTE ON SCOPE: this asserts determinism and the ABSENCE of any IO finding on a
// healthy repo — it cannot assert "byte-identical to the previous release",
// because it only has the current build to run. That comparison was made out of
// band at review time (both the human and the --json report diffed against a
// worktree build of the parent commit, on this repository, identical) and cannot
// be pinned here without checking a golden file of another version into the repo.
test('a repo with no hostile input is deterministic and emits no IO finding', () => {
  const dir = scaffold();
  try {
    const a = run(dir, 'check', '--plain');
    const b = run(dir, 'check', '--plain');
    assert.equal(a.status, 0, 'the scaffold is clean');
    assert.equal(a.stdout, b.stdout, 'the human report is deterministic');
    // No CASP-IO-* finding may appear anywhere in a healthy repo: the hardening
    // must be INVISIBLE until something is actually unreadable.
    assert.ok(!a.stdout.includes('CASP-IO-'), 'no IO finding on a healthy repo');
    const report = JSON.parse(run(dir, 'check', '--json').stdout);
    assert.ok(
      !report.findings.some((f) => (f.rule ?? '').startsWith('CASP-IO-')),
      'no IO finding in the JSON report either'
    );
  } finally {
    cleanup(dir);
  }
});

/* A path that would BLOCK, not throw ---------------------------------------- *
 *
 * The regression that matters most in this file. `readFileSync` on a FIFO with
 * no writer does not fail — it blocks in open(2) forever, and no try/catch
 * catches a hang. A gate that never returns is worse than one that crashes: no
 * verdict AND no exit code, so a pre-push hook wedges the terminal and CI runs
 * out to its own timeout. Each assertion below would time out, not fail, if the
 * stat-before-open guard were removed.
 */

test('a FIFO named *.md in sessions_dir → finding, and the gate RETURNS', () => {
  const dir = scaffold();
  try {
    const fifo = join(dir, 'docs', 'plan', 'sessions', 'PIPE.md');
    const mk = spawnSync('mkfifo', [fifo]);
    if (mk.status !== 0) return; // no mkfifo on this platform — nothing to assert
    const { status, stdout, stderr } = run(dir, 'check', '--json');
    assert.ok(!hasStackTrace(stderr), `stderr must carry no stack trace, got:\n${stderr}`);
    const report = JSON.parse(stdout);
    assert.equal(status, 1);
    const io = report.findings.find((f) => f.rule === 'CASP-IO-001');
    assert.ok(io, 'the pipe is reported');
    assert.match(io.label, /is not a regular file/);
    assert.match(io.detail, /PIPE\.md/);
    assert.ok(report.findings.some((f) => f.id === 'workdir.clean'), 'the report is complete');
  } finally {
    cleanup(dir);
  }
});

test('a FIFO named *.md in logs_dir → finding, and the gate RETURNS', () => {
  const dir = scaffold();
  try {
    const fifo = join(dir, 'session-logs', 'PIPE.md');
    const mk = spawnSync('mkfifo', [fifo]);
    if (mk.status !== 0) return;
    // phases_shipped must be non-empty for the logs walk to run at all.
    const statePath = join(dir, 'casp', 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.phases_shipped = ['phase-1-first-slice'];
    writeFileSync(statePath, JSON.stringify(state, null, 2));

    const { status, stdout } = run(dir, 'check', '--json');
    const report = JSON.parse(stdout);
    assert.equal(status, 1);
    const io = report.findings.find((f) => f.rule === 'CASP-IO-001');
    assert.ok(io, 'the pipe is reported');
    assert.match(io.label, /is not a regular file/);
  } finally {
    cleanup(dir);
  }
});

/* One condition, one finding ----------------------------------------------- */

test('an unreadable next_prompt inside sessions_dir is reported ONCE', { skip: SKIP_ROOT }, () => {
  const dir = hostile();
  try {
    const report = JSON.parse(run(dir, 'check', '--json').stdout);
    // next_prompt lives inside sessions_dir, so the file is reached by the
    // next_prompt block AND by the sessions walk. One defect, one finding.
    const io = report.findings.filter((f) => f.rule === 'CASP-IO-001');
    assert.equal(io.length, 1, `expected one IO finding, got ${io.length}`);
    assert.match(io[0].label, /^next_prompt /, 'the more specific label wins');
    // Finding ids must be unique — a consumer keying by id must not lose one.
    const ids = report.findings.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length, 'finding ids are unique');
  } finally {
    cleanup(dir);
  }
});

/* The new codes are catalogued -------------------------------------------- */

test('casp rules lists CASP-IO-001/002 and casp explain resolves each', () => {
  const dir = scaffold();
  try {
    const rules = run(dir, 'rules');
    assert.equal(rules.status, 0);
    assert.match(rules.stdout, /CASP-IO-001/);
    assert.match(rules.stdout, /CASP-IO-002/);
    for (const code of ['CASP-IO-001', 'CASP-IO-002']) {
      const e = run(dir, 'explain', code);
      assert.equal(e.status, 0, `${code} must resolve`);
      assert.match(e.stdout, new RegExp(code));
    }
  } finally {
    cleanup(dir);
  }
});

/* An unreadable cockpit is not a syntax error ------------------------------ */

test('unreadable casp/state.json → CASP-IO-001, not "not valid JSON"', { skip: SKIP_ROOT }, () => {
  const dir = scaffold();
  const statePath = join(dir, 'casp', 'state.json');
  try {
    chmodSync(statePath, 0o000);
    const { status, stdout, stderr } = run(dir, 'check', '--json');
    assert.ok(!hasStackTrace(stderr), `stderr must carry no stack trace, got:\n${stderr}`);
    const report = JSON.parse(stdout);
    assert.equal(status, 1);
    const io = report.findings.find((f) => f.rule === 'CASP-IO-001');
    assert.ok(io, 'the unreadable cockpit is reported as an IO failure');
    assert.match(io.label, /is unreadable \(EACCES\)/);
    assert.ok(
      !report.findings.some((f) => f.label.includes('not valid JSON')),
      'an unopenable file is not a syntax error — the remediation differs'
    );
  } finally {
    try {
      chmodSync(statePath, 0o644);
    } catch {
      /* nothing to restore */
    }
    cleanup(dir);
  }
});
