/**
 * `casp init` — scaffold a casp/ directory in the current repo.
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
import { c, pkgVersion, todayISO } from './shared.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES = join(__dirname, '..', 'templates');

function copyDir(src: string, dest: string, force: boolean): void {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (entry === '.DS_Store') continue; // never scaffold Finder junk into a user's repo
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
  const target = join(root, 'casp');

  if (existsSync(target) && !force) {
    console.log(c.yellow(`casp/ already exists at ${target}`));
    console.log(c.gray('use --force to overwrite, or edit the existing files'));
    exit(0);
  }

  console.log(`${c.bold('casp init')} · scaffolding ${c.cyan(relative(root, target) || 'casp/')}`);
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
    if (existsSync(f)) interpolate(f, { TODAY: today, VERSION: pkgVersion() });
  }

  // Scaffold the first session prompt that state.next_prompt points at, plus
  // the session dirs, so a fresh `casp init` is immediately green under
  // `casp check` instead of FAILing on a missing next_prompt file. Idempotent:
  // never overwrites an existing prompt.
  const sessionsDir = join(root, 'docs', 'plan', 'sessions');
  mkdirSync(sessionsDir, { recursive: true });
  mkdirSync(join(root, 'session-logs'), { recursive: true });
  const firstPrompt = join(sessionsDir, 'PHASE-1-FIRST-SLICE.md');
  const promptTpl = join(TEMPLATES, 'templates', 'session-prompt.md');
  if (!existsSync(firstPrompt) && existsSync(promptTpl)) {
    const out = readFileSync(promptTpl, 'utf8')
      .split('YYYY-MM-DD')
      .join(today)
      .split('<id>-<slug>')
      .join('phase-1-first-slice');
    writeFileSync(firstPrompt, out);
    console.log(`  ${c.green('write')}   ${relative(root, firstPrompt)}`);
  }

  console.log('');
  console.log(c.green('✓ casp scaffolded.'));
  console.log('');
  console.log('Next steps :');
  console.log(`  ${c.cyan('1.')} edit ${c.gray('casp/now.md')} — describe your current focus`);
  console.log(`  ${c.cyan('2.')} edit ${c.gray('casp/roadmap.md')} — fill the Next 3 to ship`);
  console.log(`  ${c.cyan('3.')} edit ${c.gray('casp/state.json')} — fill current_phase / next_phase / next_prompt`);
  console.log(`  ${c.cyan('4.')} edit your first session prompt :`);
  console.log(`     ${c.gray('docs/plan/sessions/PHASE-1-FIRST-SLICE.md')}`);
  console.log(`  ${c.cyan('5.')} validate (green out of the box) :`);
  console.log(`     ${c.gray('npx @justethales/casp check')}`);
  console.log('');
  console.log(c.gray('full protocol → casp/README.md'));
  console.log('');
}
