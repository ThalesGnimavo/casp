/**
 * `casp live` — claims, journal, guard hook, kill switches.
 *
 * The two contracts under test, in order of importance:
 *
 *   1. FAIL-OPEN. Every degraded state — expired claim, dead holder process,
 *      corrupt claims file, malformed hook stdin, kill switch set — must let
 *      the tool call through (exit 0). The only exit 2 is the one documented
 *      case: an ACTIVE claim held by a LIVING foreign session.
 *   2. The boundary. casp/live/ is self-gitignored runtime state; nothing in
 *      it may ever surface in `git status` or affect `casp check`.
 *
 * Runs the BUILT binary (dist/cli.js); `pretest` builds first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  realpathSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

// A clean env for every spawn: no CLAUDE_* identity bleeding in from the
// harness this test suite happens to run under, no kill switch inherited.
function cleanEnv(extra = {}) {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CLAUDE_PID;
  delete env.CASP_LIVE;
  // Overrides apply AFTER the scrub, so a test can set the very variables the
  // scrub removes (the CASP_LIVE=0 kill-switch test depends on this order).
  return { ...env, ...extra };
}

function run(cwd, args, opts = {}) {
  return spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: cleanEnv(opts.env),
    input: opts.input
  });
}

function freshRepo() {
  // realpath, because macOS tmpdir lives behind /var → /private/var and the
  // child's process.cwd() resolves the symlink: without this, every hook
  // payload path reads as "outside the repo" and fail-open masks the test.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'casp-live-')));
  mkdirSync(join(dir, 'casp'), { recursive: true });
  return dir;
}

function hookPayload(over = {}) {
  return JSON.stringify({
    session_id: 'session-B',
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: join('%ROOT%', 'src', 'app', 'main.ts') },
    ...over
  });
}

/** Build a PreToolUse payload with an absolute path inside `root`. */
function preToolUse(root, sessionId, relPath, tool = 'Edit') {
  return JSON.stringify({
    session_id: sessionId,
    hook_event_name: 'PreToolUse',
    tool_name: tool,
    tool_input: { file_path: join(root, relPath) }
  });
}

test('claim → claims lists it → release empties it', () => {
  const dir = freshRepo();
  try {
    const claim = run(dir, ['live', 'claim', 'src/app', '--label', 'alpha', '--session', 'session-A']);
    assert.equal(claim.status, 0, claim.stderr);
    assert.match(claim.stdout, /claimed src\/app/);

    const list = run(dir, ['live', 'claims', '--json']);
    const parsed = JSON.parse(list.stdout);
    assert.equal(parsed.claims.length, 1);
    assert.equal(parsed.claims[0].path, 'src/app');
    assert.equal(parsed.claims[0].owner, 'session-A');
    assert.equal(parsed.claims[0].label, 'alpha');

    const rel = run(dir, ['live', 'release', 'src/app', '--session', 'session-A']);
    assert.equal(rel.status, 0);
    const after = JSON.parse(run(dir, ['live', 'claims', '--json']).stdout);
    assert.equal(after.claims.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('live dir is self-gitignored on first write', () => {
  const dir = freshRepo();
  try {
    run(dir, ['live', 'claim', 'src', '--session', 'session-A']);
    const ignore = readFileSync(join(dir, 'casp', 'live', '.gitignore'), 'utf8');
    assert.match(ignore, /^\*$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('overlapping foreign claim is refused in both directions', () => {
  const dir = freshRepo();
  try {
    assert.equal(run(dir, ['live', 'claim', 'src/app', '--session', 'session-A']).status, 0);
    // Narrower than the held path.
    const inner = run(dir, ['live', 'claim', 'src/app/deep', '--session', 'session-B']);
    assert.equal(inner.status, 1);
    assert.match(inner.stderr, /held by session-A/);
    // Broader than the held path.
    const outer = run(dir, ['live', 'claim', 'src', '--session', 'session-B']);
    assert.equal(outer.status, 1);
    // Sibling is fine — segment boundary, not string prefix.
    const sibling = run(dir, ['live', 'claim', 'src/apples', '--session', 'session-B']);
    assert.equal(sibling.status, 0, sibling.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('guard blocks a foreign edit (exit 2) and allows the owner (exit 0)', () => {
  const dir = freshRepo();
  try {
    assert.equal(run(dir, ['live', 'claim', 'src/app', '--label', 'alpha', '--session', 'session-A']).status, 0);

    const foreign = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'session-B', 'src/app/main.ts') });
    assert.equal(foreign.status, 2);
    assert.match(foreign.stderr, /claimed by alpha \(session-A\)/);

    const owner = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'session-A', 'src/app/main.ts') });
    assert.equal(owner.status, 0);

    // Uncovered sibling path passes for everyone.
    const sibling = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'session-B', 'src/apples.ts') });
    assert.equal(sibling.status, 0);

    // The denial landed in the journal.
    const journal = readFileSync(join(dir, 'casp', 'live', 'journal.jsonl'), 'utf8');
    assert.match(journal, /"type":"denied"/);
    assert.match(journal, /"denied_owner":"session-A"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('expired claim never blocks — pruned on read', () => {
  const dir = freshRepo();
  try {
    mkdirSync(join(dir, 'casp', 'live'), { recursive: true });
    writeFileSync(
      join(dir, 'casp', 'live', 'claims.json'),
      JSON.stringify({
        version: 1,
        claims: [{
          path: 'src', owner: 'session-A', label: null, note: null, pid: null,
          created_at: '2020-01-01T00:00:00.000Z', expires_at: '2020-01-01T01:00:00.000Z'
        }]
      })
    );
    const hook = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'session-B', 'src/x.ts') });
    assert.equal(hook.status, 0);
    const after = JSON.parse(run(dir, ['live', 'claims', '--json']).stdout);
    assert.equal(after.claims.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('claim whose holder process is dead never blocks', () => {
  const dir = freshRepo();
  try {
    mkdirSync(join(dir, 'casp', 'live'), { recursive: true });
    writeFileSync(
      join(dir, 'casp', 'live', 'claims.json'),
      JSON.stringify({
        version: 1,
        claims: [{
          path: 'src', owner: 'session-A', label: null, note: null,
          // A PID that cannot exist: pid_max default is far below this on
          // macOS (99998) and Linux (4194304 max). ESRCH → holder dead.
          pid: 2 ** 30,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 3_600_000).toISOString()
        }]
      })
    );
    const hook = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'session-B', 'src/x.ts') });
    assert.equal(hook.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('kill switches: CASP_LIVE=0, repo off marker, and off/on verbs', () => {
  const dir = freshRepo();
  try {
    assert.equal(run(dir, ['live', 'claim', 'src', '--session', 'session-A']).status, 0);
    const blocked = () => run(dir, ['live', 'hook'], { input: preToolUse(dir, 'session-B', 'src/x.ts') });

    assert.equal(blocked().status, 2, 'sanity: guard active');

    // Environment switch, checked on every invocation.
    const env = run(dir, ['live', 'hook'], {
      input: preToolUse(dir, 'session-B', 'src/x.ts'),
      env: { CASP_LIVE: '0' }
    });
    assert.equal(env.status, 0);

    // Repo off marker via the verb — then back on.
    assert.equal(run(dir, ['live', 'off']).status, 0);
    assert.ok(existsSync(join(dir, 'casp', 'live', 'off')));
    assert.equal(blocked().status, 0);
    assert.equal(run(dir, ['live', 'on']).status, 0);
    assert.equal(blocked().status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('hook fails open on garbage: bad stdin, corrupt claims, unknown event', () => {
  const dir = freshRepo();
  try {
    assert.equal(run(dir, ['live', 'hook'], { input: 'not json at all' }).status, 0);
    assert.equal(run(dir, ['live', 'hook'], { input: '' }).status, 0);

    mkdirSync(join(dir, 'casp', 'live'), { recursive: true });
    writeFileSync(join(dir, 'casp', 'live', 'claims.json'), '{{{{corrupt');
    assert.equal(
      run(dir, ['live', 'hook'], { input: preToolUse(dir, 'session-B', 'src/x.ts') }).status,
      0
    );

    assert.equal(
      run(dir, ['live', 'hook'], { input: hookPayload({ hook_event_name: 'SomeFutureEvent' }) }).status,
      0
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lifecycle events land in the journal; Bash is not guarded', () => {
  const dir = freshRepo();
  try {
    const mk = (event, tool) =>
      JSON.stringify({
        session_id: 'session-A',
        hook_event_name: event,
        tool_name: tool,
        tool_input: tool ? { file_path: join(dir, 'src', 'y.ts') } : undefined
      });
    run(dir, ['live', 'hook'], { input: mk('SessionStart') });
    run(dir, ['live', 'hook'], { input: mk('PostToolUse', 'Write') });
    run(dir, ['live', 'hook'], { input: mk('Stop') });
    const journal = readFileSync(join(dir, 'casp', 'live', 'journal.jsonl'), 'utf8');
    assert.match(journal, /"type":"session-start"/);
    assert.match(journal, /"type":"edit"/);
    assert.match(journal, /"type":"stop"/);

    // A Bash call on a claimed path is a documented blind spot, never a block.
    assert.equal(run(dir, ['live', 'claim', 'src', '--session', 'session-A']).status, 0);
    const bash = run(dir, ['live', 'hook'], {
      input: JSON.stringify({
        session_id: 'session-B',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: `echo x > ${join(dir, 'src', 'y.ts')}` }
      })
    });
    assert.equal(bash.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('paths outside the repo are not claimable and not policed', () => {
  const dir = freshRepo();
  try {
    assert.equal(run(dir, ['live', 'claim', '../elsewhere']).status, 1);
    assert.equal(run(dir, ['live', 'claim', '.']).status, 1, 'repo root itself is refused');
    const outside = run(dir, ['live', 'hook'], {
      input: JSON.stringify({
        session_id: 'session-B',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: '/etc/hosts' }
      })
    });
    assert.equal(outside.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tail prints recent events; log appends a manual one', () => {
  const dir = freshRepo();
  try {
    run(dir, ['live', 'log', 'shipped', '--msg', 'phase done', '--session', 'session-A']);
    const tail = run(dir, ['live', 'tail', '-n', '5']);
    assert.equal(tail.status, 0);
    assert.match(tail.stdout, /shipped/);
    assert.match(tail.stdout, /phase done/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
