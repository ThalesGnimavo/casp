/**
 * The Claude Code skills ship as one skills-directory plugin named `casp`
 * (0.19.0): `claude-plugin/` is exactly the folder a user copies to
 * `~/.claude/skills/casp`. The root SKILL.md is `/casp`; everything under
 * `skills/` is namespaced by the manifest name (`/casp:next`, `/casp:fleet`,
 * `/casp:audit-batch`), so no casp skill can mask a built-in or another
 * author's command of the same short name.
 *
 * Also covers the two WARN-only `casp doctor` probes of a user's skills
 * directory, isolated through CLAUDE_CONFIG_DIR so the host's own
 * ~/.claude never leaks into the result.
 *
 * Runs the BUILT binary (dist/cli.js); `pretest` builds first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CLI = join(ROOT, 'dist', 'cli.js');
const PLUGIN = join(ROOT, 'claude-plugin');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const manifest = () => JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
const NAMESPACED = ['next', 'fleet', 'audit-batch'];

function skillFiles() {
  return [join(PLUGIN, 'SKILL.md'), ...NAMESPACED.map((s) => join(PLUGIN, 'skills', s, 'SKILL.md'))];
}

test('plugin layout: manifest alone in .claude-plugin/, root skill, namespaced skills', () => {
  assert.deepEqual(readdirSync(join(PLUGIN, '.claude-plugin')), ['plugin.json']);
  for (const f of skillFiles()) assert.ok(existsSync(f), `${f} must exist`);
  assert.equal(existsSync(join(ROOT, 'skills')), false, 'the flat skills/ folder is gone');
});

test('plugin.json: name casp, version equal to package.json', () => {
  const m = manifest();
  assert.equal(m.name, 'casp');
  assert.equal(m.version, pkg.version, 'run node scripts/sync-plugin-version.mjs');
  assert.equal(m.license, 'MIT');
});

test('package.json ships claude-plugin, not skills', () => {
  assert.ok(pkg.files.includes('claude-plugin'));
  assert.equal(pkg.files.includes('skills'), false);
});

test('frontmatter name stays short: the prefix comes from the plugin', () => {
  const names = skillFiles().map((f) => /^name:\s*(.+)$/m.exec(readFileSync(f, 'utf8'))?.[1].trim());
  assert.deepEqual(names, ['casp', ...NAMESPACED]);
});

test('cross-references use /casp:<skill>; CLI calls stay untouched', () => {
  const flat = /(?<![\w/.:-])\/(next|fleet|audit-batch)\b/;
  for (const f of skillFiles()) {
    const body = readFileSync(f, 'utf8');
    assert.equal(flat.exec(body), null, `${f} still names a flat slash command`);
  }
  const next = readFileSync(join(PLUGIN, 'skills', 'next', 'SKILL.md'), 'utf8');
  assert.match(next, /^# \/casp:next — /m);
  assert.match(next, /npx @justethales\/casp|casp status|casp check/, 'CLI invocations keep their form');
});

/* ---- casp doctor: skills probes ------------------------------------------ */

function doctor(configDir) {
  const cwd = mkdtempSync(join(tmpdir(), 'casp-plugin-cwd-'));
  const r = spawnSync('node', [CLI, 'doctor', '--json'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir }
  });
  assert.equal(r.status, 0, 'doctor never gates');
  return JSON.parse(r.stdout).checks.filter((c) => c.id.startsWith('skills.'));
}

function configDir() {
  const dir = mkdtempSync(join(tmpdir(), 'casp-plugin-cfg-'));
  mkdirSync(join(dir, 'skills'), { recursive: true });
  return dir;
}

function flatSkill(cfg, name, description) {
  mkdirSync(join(cfg, 'skills', name), { recursive: true });
  writeFileSync(
    join(cfg, 'skills', name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: |\n  ${description}\n---\n\n# body\n`
  );
}

test('doctor: no skills directory → no skills row at all', () => {
  const cfg = mkdtempSync(join(tmpdir(), 'casp-plugin-empty-'));
  assert.deepEqual(doctor(cfg), []);
});

test('doctor: plugin copied at the CLI version → PASS', () => {
  const cfg = configDir();
  cpSync(PLUGIN, join(cfg, 'skills', 'casp'), { recursive: true });
  const rows = doctor(cfg);
  assert.deepEqual(rows.map((r) => [r.id, r.severity]), [['skills.plugin_version', 'pass']]);
});

test('doctor: plugin copied from an older release → WARN, never FAIL', () => {
  const cfg = configDir();
  cpSync(PLUGIN, join(cfg, 'skills', 'casp'), { recursive: true });
  const mf = join(cfg, 'skills', 'casp', '.claude-plugin', 'plugin.json');
  writeFileSync(mf, JSON.stringify({ ...manifest(), version: '0.0.1' }));
  const [row] = doctor(cfg);
  assert.equal(row.id, 'skills.plugin_version');
  assert.equal(row.severity, 'warn');
  assert.match(row.label, /0\.0\.1/);
});

test('doctor: pre-0.19 flat copies → one WARN naming them', () => {
  const cfg = configDir();
  flatSkill(cfg, 'next', 'Start the next implementation session. Reads casp/state.json for the');
  flatSkill(cfg, 'casp', 'Quick state lookups for any CASP-managed project. Answers "where are we?",');
  const rows = doctor(cfg);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'skills.legacy_flat');
  assert.equal(rows[0].severity, 'warn');
  assert.match(rows[0].label, /next, casp$/);
});

test('doctor: quoted frontmatter values are still recognised', () => {
  const cfg = configDir();
  mkdirSync(join(cfg, 'skills', 'fleet'), { recursive: true });
  writeFileSync(
    join(cfg, 'skills', 'fleet', 'SKILL.md'),
    '---\r\nname: "fleet"\r\ndescription: "Coordinate several parallel coding-agent sessions on one repository. Turns"\r\n---\r\n'
  );
  const rows = doctor(cfg);
  assert.equal(rows.length, 1);
  assert.match(rows[0].label, /fleet$/);
});

test("doctor: a user's own skill that only shares a name is left alone", () => {
  const cfg = configDir();
  flatSkill(cfg, 'next', 'Jump to the next slide of my deck.');
  flatSkill(cfg, 'fleet', 'Orchestrate several parallel sessions my own way.');
  assert.deepEqual(doctor(cfg), []);
});

test('doctor: the new plugin at skills/casp is never mistaken for a flat copy', () => {
  const cfg = configDir();
  cpSync(PLUGIN, join(cfg, 'skills', 'casp'), { recursive: true });
  assert.equal(doctor(cfg).some((r) => r.id === 'skills.legacy_flat'), false);
});
