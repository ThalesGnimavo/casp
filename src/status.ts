/**
 * `cockpit status` — read-only one-screen snapshot.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { c, git, loadState, readFrontmatter, setColor } from './shared.js';

const ROOT = process.cwd();
const STATE = join(ROOT, 'cockpit', 'state.json');
const NOW = join(ROOT, 'cockpit', 'now.md');
const ROADMAP = join(ROOT, 'cockpit', 'roadmap.md');

function section(label: string, body: string): void {
  console.log('');
  console.log(c.bold(label));
  console.log(c.gray('─'.repeat(Math.max(label.length, 40))));
  console.log(body);
}

export function runStatus(args: string[]): void {
  if (args.includes('--plain')) setColor(false);

  if (!existsSync(STATE)) {
    console.error(c.red('no cockpit/state.json found'));
    console.error(c.gray('  → run `npx cockpit init` first'));
    process.exit(1);
  }
  const state = loadState(STATE);
  if (!state) {
    console.error(c.red('cockpit/state.json is not valid JSON'));
    process.exit(1);
  }

  const head = git('rev-parse --short HEAD') || '(no git)';
  const branch = git('rev-parse --abbrev-ref HEAD') || '(no git)';
  const dirty = git('status --short');
  const ahead = git('rev-list --count @{u}..HEAD').trim();
  const log10 = git('log --oneline -10');

  let pkgName = 'cockpit-managed-project';
  let pkgVersion = '';
  const pkgPath = join(ROOT, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        name?: string;
        version?: string;
      };
      pkgName = pkg.name ?? pkgName;
      pkgVersion = pkg.version ? `@${pkg.version}` : '';
    } catch {
      /* ignore */
    }
  }

  console.log('');
  console.log(
    c.bold(`${pkgName}${pkgVersion}`) +
      ` · branch ${c.cyan(branch)} · HEAD ${c.cyan(head)}`
  );
  if (dirty) {
    const lines = dirty.split('\n').length;
    console.log(
      c.yellow(`  ⚠ working tree has ${lines} uncommitted file${lines > 1 ? 's' : ''}`)
    );
  }
  if (ahead && ahead !== '0') {
    console.log(
      c.yellow(`  ⚠ ${ahead} commit${ahead === '1' ? '' : 's'} ahead of upstream`)
    );
  }

  const summary = [
    `  current_phase    ${c.cyan(String(state.current_phase ?? '-'))}`,
    `  next_phase       ${c.cyan(String(state.next_phase ?? '-'))}`,
    `  next_prompt      ${c.cyan(String(state.next_prompt ?? '-'))}`,
    `  last_session_id  ${c.gray(String(state.last_session_id ?? '-'))}`,
    `  last_commit      ${c.gray(String(state.last_commit ?? '-'))}`
  ].join('\n');
  section('STATE', summary);

  const nextPromptPath = state.next_prompt ? join(ROOT, String(state.next_prompt)) : null;
  if (nextPromptPath && existsSync(nextPromptPath)) {
    const fm = readFrontmatter(nextPromptPath);
    const status = fm ? String(fm.status ?? '?') : '(no frontmatter)';
    const sessionLog = fm ? String(fm.session_log ?? 'pending') : '?';
    const statusColor =
      status === 'shipped'
        ? c.red(status)
        : status === 'queued'
          ? c.green(status)
          : c.yellow(status);
    const body = [
      `  path     ${c.cyan(String(state.next_prompt))}`,
      `  status   ${statusColor}`,
      `  log      ${c.gray(sessionLog)}`
    ].join('\n');
    section('NEXT PROMPT', body);

    const raw = readFileSync(nextPromptPath, 'utf8');
    const afterFm = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
    const lines = afterFm.split('\n').slice(0, 8);
    for (const l of lines) {
      if (!l.trim()) continue;
      console.log(c.gray('  ' + l.slice(0, 100)));
    }
  } else if (state.next_prompt) {
    section(
      'NEXT PROMPT',
      c.red(`  ✗ ${state.next_prompt} does not exist on disk`)
    );
  }

  if (log10) {
    section(
      'RECENT COMMITS',
      log10
        .split('\n')
        .map((l) => `  ${l}`)
        .join('\n')
    );
  }

  if (existsSync(NOW)) {
    const raw = readFileSync(NOW, 'utf8');
    const m = raw.match(/## Current focus[^\n]*\n\n([\s\S]*?)(?:\n---|\n##)/);
    if (m) {
      const focus = m[1].trim().split('\n').slice(0, 4).join('\n');
      section(
        'CURRENT FOCUS',
        focus
          .split('\n')
          .map((l) => `  ${l}`)
          .join('\n')
      );
    }
  }

  if (existsSync(ROADMAP)) {
    const raw = readFileSync(ROADMAP, 'utf8');
    const m = raw.match(/## Now — Next 3[^\n]*\n([\s\S]*?)(?:\n---|\n## )/);
    if (m) {
      const block = m[1]
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .slice(0, 8)
        .map((l) => '  ' + l.slice(0, 140))
        .join('\n');
      section('NEXT 3', block);
    }
  }

  console.log('');
  console.log(
    c.gray('run `npx cockpit check` to validate, `npx cockpit status` to refresh')
  );
  console.log('');
}
