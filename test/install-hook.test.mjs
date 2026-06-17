/**
 * `casp install-hook` — the verb that turns "run casp check before every push"
 * from discipline into mechanism by writing .git/hooks/pre-push.
 *
 *   install        → an executable, CASP-marked pre-push hook lands in .git/hooks
 *   the hook gates  → run directly, it exits 1 on a drifted repo (push blocked),
 *                     0 on a clean one (push allowed)
 *   safety          → refuses to clobber a foreign hook without --force;
 *                     --remove only removes a hook CASP wrote
 *
 * The "hook blocks a drifted push" test runs the hook SCRIPT directly with a
 * `casp` shim on PATH (the hook's documented fallback), so it exercises the real
 * resolution + the real exit code without a published package on the box.
 *
 * Runs the BUILT binary (dist/cli.js); `pretest` builds first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const MARKER = 'CASP-MANAGED-HOOK';

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}
function head(cwd) {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
}
function run(cwd, ...args) {
  return spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}
function hookPath(dir) {
  return join(dir, '.git', 'hooks', 'pre-push');
}
function writeState(dir, state) {
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2) + '\n');
}

// A committed, clean cockpit: `casp check` exits 0 here. Mirrors check.test's
// scaffold (last_commit bumped to HEAD, left uncommitted — the canonical
// state-bump-in-progress the validator tolerates).
function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'casp-hook-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@casp.sh');
  git(dir, 'config', 'user.name', 'casp test');

  mkdirSync(join(dir, 'casp'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'plan', 'sessions'), { recursive: true });
  mkdirSync(join(dir, 'session-logs'), { recursive: true });

  const sessionId = '26-01-01-001-first-slice';
  writeFileSync(join(dir, 'session-logs', `${sessionId}.md`), '# first slice\n');
  writeFileSync(
    join(dir, 'docs', 'plan', 'sessions', 'PHASE-1-FIRST-SLICE.md'),
    '---\nstatus: queued\nsession_id: pending\nsession_log: pending\n---\n\n# Phase 1\n'
  );
  const state = {
    updated_at: '2026-01-01',
    last_session_id: sessionId,
    last_commit: 'pending',
    current_phase: 'phase-1-first-slice',
    next_phase: 'phase-2',
    next_prompt: 'docs/plan/sessions/PHASE-1-FIRST-SLICE.md',
    phases_shipped: [],
    phases_queued: ['phase-1-first-slice']
  };
  writeState(dir, state);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  state.last_commit = head(dir);
  writeState(dir, state);
  return { dir, state };
}

// A `casp` shim on PATH that forwards to the built CLI — the hook's documented
// fallback when the package is not npx-resolvable. Lets us run the hook script
// end-to-end and observe its real exit code.
function shimPath(dir) {
  const binDir = join(dir, '.shim-bin');
  mkdirSync(binDir, { recursive: true });
  const shim = join(binDir, 'casp');
  writeFileSync(shim, `#!/bin/sh\nexec node ${JSON.stringify(CLI)} "$@"\n`);
  statSync(shim); // exists
  execFileSync('chmod', ['+x', shim]);
  return binDir;
}

function runHook(dir, binDir) {
  return spawnSync(hookPath(dir), [], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` }
  });
}

const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

/* ---- install --------------------------------------------------------- */

test('install-hook: writes an executable, CASP-marked pre-push hook', () => {
  const { dir } = scaffold();
  try {
    const r = run(dir, 'install-hook');
    assert.equal(r.status, 0, r.stderr);
    const p = hookPath(dir);
    assert.ok(existsSync(p), 'pre-push hook must be written');
    const body = readFileSync(p, 'utf8');
    assert.ok(body.includes(MARKER), 'hook must carry the CASP marker');
    assert.match(body, /casp check --quiet/, 'hook must run the quiet gate');
    // owner-executable bit set
    assert.ok(statSync(p).mode & 0o100, 'hook must be executable');
  } finally {
    cleanup(dir);
  }
});

test('install-hook: re-running on our own hook is idempotent (exit 0, still ours)', () => {
  const { dir } = scaffold();
  try {
    assert.equal(run(dir, 'install-hook').status, 0);
    const second = run(dir, 'install-hook');
    assert.equal(second.status, 0, second.stderr);
    assert.ok(readFileSync(hookPath(dir), 'utf8').includes(MARKER));
  } finally {
    cleanup(dir);
  }
});

/* ---- the gate fires -------------------------------------------------- */

test('installed hook blocks a push from a DRIFTED repo (exit 1)', () => {
  const { dir, state } = scaffold();
  try {
    assert.equal(run(dir, 'install-hook').status, 0);
    const binDir = shimPath(dir);
    // sanity: clean repo → hook allows the push
    assert.equal(runHook(dir, binDir).status, 0, 'clean repo must pass the hook');
    // Drift: next_prompt now points at a file that does not exist.
    state.next_prompt = 'docs/plan/sessions/DOES-NOT-EXIST.md';
    writeState(dir, state);
    assert.equal(runHook(dir, binDir).status, 1, 'drift must make the pre-push hook exit 1');
  } finally {
    cleanup(dir);
  }
});

/* ---- safety: foreign hooks ------------------------------------------- */

test('install-hook: refuses to clobber a foreign hook without --force', () => {
  const { dir } = scaffold();
  try {
    mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
    const foreign = '#!/bin/sh\necho "not casp"\nexit 0\n';
    writeFileSync(hookPath(dir), foreign);
    const r = run(dir, 'install-hook');
    assert.equal(r.status, 1, 'a foreign hook must not be overwritten silently');
    assert.equal(readFileSync(hookPath(dir), 'utf8'), foreign, 'foreign hook left untouched');
    // --force overwrites it with ours
    const f = run(dir, 'install-hook', '--force');
    assert.equal(f.status, 0, f.stderr);
    assert.ok(readFileSync(hookPath(dir), 'utf8').includes(MARKER), '--force installs the CASP hook');
  } finally {
    cleanup(dir);
  }
});

/* ---- remove ---------------------------------------------------------- */

test('install-hook --remove: removes our hook, refuses a foreign one', () => {
  const { dir } = scaffold();
  try {
    // nothing to remove yet → exit 0, no error
    assert.equal(run(dir, 'install-hook', '--remove').status, 0);

    // install ours, then remove it
    assert.equal(run(dir, 'install-hook').status, 0);
    assert.ok(existsSync(hookPath(dir)));
    assert.equal(run(dir, 'install-hook', '--remove').status, 0);
    assert.ok(!existsSync(hookPath(dir)), 'our hook must be gone after --remove');

    // a foreign hook is refused, left in place
    const foreign = '#!/bin/sh\nexit 0\n';
    writeFileSync(hookPath(dir), foreign);
    const r = run(dir, 'install-hook', '--remove');
    assert.equal(r.status, 1, '--remove must refuse a non-CASP hook');
    assert.equal(readFileSync(hookPath(dir), 'utf8'), foreign, 'foreign hook left in place');
  } finally {
    cleanup(dir);
  }
});

/* ---- core.hooksPath: the DO-NOT boundary ----------------------------- */

test('install-hook: refuses when core.hooksPath is set (never touches git config)', () => {
  const { dir } = scaffold();
  try {
    git(dir, 'config', 'core.hooksPath', '.githooks');
    const r = run(dir, 'install-hook');
    assert.equal(r.status, 1, 'a configured core.hooksPath must make install-hook refuse');
    assert.match(r.stderr, /core\.hooksPath/);
    assert.ok(!existsSync(hookPath(dir)), 'must not write a silently-dead .git/hooks/pre-push');
    // and it must NOT have rewritten the config
    assert.equal(
      execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' }).trim(),
      '.githooks',
      'install-hook must never modify core.hooksPath'
    );
  } finally {
    cleanup(dir);
  }
});

/* ---- worktree: .git-as-a-file resolution ----------------------------- */

test('install-hook: resolves the common hooks dir from inside a linked worktree', () => {
  const { dir } = scaffold();
  let wt;
  try {
    wt = join(dir, '..', `wt-${head(dir)}`);
    git(dir, 'worktree', 'add', '-q', wt, 'HEAD');
    const r = run(wt, 'install-hook');
    assert.equal(r.status, 0, r.stderr);
    // hooks are shared from the MAIN repo's common dir, not the worktree's .git file
    const p = hookPath(dir);
    assert.ok(existsSync(p), 'worktree install must write to the common .git/hooks/pre-push');
    assert.ok(readFileSync(p, 'utf8').includes(MARKER));
  } finally {
    if (wt) git(dir, 'worktree', 'remove', '--force', wt);
    cleanup(dir);
  }
});

/* ---- not a git repo -------------------------------------------------- */

test('install-hook: outside a git repo → exit 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'casp-nogit-'));
  try {
    const r = run(dir, 'install-hook');
    assert.equal(r.status, 1, 'no repo → no hook, exit 1');
    assert.match(r.stderr, /not a git repository/);
  } finally {
    cleanup(dir);
  }
});
