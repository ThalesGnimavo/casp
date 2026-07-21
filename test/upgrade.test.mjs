/**
 * `casp upgrade` — refresh a cockpit's scaffolds without eating its state.
 *
 * The contract under test, in one line: a version bump must never cost the
 * operator a keystroke of state.json / now.md / roadmap.md. Every assertion
 * here exists because `init --force` — the only refresh path before this verb —
 * violated exactly that.
 *
 *   upgrade    — refreshes README.md + templates/**, stamps state.casp_version,
 *                leaves every data file byte-identical.
 *   idempotent — a second run writes nothing and says so.
 *   --dry-run  — prints the plan, writes nothing, ever.
 *   no casp/   — exit 1, pointing at init.
 *   backward   — a cockpit with no `casp_version` key still PASSes check.
 *   hostile fs — a symlink is left alone; an unwritable path is reported, not fatal.
 *   doctor     — WARNs on an unstamped or stale cockpit, PASSes when current.
 *
 * Runs the BUILT binary (dist/cli.js); `pretest` builds first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  symlinkSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const PKG_VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}
function run(cwd, ...args) {
  return spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}
function readState(dir) {
  return JSON.parse(readFileSync(join(dir, 'casp', 'state.json'), 'utf8'));
}

/** Every file under a directory, as `rel → contents`. */
function snapshot(dir) {
  const out = {};
  const walk = (abs) => {
    for (const entry of readdirSync(abs)) {
      const p = join(abs, entry);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(dir, p)] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

/** A repo with a cockpit scaffolded by the real `casp init`. */
function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'casp-upgrade-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@casp.sh');
  git(dir, 'config', 'user.name', 'casp test');
  const r = run(dir, 'init');
  assert.equal(r.status, 0, `init failed: ${r.stdout}${r.stderr}`);
  return dir;
}

/**
 * Age a scaffolded cockpit: roll its version stamp back, damage a shipped
 * scaffold, and put operator content in the three data files. This is the
 * "scaffolded by an older CASP, then worked in for months" shape.
 */
function age(dir) {
  const state = readState(dir);
  state.casp_version = '0.7.0';
  state.notes = 'operator notes — must survive';
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2) + '\n');
  writeFileSync(join(dir, 'casp', 'templates', 'session-log.md'), '# an old template\n');
  writeFileSync(join(dir, 'casp', 'now.md'), '# my current focus\n\nhand-written.\n');
  writeFileSync(join(dir, 'casp', 'roadmap.md'), '# my roadmap\n\n1. ship it.\n');
}

/* ---- the core contract ------------------------------------------------- */

test('upgrade refreshes the scaffolds and leaves every data file byte-identical', () => {
  const dir = scaffold();
  age(dir);
  const before = snapshot(join(dir, 'casp'));

  const r = run(dir, 'upgrade', '--plain');
  assert.equal(r.status, 0, `upgrade failed: ${r.stdout}${r.stderr}`);

  const after = snapshot(join(dir, 'casp'));

  // The damaged scaffold is back to the package's canonical copy.
  const canonical = readFileSync(
    new URL('../templates/templates/session-log.md', import.meta.url),
    'utf8'
  );
  assert.equal(after[join('templates', 'session-log.md')], canonical);
  assert.match(r.stdout, /refresh\s+templates\/session-log\.md/);

  // The data files are untouched, to the byte.
  assert.equal(after['now.md'], before['now.md'], 'now.md must not be touched');
  assert.equal(after['roadmap.md'], before['roadmap.md'], 'roadmap.md must not be touched');
  assert.match(r.stdout, /skip\s+now\.md/);
  assert.match(r.stdout, /skip\s+roadmap\.md/);
  assert.match(r.stdout, /skip\s+state\.json/);

  // state.json: the version stamp moved, every other value is identical.
  const s0 = JSON.parse(before['state.json']);
  const s1 = JSON.parse(after['state.json']);
  assert.equal(s1.casp_version, PKG_VERSION);
  assert.equal(s1.notes, 'operator notes — must survive');
  delete s0.casp_version;
  delete s1.casp_version;
  assert.deepEqual(s1, s0, 'no state value other than casp_version may change');
  assert.match(r.stdout, /state\.json casp_version: 0\.7\.0 →/);

  rmSync(dir, { recursive: true, force: true });
});

test('upgrade preserves the README scaffolded-on date (so it is idempotent across days)', () => {
  const dir = scaffold();
  const readme = join(dir, 'casp', 'README.md');
  // Rewrite the whole README from the package copy with an OLD scaffold date,
  // so only the date line differs from canonical.
  const pkgReadme = readFileSync(new URL('../templates/README.md', import.meta.url), 'utf8');
  writeFileSync(readme, pkgReadme.split('{{TODAY}}').join('2026-01-15'));

  const r = run(dir, 'upgrade', '--plain');
  assert.equal(r.status, 0);
  assert.match(readFileSync(readme, 'utf8'), /\*\*Scaffolded\*\* : 2026-01-15/);
  assert.match(r.stdout, /same\s+README\.md/, 'an only-the-date-differs README is already current');

  rmSync(dir, { recursive: true, force: true });
});

test('upgrade is idempotent: a second run writes nothing and says so', () => {
  const dir = scaffold();
  age(dir);
  assert.equal(run(dir, 'upgrade', '--plain').status, 0);
  const before = snapshot(join(dir, 'casp'));

  const r = run(dir, 'upgrade', '--plain');
  assert.equal(r.status, 0);
  assert.deepEqual(snapshot(join(dir, 'casp')), before, 'a re-run must write nothing');
  assert.match(r.stdout, /already current with casp/);
  assert.match(r.stdout, /state\.json casp_version: .*already current/);
  assert.doesNotMatch(r.stdout, /refresh /);

  rmSync(dir, { recursive: true, force: true });
});

test('upgrade --dry-run prints the plan and writes nothing', () => {
  const dir = scaffold();
  age(dir);
  const before = snapshot(join(dir, 'casp'));

  const r = run(dir, 'upgrade', '--dry-run', '--plain');
  assert.equal(r.status, 0);
  assert.deepEqual(snapshot(join(dir, 'casp')), before, '--dry-run must write nothing');
  assert.match(r.stdout, /dry run/);
  assert.match(r.stdout, /refresh\s+templates\/session-log\.md/);
  assert.equal(readState(dir).casp_version, '0.7.0', 'the stamp must not move on a dry run');

  // -n is the same flag.
  assert.equal(run(dir, 'upgrade', '-n', '--plain').status, 0);
  assert.deepEqual(snapshot(join(dir, 'casp')), before);

  rmSync(dir, { recursive: true, force: true });
});

test('upgrade adds a scaffold the cockpit is missing entirely', () => {
  const dir = scaffold();
  rmSync(join(dir, 'casp', 'templates'), { recursive: true, force: true });

  const r = run(dir, 'upgrade', '--plain');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /add\s+templates\/session-log\.md/);
  assert.ok(
    readFileSync(join(dir, 'casp', 'templates', 'session-log.md'), 'utf8').includes('phase:'),
    'the 0.11.0 session-log template must be delivered'
  );

  rmSync(dir, { recursive: true, force: true });
});

/* ---- hostile filesystem shapes (the audit's findings) ------------------ */

test('upgrade never writes THROUGH a symlink — the target may be outside casp/', () => {
  const dir = scaffold();
  // The operator points casp/README.md at a shared doc outside the cockpit.
  const outside = join(dir, 'TEAM-PROTOCOL.md');
  writeFileSync(outside, '# our own protocol notes\n');
  rmSync(join(dir, 'casp', 'README.md'));
  symlinkSync(outside, join(dir, 'casp', 'README.md'));

  const r = run(dir, 'upgrade', '--plain');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /symlink\s+README\.md/);
  assert.equal(
    readFileSync(outside, 'utf8'),
    '# our own protocol notes\n',
    'the symlink target must never be rewritten'
  );

  rmSync(dir, { recursive: true, force: true });
});

test('a directory in the way is reported per file — the run still stamps and exits 0', () => {
  const dir = scaffold();
  age(dir);
  // A DIRECTORY where a scaffold belongs: writeFileSync throws EISDIR. This is
  // the same class the 0.11.0 audit fixed in check — a single hostile entry must
  // not abort the run and leave the cockpit half-refreshed AND unstamped.
  rmSync(join(dir, 'casp', 'templates', 'session-log.md'));
  mkdirSync(join(dir, 'casp', 'templates', 'session-log.md'));

  const r = run(dir, 'upgrade', '--plain');
  assert.equal(r.status, 0, 'upgrade never gates, even when a write fails');
  assert.doesNotMatch(r.stderr, /Error:/, 'no uncaught stack trace');
  assert.match(r.stdout, /error\s+templates\/session-log\.md/);
  assert.match(r.stdout, /could not be written/);
  // The stamp still ran — otherwise a re-run repeats the partial write forever.
  assert.equal(readState(dir).casp_version, PKG_VERSION);

  rmSync(dir, { recursive: true, force: true });
});

test('refreshing README.md warns that it replaces local edits', () => {
  const dir = scaffold();
  writeFileSync(join(dir, 'casp', 'README.md'), '# my own notes\n');
  const r = run(dir, 'upgrade', '--plain');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /refresh\s+README\.md \(replaces your local edits/);
  rmSync(dir, { recursive: true, force: true });
});

test('README.md is the ONLY shipped non-data scaffold carrying {{TODAY}}', () => {
  // Date preservation is README-specific (it keys off the **Scaffolded** line).
  // A future template carrying {{TODAY}} without that line would be rewritten
  // with today's date on every run — idempotency would die silently. This test
  // is the tripwire.
  const root = fileURLToPath(new URL('../templates', import.meta.url));
  const dated = [];
  const walk = (abs, prefix = '') => {
    for (const entry of readdirSync(abs)) {
      const p = join(abs, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (statSync(p).isDirectory()) walk(p, rel);
      else if (readFileSync(p, 'utf8').includes('{{TODAY}}')) dated.push(rel);
    }
  };
  walk(root);
  const DATA = ['state.json', 'now.md', 'roadmap.md'];
  assert.deepEqual(
    dated.filter((f) => !DATA.includes(f)).sort(),
    ['README.md'],
    'a new {{TODAY}} template needs its own date-preservation rule in upgrade.ts'
  );
});

test('upgrade with no casp/ exits 1 and points at init', () => {
  const dir = mkdtempSync(join(tmpdir(), 'casp-upgrade-bare-'));
  const r = run(dir, 'upgrade', '--plain');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no casp\/ cockpit/);
  assert.match(r.stderr, /casp init/);
  rmSync(dir, { recursive: true, force: true });
});

/* ---- the stamp is additive and never gates ----------------------------- */

test('init stamps the CASP version and the fresh cockpit still checks green', () => {
  const dir = scaffold();
  assert.equal(readState(dir).casp_version, PKG_VERSION);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'scaffold');

  const r = run(dir, 'check', '--plain');
  assert.equal(r.status, 0, `a fresh init must check green: ${r.stdout}${r.stderr}`);

  rmSync(dir, { recursive: true, force: true });
});

test('a cockpit with NO casp_version key still PASSes check (pre-stamp repos are legal)', () => {
  const dir = scaffold();
  const state = readState(dir);
  delete state.casp_version;
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2) + '\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'scaffold');

  const r = run(dir, 'check', '--plain');
  assert.equal(r.status, 0, `an unstamped cockpit must not be drift: ${r.stdout}${r.stderr}`);
  assert.doesNotMatch(r.stdout, /version/i);

  rmSync(dir, { recursive: true, force: true });
});

/* ---- doctor's staleness WARN (never a FAIL, never a gate) -------------- */

test('doctor: current cockpit PASSes, stale and unstamped ones WARN — always exit 0', () => {
  const dir = scaffold();

  let d = JSON.parse(run(dir, 'doctor', '--json').stdout);
  let k = d.checks.find((x) => x.id === 'cockpit.version');
  assert.equal(k.severity, 'pass', 'a freshly scaffolded cockpit is current');

  const state = readState(dir);
  state.casp_version = '0.7.0';
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2) + '\n');
  let r = run(dir, 'doctor', '--json');
  assert.equal(r.status, 0, 'doctor never gates');
  k = JSON.parse(r.stdout).checks.find((x) => x.id === 'cockpit.version');
  assert.equal(k.severity, 'warn');
  assert.match(k.detail, /casp upgrade/);

  delete state.casp_version;
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2) + '\n');
  r = run(dir, 'doctor', '--json');
  assert.equal(r.status, 0);
  k = JSON.parse(r.stdout).checks.find((x) => x.id === 'cockpit.version');
  assert.equal(k.severity, 'warn');
  assert.match(k.label, /not version-stamped/);

  // A cockpit stamped by a NEWER CASP than the installed CLI is the inverse
  // anomaly: upgrade the package, do not downgrade the cockpit.
  state.casp_version = '99.0.0';
  writeFileSync(join(dir, 'casp', 'state.json'), JSON.stringify(state, null, 2) + '\n');
  k = JSON.parse(run(dir, 'doctor', '--json').stdout).checks.find(
    (x) => x.id === 'cockpit.version'
  );
  assert.equal(k.severity, 'warn');
  assert.match(k.detail, /older than the cockpit/);

  rmSync(dir, { recursive: true, force: true });
});

/* ---- the verb is wired into the naming surface ------------------------- */

test('upgrade is a first-class verb in the help surface', () => {
  const top = spawnSync('node', [CLI, 'help'], { encoding: 'utf8' });
  assert.match(top.stdout, /^\s+upgrade\s{2,}/m, 'upgrade must appear in the COMMANDS deck');

  const one = spawnSync('node', [CLI, 'help', 'upgrade'], { encoding: 'utf8' });
  assert.equal(one.status, 0);
  assert.match(one.stdout, /casp upgrade —/);
  assert.match(one.stdout, /--dry-run/);
});

test('unknown flags do not turn upgrade destructive', () => {
  const dir = scaffold();
  age(dir);
  // A bogus flag is not --dry-run: upgrade still applies. What must NOT happen
  // is a bogus flag being read as force-anything and eating the data files.
  const before = snapshot(join(dir, 'casp'));
  const r = run(dir, 'upgrade', '--force', '--plain');
  assert.equal(r.status, 0);
  const after = snapshot(join(dir, 'casp'));
  assert.equal(after['now.md'], before['now.md']);
  assert.equal(after['roadmap.md'], before['roadmap.md']);
  rmSync(dir, { recursive: true, force: true });
});
