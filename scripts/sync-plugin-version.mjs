#!/usr/bin/env node
/**
 * Keep claude-plugin/.claude-plugin/plugin.json `version` equal to package.json.
 *
 *   node scripts/sync-plugin-version.mjs          write the package version into the manifest
 *   node scripts/sync-plugin-version.mjs --check  exit 1 when they differ (prepublishOnly)
 *
 * Wired as the npm `version` lifecycle script, so `npm version <bump>` stages the
 * manifest with package.json. `casp doctor` compares a user's copied plugin to the
 * installed CLI through this field, so a drift here would be reported to every user.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const manifestPath = fileURLToPath(new URL('claude-plugin/.claude-plugin/plugin.json', root));
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const raw = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(raw);

if (manifest.version === pkg.version) process.exit(0);

if (process.argv.includes('--check')) {
  console.error(`plugin.json version ${manifest.version} != package.json version ${pkg.version}`);
  console.error('run: node scripts/sync-plugin-version.mjs');
  process.exit(1);
}

const versionKey = /("version"\s*:\s*)"[^"]*"/;
if (!versionKey.test(raw)) {
  console.error(`no "version" key in ${manifestPath}`);
  process.exit(1);
}
writeFileSync(manifestPath, raw.replace(versionKey, `$1"${pkg.version}"`));
console.log(`plugin.json version -> ${pkg.version}`);
