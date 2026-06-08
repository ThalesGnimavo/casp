/**
 * `casp next` — print the next session's prompt, straight from state.next_prompt.
 *
 * The CLI analogue of the `/next` slash-command: it resolves the canonical next
 * move from casp/state.json and emits the prompt so a human (or an agent piping
 * the output) can start executing immediately — no copy-paste, no guessing.
 *
 * Exits non-zero when there is no actionable next prompt, so it composes safely
 * in scripts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';
import { c, loadState, readFrontmatter } from './shared.js';

const ROOT = process.cwd();
const STATE = join(ROOT, 'casp', 'state.json');

export function runNext(_args: string[]): void {
  if (!existsSync(STATE)) {
    console.error(c.red('no casp/state.json found'));
    console.error(c.gray('  → run `npx casp init` first'));
    exit(1);
  }
  const state = loadState(STATE);
  if (!state) {
    console.error(c.red('casp/state.json is not valid JSON'));
    exit(1);
  }

  const nextPrompt = state.next_prompt ? String(state.next_prompt) : '';
  if (!nextPrompt) {
    console.error(c.yellow('state.next_prompt is empty.'));
    console.error(c.gray('  → set it in casp/state.json, or draft one: `npx casp new prompt --slug <slug>`'));
    exit(1);
  }

  const path = join(ROOT, nextPrompt);
  if (!existsSync(path)) {
    console.error(c.red(`state.next_prompt points at a missing file: ${nextPrompt}`));
    console.error(c.gray('  → `npx casp check` will flag this. Fix state.next_prompt or draft the prompt.'));
    exit(1);
  }

  const fm = readFrontmatter(path);
  const status = fm ? String(fm.status ?? '?') : '(no frontmatter)';
  if (status === 'shipped') {
    console.error(
      c.red(`next_prompt is already SHIPPED: ${nextPrompt}`)
    );
    console.error(
      c.gray('  → casp was not bumped after that session. Run `npx casp check` and reconcile before starting.')
    );
    exit(1);
  }

  // Header to stderr (human context), prompt body to stdout (pipe-friendly).
  console.error(c.bold(`next prompt`) + ` · ${c.cyan(nextPrompt)} · status ${c.green(status)}`);
  console.error(c.gray('─'.repeat(70)));
  process.stdout.write(readFileSync(path, 'utf8'));
  exit(0);
}
