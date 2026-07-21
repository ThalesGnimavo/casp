/**
 * help surface (casp-help phase).
 *
 *   casp help             → top-level overview, exit 0 (the papercut fix:
 *                           "help" used to be "unknown command" + exit 1).
 *   casp help <command>   → that command's focused block, exit 0.
 *   casp <command> --help → identical to `casp help <command>` (exit 0).
 *   casp help <bogus>     → graceful "no such command", lists valid verbs, exit 1.
 *
 * Runs the BUILT binary (dist/cli.js); `pretest` builds first. No git repo
 * needed — help is a pure static surface.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

function run(...args) {
  return spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
}

/* ---- casp help → first-class, exit 0 --------------------------------- */

test('casp help → top-level overview, exit 0 (no more "unknown command")', () => {
  const r = run('help');
  assert.equal(r.status, 0, 'casp help must exit 0');
  assert.doesNotMatch(r.stdout + r.stderr, /unknown command/i);
  assert.match(r.stdout, /Coding-Agent State Protocol/);
  assert.match(r.stdout, /COMMANDS/);
});

test('casp help matches the no-arg / -h / --help top-level block', () => {
  const help = run('help').stdout;
  assert.equal(run().stdout, help, 'casp == casp help');
  assert.equal(run('-h').stdout, help, 'casp -h == casp help');
  assert.equal(run('--help').stdout, help, 'casp --help == casp help');
});

test('top-level help carries the "how the loop works" mental model', () => {
  const r = run('help');
  assert.match(r.stdout, /THE LOOP/);
  // The canonical loop order, with check as the only hard gate.
  assert.match(r.stdout, /init.*status.*check.*ship.*close.*push/s);
});

/* ---- casp help <command> → command-specific -------------------------- */

test('casp help check is check-specific, not the generic block', () => {
  const r = run('help', 'check');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /casp check —/);
  assert.match(r.stdout, /exits 1 on drift/);
  assert.match(r.stdout, /--quiet/);
  assert.match(r.stdout, /--all/);
  // It is NOT the top-level overview: the full COMMANDS table is absent.
  assert.doesNotMatch(r.stdout, /THE LOOP/);
});

test('casp check --help is identical to casp help check', () => {
  assert.equal(run('check', '--help').stdout, run('help', 'check').stdout);
  assert.equal(run('check', '-h').stdout, run('help', 'check').stdout);
  assert.equal(run('check', '--help').status, 0);
});

test('every verb has a focused help block (exit 0, command-specific header)', () => {
  const verbs = [
    'init',
    'status',
    'check',
    'next',
    'new',
    'ship',
    'close',
    'install-hook',
    'verify',
    'state',
    'help'
  ];
  for (const v of verbs) {
    const viaHelp = run('help', v);
    assert.equal(viaHelp.status, 0, `casp help ${v} must exit 0`);
    assert.match(viaHelp.stdout, new RegExp(`casp ${v} —`), `block names ${v}`);
    assert.match(viaHelp.stdout, /USAGE/, `${v} block has a USAGE section`);
    // `casp <verb> --help` must route to the same block (except help itself,
    // whose --help is the top-level overview).
    if (v !== 'help') {
      assert.equal(
        run(v, '--help').stdout,
        viaHelp.stdout,
        `casp ${v} --help == casp help ${v}`
      );
    }
  }
});

/* ---- graceful unknown ------------------------------------------------- */

test('casp help <bogus> → exit 1, names valid commands, no stack trace', () => {
  const r = run('help', 'zonk');
  assert.equal(r.status, 1, 'unknown command help must exit 1');
  assert.match(r.stderr, /no such command: zonk/);
  assert.match(r.stderr, /valid commands:/);
  assert.match(r.stderr, /check/, 'the valid-command list includes real verbs');
});

test('casp <bogus> (unknown top-level command) → exit 1, same graceful message', () => {
  const r = run('zonk');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no such command: zonk/);
  assert.match(r.stderr, /valid commands:/);
});

/* ---- version still wins ---------------------------------------------- */

test('-V / --version short-circuit even alongside a command', () => {
  assert.match(run('-V').stdout.trim(), /^\d+\.\d+\.\d+$/);
  assert.match(run('--version').stdout.trim(), /^\d+\.\d+\.\d+$/);
});

/* ---- the naming surface and the dispatcher cannot drift apart --------- */

// The upgrade-command phase's reference notes assumed a coverage test already
// enforced "every verb has a help block" — it did not exist, and the hardcoded
// verb list further up this file had silently fallen five verbs behind. This is
// that missing invariant, asserted structurally in both directions so a new verb
// can never ship dispatched-but-undocumented or documented-but-undispatched.
test('every dispatched command has a help block, and vice-versa', async () => {
  const { COMMAND_NAMES } = await import('../dist/help.js');
  const cli = readFileSync(new URL('../src/cli.ts', import.meta.url), 'utf8');
  const dispatched = [...cli.matchAll(/^\s{4}case '([a-z][a-z-]*)':/gm)].map((m) => m[1]);

  for (const verb of dispatched) {
    assert.ok(
      COMMAND_NAMES.includes(verb),
      `cli.ts dispatches '${verb}' but help.ts documents no such command`
    );
  }
  // `help` is handled before the switch (it must exit 0 with no argument), so it
  // is the one documented verb with no `case`.
  for (const verb of COMMAND_NAMES) {
    if (verb === 'help') continue;
    assert.ok(
      dispatched.includes(verb),
      `help.ts documents '${verb}' but cli.ts never dispatches it`
    );
  }
});
