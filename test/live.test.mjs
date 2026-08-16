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

/** Reserved enforcement demands rows backed by a LIVE process (see
 *  reservedEnforced). Declaring a row under this env makes it PID-backed and
 *  provably alive — the test runner is the process. Hooks are still spawned
 *  WITHOUT CLAUDE_PID, so ownership is decided by session id alone and the
 *  same-process fallback stays out of the way. */
const LIVE = { CLAUDE_PID: String(process.pid) };

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

test('three states: reserved is dormant solo, enforced in a fleet, controller exempt', () => {
  const dir = freshRepo();
  try {
    // Controller declared, NO worker lane: dormancy — anyone edits casp/.
    assert.equal(
      run(dir, ['live', 'controller', '--label', 'cto', '--session', 'cto-1'], { env: LIVE }).status,
      0
    );
    const solo = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'cto-1', 'casp/state.json') });
    assert.equal(solo.status, 0, 'controller solo edits its own cockpit');
    const soloOther = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'session-B', 'casp/state.json') });
    assert.equal(soloOther.status, 0, 'no lane live -> reserved stays dormant for everyone');

    // A worker claims a lane: the fleet is flying, reserved arms.
    assert.equal(
      run(dir, ['live', 'claim', 'frontend/src', '--session', 'worker-front'], { env: LIVE }).status,
      0
    );
    const worker = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'worker-front', 'casp/state.json') });
    assert.equal(worker.status, 2, 'worker blocked on cockpit while fleet active');
    assert.match(worker.stderr, /RESERVED shared state/);

    // Basename rule: a lockfile deep in the worker's OWN lane is still reserved.
    const lock = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'worker-front', 'frontend/src/package-lock.json') });
    assert.equal(lock.status, 2);

    // …but `casp/` and `session-logs/` are PREFIX entries, not basenames: a
    // compiled binary called `casp` and a nested cockpit are the worker's own
    // business. Reserving them would be a guard blocking on a name collision.
    for (const p of ['bin/casp', 'packages/a/casp/state.json', 'src/session-logs/x.ts']) {
      assert.equal(
        run(dir, ['live', 'hook'], { input: preToolUse(dir, 'worker-front', p) }).status,
        0,
        `${p} must not be reserved by a basename collision`
      );
    }

    // The controller itself writes reserved paths freely.
    const cto = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'cto-1', 'casp/state.json') });
    assert.equal(cto.status, 0);

    // Free paths stay free for everyone.
    const free = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'worker-front', 'backend/readme.txt') });
    assert.equal(free.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reserved list is configurable via casp/live.config.json (full replace)', () => {
  const dir = freshRepo();
  try {
    writeFileSync(join(dir, 'casp', 'live.config.json'), JSON.stringify({ reserved: ['shared-types'] }));
    assert.equal(run(dir, ['live', 'controller', '--session', 'cto-1'], { env: LIVE }).status, 0);
    assert.equal(run(dir, ['live', 'claim', 'src', '--session', 'worker-A'], { env: LIVE }).status, 0);
    // Default entry no longer reserved under an override…
    const cockpit = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'worker-A', 'casp/state.json') });
    assert.equal(cockpit.status, 0);
    // …the overridden entry is.
    const types = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'worker-A', 'shared-types/api.ts') });
    assert.equal(types.status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('controller row obeys TTL/liveness pruning and single-holder rule', () => {
  const dir = freshRepo();
  try {
    assert.equal(run(dir, ['live', 'controller', '--session', 'cto-1']).status, 0);
    // A second session cannot take the hat while it is held…
    assert.equal(run(dir, ['live', 'controller', '--session', 'cto-2']).status, 1);
    // …but a dead-PID controller is pruned on read, freeing the hat and
    // disarming reserved (fail-open, same rule as claims).
    const raw = JSON.parse(readFileSync(join(dir, 'casp', 'live', 'claims.json'), 'utf8'));
    raw.controller.pid = 2 ** 30;
    writeFileSync(join(dir, 'casp', 'live', 'claims.json'), JSON.stringify(raw));
    assert.equal(run(dir, ['live', 'claim', 'src', '--session', 'worker-A']).status, 0);
    const hook = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'worker-A', 'casp/state.json') });
    assert.equal(hook.status, 0, 'dead controller never blocks anyone');
    assert.equal(run(dir, ['live', 'controller', '--session', 'cto-2']).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a v1 claims file (no controller key) is read cleanly', () => {
  const dir = freshRepo();
  try {
    mkdirSync(join(dir, 'casp', 'live'), { recursive: true });
    writeFileSync(
      join(dir, 'casp', 'live', 'claims.json'),
      JSON.stringify({ version: 1, claims: [] })
    );
    const list = run(dir, ['live', 'claims', '--json']);
    const parsed = JSON.parse(list.stdout);
    assert.equal(parsed.version, 2);
    assert.equal(parsed.controller, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Regressions from the 0.15.0 pre-release adversarial pass
// ---------------------------------------------------------------------------

test('an unparseable or foreign-format expires_at reads as EXPIRED, never immortal', () => {
  const dir = freshRepo();
  try {
    mkdirSync(join(dir, 'casp', 'live'), { recursive: true });
    // Every one of these sorts ABOVE a current ISO string, so the string
    // comparison this replaced treated them as valid forever — a permanent
    // block on a repo, from a corrupt file, under a contract that forbids it.
    // An offset-form timestamp two hours in the PAST, spelled so it sorts
    // ABOVE the current UTC string: "…T17:00:00+14:00" vs "…T05:00:00.000Z".
    // The string comparison read it as valid; Date.parse reads the instant.
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000);
    const shifted = new Date(twoHoursAgo.getTime() + 14 * 3600_000)
      .toISOString()
      .replace(/\.\d+Z$/, '+14:00');
    for (const expires of ['not-a-date', 'zzz', '', shifted]) {
      writeFileSync(
        join(dir, 'casp', 'live', 'claims.json'),
        JSON.stringify({
          version: 2,
          controller: null,
          claims: [{ path: 'src', owner: 'ghost', label: null, note: null, pid: null, created_at: 'x', expires_at: expires }]
        })
      );
      const r = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'me', 'src/a.ts') });
      assert.equal(r.status, 0, `expires_at ${JSON.stringify(expires)} must not block`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stale PID-less rows never arm reserved paths against a later solo session', () => {
  const dir = freshRepo();
  try {
    mkdirSync(join(dir, 'casp', 'live'), { recursive: true });
    // A controller and a lane left behind by two sessions that are long gone:
    // no PID to probe, hours left on the default TTL. These used to lock the
    // next solo session out of its own casp/state.json until the TTL ran out.
    const far = new Date(Date.now() + 8 * 3600_000).toISOString();
    writeFileSync(
      join(dir, 'casp', 'live', 'claims.json'),
      JSON.stringify({
        version: 2,
        controller: { owner: 'cli:ghost-cto', label: 'cto', pid: null, created_at: far, expires_at: far },
        claims: [{ path: 'src/mobile', owner: 'cli:ghost-worker', label: 'w1', note: null, pid: null, created_at: far, expires_at: far }]
      })
    );
    const solo = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'brand-new-session', 'casp/state.json') });
    assert.equal(solo.status, 0, 'a solo session always writes its own cockpit');
    // The PID-less lane still binds its OWN path — advisory, as claimed.
    const lane = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'brand-new-session', 'src/mobile/a.ts') });
    assert.equal(lane.status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a subagent sharing the harness process is not denied its parent lane', () => {
  const dir = freshRepo();
  try {
    assert.equal(run(dir, ['live', 'claim', 'src', '--session', 'parent'], { env: LIVE }).status, 0);
    // Same CLAUDE_PID, different session_id — what a harness that gives its
    // subagents their own id looks like from inside the hook.
    const child = run(dir, ['live', 'hook'], {
      input: preToolUse(dir, 'subagent-of-parent', 'src/a.ts'),
      env: LIVE
    });
    assert.equal(child.status, 0, 'same harness process = same owner');
    // A genuinely foreign session (no shared pid) is still blocked.
    const other = run(dir, ['live', 'hook'], { input: preToolUse(dir, 'other-session', 'src/a.ts') });
    assert.equal(other.status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the hook never writes claims.json — only mutating commands do', () => {
  const dir = freshRepo();
  try {
    mkdirSync(join(dir, 'casp', 'live'), { recursive: true });
    const past = new Date(Date.now() - 60_000).toISOString();
    const body = JSON.stringify({
      version: 2,
      controller: null,
      claims: [{ path: 'old', owner: 'ghost', label: null, note: null, pid: null, created_at: past, expires_at: past }]
    });
    const file = join(dir, 'casp', 'live', 'claims.json');
    writeFileSync(file, body);
    // An expired row is pruned in memory, so it blocks nothing…
    assert.equal(run(dir, ['live', 'hook'], { input: preToolUse(dir, 'me', 'old/a.ts') }).status, 0);
    // …and the file is untouched: the hottest path in the system is not a
    // writer, so it cannot clobber a claim landing at the same moment.
    assert.equal(readFileSync(file, 'utf8'), body);
    // The next mutating command is what persists the prune.
    run(dir, ['live', 'claim', 'fresh', '--session', 'me']);
    const after = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(after.claims.map((c) => c.path), ['fresh']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('claims announces a standing-down guard and heals a deleted .gitignore', () => {
  const dir = freshRepo();
  try {
    run(dir, ['live', 'claim', 'src', '--session', 'me']);
    rmSync(join(dir, 'casp', 'live', '.gitignore'));
    const off = run(dir, ['live', 'claims'], { env: { CASP_LIVE: '0' } });
    assert.match(off.stdout, /casp live is OFF/);
    assert.equal(existsSync(join(dir, 'casp', 'live', '.gitignore')), true, 'boundary restored');
    const json = JSON.parse(run(dir, ['live', 'claims', '--json'], { env: { CASP_LIVE: '0' } }).stdout);
    assert.equal(json.enforcing, false);
    assert.equal(JSON.parse(run(dir, ['live', 'claims', '--json']).stdout).enforcing, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the journal rolls at its ceiling instead of growing without bound', () => {
  const dir = freshRepo();
  try {
    run(dir, ['live', 'log', 'note', '--msg', 'seed', '--session', 'me']);
    const journal = join(dir, 'casp', 'live', 'journal.jsonl');
    writeFileSync(journal, 'x'.repeat(6 * 1024 * 1024));
    run(dir, ['live', 'log', 'note', '--msg', 'after', '--session', 'me']);
    assert.equal(existsSync(join(dir, 'casp', 'live', 'journal.1.jsonl')), true, 'previous generation kept');
    const now = readFileSync(journal, 'utf8');
    assert.ok(now.length < 1024, 'journal restarted small');
    assert.match(now, /after/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
