/**
 * Prompt-chain integrity — CASP-PROMPT-007..010.
 *
 * Each test pins a REPRODUCED case, not the abstract rule: a repo that never
 * adopted `next_after`, a coherent chain, a dangling reference, a two-node
 * cycle, a self-reference, a fork, an orphan, an unedited template placeholder,
 * a reference that resolves to a session id rather than a prompt slug, and a
 * shipped prompt whose `next_after` must not be re-litigated.
 *
 * The load-bearing one is the FIRST: a repo that never opted in must stay
 * byte-for-byte as green as it was before this category existed. `next_after`
 * ships as a literal placeholder in the canonical template, so a rule that
 * fired on it would have reddened every cockpit in the wild.
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
function checkJson(cwd) {
  const r = run(cwd, 'check', '--json');
  return { status: r.status, report: JSON.parse(r.stdout) };
}
const codes = (report) => report.findings.filter((f) => f.severity !== 'pass').map((f) => f.rule);
const ids = (report) => report.findings.map((f) => f.id);

const SESSION_ID = '26-01-01-001-head-slice';

/**
 * A minimal, otherwise-clean cockpit. `prompts` is a list of
 * [filename, frontmatterLines] pairs; the first is the head that
 * state.next_prompt points at.
 */
function scaffold(prompts) {
  const dir = mkdtempSync(join(tmpdir(), 'casp-chain-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@casp.sh');
  git(dir, 'config', 'user.name', 'casp test');
  mkdirSync(join(dir, 'casp'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'plan', 'sessions'), { recursive: true });
  mkdirSync(join(dir, 'session-logs'), { recursive: true });
  writeFileSync(join(dir, 'session-logs', `${SESSION_ID}.md`), '# head slice\n');

  for (const [name, fm] of prompts) {
    writeFileSync(
      join(dir, 'docs', 'plan', 'sessions', `${name}.md`),
      `---\n${fm}\n---\n\n# ${name}\n`
    );
  }

  const state = {
    updated_at: '2026-01-01',
    last_session_id: SESSION_ID,
    last_commit: 'pending',
    current_phase: 'head-slice',
    next_phase: 'next-slice',
    next_prompt: `docs/plan/sessions/${prompts[0][0]}.md`,
    phases_shipped: ['head-slice'],
    phases_queued: []
  };
  const writeState = () =>
    writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
  writeState();
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  state.last_commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: dir,
    encoding: 'utf8'
  }).trim();
  writeState();
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'state bump');
  return { dir, state };
}

const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });
const QUEUED = 'status: queued\nsession_id: pending\nsession_log: pending';

/* 1. Never adopted → total silence, and the report is unchanged. ----------- */

test('a repo with no next_after anywhere gets no chain finding at all', () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', QUEUED]
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 0, 'a non-adopting repo must stay green');
    assert.deepEqual(
      ids(report).filter((id) => id.startsWith('prompt_chain.')),
      [],
      'not even a PASS line: the category is silent until the first real declaration'
    );
    assert.equal(report.schema_version, 1, 'the report schema does not bump');
  } finally {
    cleanup(dir);
  }
});

test('an unedited template placeholder is not a declaration', () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: <previous-session-id-or-prompt-slug>`]
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 0);
    assert.deepEqual(
      ids(report).filter((id) => id.startsWith('prompt_chain.')),
      [],
      'the placeholder the template ships must produce nothing'
    );
  } finally {
    cleanup(dir);
  }
});

test('an explicit null / empty next_after is not a declaration', () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: null`],
    ['PHASE-C', `${QUEUED}\nnext_after: ''`]
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 0);
    assert.deepEqual(
      ids(report).filter((id) => id.startsWith('prompt_chain.')),
      []
    );
  } finally {
    cleanup(dir);
  }
});

test('no non-string YAML value is ever treated as a declaration', () => {
  // state.json and frontmatter accept any YAML, and a value that is not a
  // string is not a slice name. Each of these reaching `isDeclaration` would
  // FAIL a repo that never opted in — the one regression this category cannot
  // afford. `~` is YAML's null; the quoted form is whitespace-only.
  const HOSTILE = ['42', '0.5', 'true', 'false', '[a, b]', '{k: v}', '~', '"   "'];
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ...HOSTILE.map((v, i) => [`PHASE-H${i}`, `${QUEUED}\nnext_after: ${v}`])
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 0, 'a hostile frontmatter value must not redden the repo');
    assert.deepEqual(
      ids(report).filter((id) => id.startsWith('prompt_chain.')),
      [],
      'non-string next_after values are not declarations and produce nothing'
    );
  } finally {
    cleanup(dir);
  }
});

test('a state.json that is hostile in shape does not crash the report', () => {
  // Found by adversarial probing of this slice: `next_prompt: 42` reached
  // join() and threw ERR_INVALID_ARG_TYPE, killing the WHOLE report with a raw
  // stack trace — the gate crashed instead of reporting drift. checkOne must
  // never throw: a crashed gate is worse than a red one, because CI reads it as
  // infrastructure failure rather than as drift.
  const { dir, state } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: PHASE-A`]
  ]);
  try {
    state.next_prompt = 42;
    state.phases_shipped = [1, true, null, { a: 2 }, 'head-slice'];
    state.phases_queued = 'not-an-array';
    state.next_phase = { a: 1 };
    writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
    const r = run(dir, 'check', '--json');
    assert.equal(r.stderr, '', 'no stack trace on stderr');
    const report = JSON.parse(r.stdout);
    assert.equal(r.status, 1, 'it reports drift');
    const f = report.findings.find((x) => x.id === 'next_prompt.exists');
    assert.equal(f.severity, 'fail');
    assert.match(f.label, /not a string/);
  } finally {
    cleanup(dir);
  }
});

test('a non-string next_prompt is reported for each container type', () => {
  for (const [value, word] of [
    [42, 'number'],
    [['a'], 'list'],
    [{ a: 1 }, 'object'],
    [true, 'boolean']
  ]) {
    const { dir, state } = scaffold([['PHASE-A', QUEUED]]);
    try {
      state.next_prompt = value;
      writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
      const r = run(dir, 'check', '--json');
      assert.equal(r.stderr, '', `${word}: no stack trace`);
      const f = JSON.parse(r.stdout).findings.find((x) => x.id === 'next_prompt.exists');
      assert.match(f.detail, new RegExp(word), `${word} is named in the detail`);
      assert.equal(f.rule, 'CASP-PROMPT-001');
    } finally {
      cleanup(dir);
    }
  }
});

/* 2. A coherent chain passes, and states what it skipped. ----------------- */

test('a coherent chain PASSes and prints the non-declaring count', () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: PHASE-A`],
    ['PHASE-C', `${QUEUED}\nnext_after: PHASE-B`],
    ['PHASE-PARKED', QUEUED]
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 0);
    const f = report.findings.find((x) => x.id === 'prompt_chain.coherent');
    assert.ok(f, 'a coherent adopted chain reports a PASS');
    assert.equal(f.severity, 'pass');
    assert.equal(f.rule, 'CASP-PROMPT-007');
    assert.match(f.detail, /2 chained prompt\(s\)/);
    // The head and the parked prompt both declare nothing: the head has no
    // predecessor to name, and a parked prompt is opted out by definition.
    assert.match(f.detail, /2 queued prompt\(s\) declare no next_after/, 'skips are never silent');
  } finally {
    cleanup(dir);
  }
});

test('the slug form of a prompt filename resolves (PHASE- prefix, case-folded)', () => {
  const { dir } = scaffold([
    ['PHASE-CHECK-SHIPPED-LOG', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: check-shipped-log`]
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 0, 'an exact match after a documented normalization is not a guess');
    assert.ok(report.findings.some((f) => f.id === 'prompt_chain.coherent'));
  } finally {
    cleanup(dir);
  }
});

test('a next_after resolving to a session id rather than a prompt slug is accepted', () => {
  const { dir } = scaffold([
    ['PHASE-A', `${QUEUED}\nnext_after: ${SESSION_ID}`],
    ['PHASE-B', `${QUEUED}\nnext_after: PHASE-A`]
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 0, 'the CASP-SESSION-001 resolver is reused, not duplicated');
    assert.ok(report.findings.some((f) => f.id === 'prompt_chain.coherent'));
  } finally {
    cleanup(dir);
  }
});

test('a next_after resolving to a phase id declared by state is accepted', () => {
  const { dir } = scaffold([
    ['PHASE-A', `${QUEUED}\nnext_after: head-slice`],
    ['PHASE-B', `${QUEUED}\nnext_after: PHASE-A`]
  ]);
  try {
    const { status } = checkJson(dir);
    assert.equal(status, 0);
  } finally {
    cleanup(dir);
  }
});

/* 3. Dangling — FAIL, exit 1. --------------------------------------------- */

test('a dangling next_after FAILs and exits 1', () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: a-slice-that-never-existed`]
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 1, 'an unexecutable plan blocks the push');
    const f = report.findings.find((x) => x.id.startsWith('prompt_chain.dangling.'));
    assert.ok(f);
    assert.equal(f.severity, 'fail');
    assert.equal(f.rule, 'CASP-PROMPT-007');
    assert.equal(f.actual, 'a-slice-that-never-existed');
  } finally {
    cleanup(dir);
  }
});

test('filenames are never fuzzy-matched — a near miss is dangling, not resolved', () => {
  const { dir } = scaffold([
    ['PHASE-AUTH-GATE', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: auth-gate-2`]
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 1, 'CASP-SESSION-003 refused fuzzy matching; so does this');
    assert.ok(report.findings.some((f) => f.id.startsWith('prompt_chain.dangling.')));
  } finally {
    cleanup(dir);
  }
});

/* 4. Cycles — FAIL, exit 1. ----------------------------------------------- */

test('a two-node cycle FAILs and exits 1', () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: PHASE-C`],
    ['PHASE-C', `${QUEUED}\nnext_after: PHASE-B`]
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 1);
    const cycles = report.findings.filter((f) => f.id.startsWith('prompt_chain.cycle.'));
    assert.equal(cycles.length, 1, 'a ring is one finding, not one per node');
    assert.equal(cycles[0].rule, 'CASP-PROMPT-008');
    assert.equal(cycles[0].severity, 'fail');
  } finally {
    cleanup(dir);
  }
});

test('a self-referencing prompt FAILs and exits 1', () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: PHASE-B`]
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 1);
    const f = report.findings.find((x) => x.id.startsWith('prompt_chain.cycle.'));
    assert.ok(f, 'a prompt naming itself is a one-node ring');
    assert.match(f.detail, /itself/);
  } finally {
    cleanup(dir);
  }
});

/* 5. Fork and orphan — WARN, exit 0. -------------------------------------- */

test('two queued prompts sharing a predecessor WARN, and do not block the push', () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: PHASE-A`],
    ['PHASE-C', `${QUEUED}\nnext_after: PHASE-A`]
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 0, 'ambiguity is not falsehood — a fork never gates');
    const f = report.findings.find((x) => x.id.startsWith('prompt_chain.fork.'));
    assert.ok(f);
    assert.equal(f.severity, 'warn');
    assert.equal(f.rule, 'CASP-PROMPT-009');
  } finally {
    cleanup(dir);
  }
});

test('an ALIASED fork is detected — two spellings of one slice are one predecessor', () => {
  // The blocker an adversarial review caught after 0.13.0 was first assembled.
  // Fork detection keyed on the raw `next_after` string, so `PHASE-A` and
  // `phase-a` looked like two different predecessors: the WARN was missed, the
  // chain was declared coherent, and `status --json`'s `queue` then published a
  // LINEAR ORDER the frontmatter did not support — a false machine-readable
  // claim, worse than the missed warning.
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: PHASE-A`],
    ['PHASE-C', `${QUEUED}\nnext_after: phase-a`]
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 0, 'a fork is advisory, not a gate');
    const f = report.findings.find((x) => x.id.startsWith('prompt_chain.fork.'));
    assert.ok(f, 'the alias must be recognised as one target');
    assert.equal(f.rule, 'CASP-PROMPT-009');
    assert.match(f.detail, /as 'PHASE-A'/, "each claimant's own spelling is shown");
    assert.match(f.detail, /as 'phase-a'/);
    assert.ok(
      !report.findings.some((x) => x.id === 'prompt_chain.coherent'),
      'an unresolved fork means the chain is not coherent'
    );

    const s = JSON.parse(run(dir, 'status', '--json').stdout);
    assert.equal(s.queue, null, 'no order is published when the order is ambiguous');
  } finally {
    cleanup(dir);
  }
});

test('the slug spelling aliases too (PHASE-A vs a bare a)', () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: PHASE-A`],
    ['PHASE-C', `${QUEUED}\nnext_after: a`]
  ]);
  try {
    const { report } = checkJson(dir);
    assert.ok(report.findings.some((f) => f.id.startsWith('prompt_chain.fork.')));
  } finally {
    cleanup(dir);
  }
});

test('a cycle does not also emit an orphan WARN per ring member', () => {
  // One defect must be reported once. Ring members are unreachable BECAUSE of
  // the ring, which already FAILs — the same principle the missing-head guard
  // honours.
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: PHASE-C`],
    ['PHASE-C', `${QUEUED}\nnext_after: PHASE-B`]
  ]);
  try {
    const { report } = checkJson(dir);
    assert.equal(
      report.findings.filter((f) => f.id.startsWith('prompt_chain.cycle.')).length,
      1
    );
    assert.deepEqual(
      ids(report).filter((id) => id.startsWith('prompt_chain.orphan.')),
      [],
      'the ring is the finding; its members are not each a second one'
    );
  } finally {
    cleanup(dir);
  }
});

test('the skipped count is stated even when the chain is NOT coherent', () => {
  // It used to live only in the PASS line, so it vanished exactly when the
  // report was non-trivial. Spec: never silent.
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-PARKED', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: gone`]
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 1);
    const scope = report.findings.find((f) => f.id === 'prompt_chain.scope');
    assert.ok(scope, 'a scope line is emitted alongside the failure');
    assert.equal(scope.rule, 'CASP-PROMPT-007');
    assert.match(scope.detail, /2 queued prompt\(s\) declare no next_after/);
  } finally {
    cleanup(dir);
  }
});

test('identity precedence is a pure function of the filenames, not of readdir order', () => {
  // `A.md` and `PHASE-A.md` both answer to the slug `a`. The exact stem must
  // win in both creation orders, or the same repo chains differently on two
  // filesystems.
  const orders = [
    [['A', QUEUED], ['PHASE-A', QUEUED]],
    [['PHASE-A', QUEUED], ['A', QUEUED]]
  ];
  const results = orders.map(([first, second]) => {
    const { dir } = scaffold([
      ['PHASE-HEAD', QUEUED],
      first,
      second,
      ['PHASE-Z', `${QUEUED}\nnext_after: A`]
    ]);
    try {
      return JSON.stringify(
        checkJson(dir).report.findings.filter((f) => f.id.startsWith('prompt_chain.'))
      );
    } finally {
      cleanup(dir);
    }
  });
  assert.equal(results[0], results[1], 'creation order must not change the verdict');
});

test('a queued prompt unreachable from next_prompt WARNs, and does not block the push', () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: PHASE-A`],
    ['PHASE-ISLAND', `${QUEUED}\nnext_after: ${SESSION_ID}`]
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 0);
    const f = report.findings.find((x) => x.id.startsWith('prompt_chain.orphan.'));
    assert.ok(f);
    assert.equal(f.severity, 'warn');
    assert.equal(f.rule, 'CASP-PROMPT-010');
    assert.match(f.detail, /PHASE-ISLAND/);
  } finally {
    cleanup(dir);
  }
});

test('a parked prompt (no next_after) is never reported as an orphan', () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: PHASE-A`],
    ['PHASE-PARKED', QUEUED]
  ]);
  try {
    const { report } = checkJson(dir);
    assert.deepEqual(
      ids(report).filter((id) => id.startsWith('prompt_chain.orphan.')),
      [],
      'a deliberate parking lot is a legitimate way to work'
    );
  } finally {
    cleanup(dir);
  }
});

/* 6. History is not blamed. ----------------------------------------------- */

test("a shipped prompt's next_after is never re-litigated", () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    [
      'PHASE-OLD',
      `status: shipped\nsession_id: ${SESSION_ID}\nsession_log: session-logs/${SESSION_ID}.md\nnext_after: a-slice-lost-to-history`
    ]
  ]);
  try {
    const { status, report } = checkJson(dir);
    assert.equal(status, 0, 'a dangling reference in shipped history is not this gate’s business');
    assert.deepEqual(
      ids(report).filter((id) => id.startsWith('prompt_chain.')),
      [],
      'a shipped prompt is a resolution target, never a subject'
    );
  } finally {
    cleanup(dir);
  }
});

test('a shipped prompt is still a valid resolution target', () => {
  const { dir } = scaffold([
    [
      'PHASE-OLD',
      `status: shipped\nsession_id: ${SESSION_ID}\nsession_log: session-logs/${SESSION_ID}.md`
    ],
    ['PHASE-A', `${QUEUED}\nnext_after: PHASE-OLD`]
  ]);
  try {
    // next_prompt points at the shipped PHASE-OLD here, which CASP-PROMPT-003
    // already FAILs on — the point is only that PHASE-A's reference resolves.
    const { report } = checkJson(dir);
    assert.deepEqual(
      ids(report).filter((id) => id.startsWith('prompt_chain.dangling.')),
      []
    );
  } finally {
    cleanup(dir);
  }
});

test('no usable head → no orphan storm on top of the real finding', () => {
  const { dir, state } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: PHASE-A`]
  ]);
  try {
    state.next_prompt = 'docs/plan/sessions/GONE.md';
    writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2));
    const { status, report } = checkJson(dir);
    assert.equal(status, 1, 'CASP-PROMPT-001 is the finding that matters here');
    assert.deepEqual(
      ids(report).filter((id) => id.startsWith('prompt_chain.orphan.')),
      [],
      'one actionable finding, not one warning per queued prompt'
    );
  } finally {
    cleanup(dir);
  }
});

/* 7. The catalogue and the machine contracts. ----------------------------- */

test('the new codes are in `casp rules` and resolve in `casp explain`', () => {
  const { dir } = scaffold([['PHASE-A', QUEUED]]);
  try {
    const r = run(dir, 'rules');
    for (const code of [
      'CASP-PROMPT-007',
      'CASP-PROMPT-008',
      'CASP-PROMPT-009',
      'CASP-PROMPT-010'
    ]) {
      assert.match(r.stdout, new RegExp(code), `${code} is missing from the catalogue`);
      assert.equal(run(dir, 'explain', code).status, 0, `${code} does not resolve`);
    }
  } finally {
    cleanup(dir);
  }
});

test('every chain finding carries a rule code, and the schema stays v1', () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: gone`],
    ['PHASE-C', `${QUEUED}\nnext_after: PHASE-D`],
    ['PHASE-D', `${QUEUED}\nnext_after: PHASE-C`],
    ['PHASE-E', `${QUEUED}\nnext_after: ${SESSION_ID}`],
    ['PHASE-F', `${QUEUED}\nnext_after: ${SESSION_ID}`]
  ]);
  try {
    const { report } = checkJson(dir);
    assert.equal(report.schema_version, 1);
    const chain = report.findings.filter((f) => f.id.startsWith('prompt_chain.'));
    assert.ok(chain.length >= 4, 'the fixture trips several chain findings at once');
    assert.deepEqual(
      chain.filter((f) => !f.rule).map((f) => f.id),
      [],
      'these finding ids map to no rule — add them to src/rules.ts'
    );
    assert.ok(codes(report).every((c) => /^CASP-[A-Z]+-\d{3}$/.test(c)));
  } finally {
    cleanup(dir);
  }
});

test('status --json exposes the resolved queue order, head first, and never gates', () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: PHASE-A`],
    ['PHASE-C', `${QUEUED}\nnext_after: PHASE-B`]
  ]);
  try {
    const r = run(dir, 'status', '--json');
    assert.equal(r.status, 0);
    const report = JSON.parse(r.stdout);
    assert.equal(report.schema_version, 1, 'an additive field does not bump the schema');
    assert.deepEqual(report.queue, [
      'docs/plan/sessions/PHASE-A.md',
      'docs/plan/sessions/PHASE-B.md',
      'docs/plan/sessions/PHASE-C.md'
    ]);
  } finally {
    cleanup(dir);
  }
});

test('status --json queue is null on a drifted chain, and status still exits 0', () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', `${QUEUED}\nnext_after: gone`]
  ]);
  try {
    const r = run(dir, 'status', '--json');
    assert.equal(r.status, 0, 'status reports, it never gates');
    assert.equal(JSON.parse(r.stdout).queue, null);
  } finally {
    cleanup(dir);
  }
});

test('status --json queue is null when the chain was never adopted', () => {
  const { dir } = scaffold([
    ['PHASE-A', QUEUED],
    ['PHASE-B', QUEUED]
  ]);
  try {
    const r = run(dir, 'status', '--json');
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).queue, null);
  } finally {
    cleanup(dir);
  }
});
