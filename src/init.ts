/**
 * `cockpit init` — scaffold a cockpit/ directory in the current repo.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exit } from 'node:process';
import { c, todayISO } from './shared.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES = join(__dirname, '..', 'templates');

function copyDir(src: string, dest: string, force: boolean): void {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) {
      copyDir(s, d, force);
    } else {
      if (existsSync(d) && !force) {
        console.log(`  ${c.gray('skip')}    ${relative(process.cwd(), d)} (exists)`);
        continue;
      }
      copyFileSync(s, d);
      console.log(`  ${c.green('write')}   ${relative(process.cwd(), d)}`);
    }
  }
}

function interpolate(filePath: string, vars: Record<string, string>): void {
  const raw = readFileSync(filePath, 'utf8');
  let out = raw;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  if (out !== raw) writeFileSync(filePath, out);
}

export function runInit(args: string[]): void {
  const force = args.includes('--force') || args.includes('-f');
  const root = process.cwd();
  const target = join(root, 'cockpit');

  if (existsSync(target) && !force) {
    console.log(c.yellow(`cockpit/ already exists at ${target}`));
    console.log(c.gray('use --force to overwrite, or edit the existing files'));
    exit(0);
  }

  console.log(`${c.bold('cockpit init')} · scaffolding ${c.cyan(relative(root, target) || 'cockpit/')}`);
  console.log('');

  copyDir(TEMPLATES, target, force);

  // Interpolate the date placeholder in scaffolded markdown.
  const today = todayISO();
  const interpolatables = [
    join(target, 'now.md'),
    join(target, 'roadmap.md'),
    join(target, 'state.json'),
    join(target, 'README.md')
  ];
  for (const f of interpolatables) {
    if (existsSync(f)) interpolate(f, { TODAY: today });
  }

  console.log('');
  console.log(c.green('✓ cockpit scaffolded.'));
  console.log('');
  console.log('Next steps :');
  console.log(`  ${c.cyan('1.')} edit ${c.gray('cockpit/now.md')} — describe your current focus`);
  console.log(`  ${c.cyan('2.')} edit ${c.gray('cockpit/roadmap.md')} — fill the Next 3 to ship`);
  console.log(`  ${c.cyan('3.')} edit ${c.gray('cockpit/state.json')} — fill current_phase / next_phase / next_prompt`);
  console.log(`  ${c.cyan('4.')} draft your first session prompt :`);
  console.log(`     ${c.gray('npx cockpit new prompt --slug my-first-session')}`);
  console.log(`  ${c.cyan('5.')} validate before push :`);
  console.log(`     ${c.gray('npx cockpit check')}`);
  console.log('');
  console.log(c.gray('full protocol → cockpit/README.md'));
  console.log('');
}
