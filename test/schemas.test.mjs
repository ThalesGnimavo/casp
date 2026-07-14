/**
 * Published JSON Schemas stay in sync with what the binary actually emits.
 *
 * We do not bundle a JSON-Schema validator (zero extra deps): instead we assert
 * the structural contract — every `required` key a schema declares is actually
 * produced by `casp init` (state) and `casp check --json` (result). If init or
 * the report shape drifts from the published schema, this fails.
 *
 * Runs the BUILT binary (dist/cli.js); `pretest` builds first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const SCHEMA_DIR = fileURLToPath(new URL('../schemas/', import.meta.url));

const readSchema = (name) => JSON.parse(readFileSync(join(SCHEMA_DIR, name), 'utf8'));
function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}
function run(cwd, ...args) {
  return spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}

test('both schemas parse and declare Draft 2020-12', () => {
  for (const name of ['state.schema.json', 'check-result.schema.json']) {
    const s = readSchema(name);
    assert.match(s.$schema, /2020-12/, `${name} declares the draft`);
    assert.ok(s.$id && s.title && s.type === 'object');
  }
});

test('casp init produces every required key of state.schema.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'casp-schema-state-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@casp.sh');
    git(dir, 'config', 'user.name', 'casp test');
    const r = run(dir, 'init');
    assert.equal(r.status, 0, r.stderr);
    const state = JSON.parse(readFileSync(join(dir, 'casp', 'state.json'), 'utf8'));
    const schema = readSchema('state.schema.json');
    for (const key of schema.required) {
      assert.ok(key in state, `init must scaffold the schema-required key '${key}'`);
    }
    assert.ok(Array.isArray(state.phases_shipped), 'phases_shipped is an array');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('casp check --json matches the required shape of check-result.schema.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'casp-schema-result-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@casp.sh');
    git(dir, 'config', 'user.name', 'casp test');
    run(dir, 'init');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'init');

    const r = run(dir, 'check', '--json');
    const report = JSON.parse(r.stdout);
    const schema = readSchema('check-result.schema.json');
    for (const key of schema.required) {
      assert.ok(key in report, `check --json must emit top-level '${key}'`);
    }
    const findingRequired = schema.properties.findings.items.required;
    for (const f of report.findings) {
      for (const key of findingRequired) {
        assert.ok(key in f, `each finding must carry '${key}'`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
