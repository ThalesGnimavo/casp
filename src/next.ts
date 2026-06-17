/**
 * `casp next` — print the next session's prompt, straight from state.next_prompt.
 *
 * The CLI analogue of the `/next` slash-command: it resolves the canonical next
 * move from casp/state.json and emits the prompt so a human (or an agent piping
 * the output) can start executing immediately — no copy-paste, no guessing.
 *
 * Exits non-zero when there is no actionable next prompt, so it composes safely
 * in scripts.
 *
 * The PRE-SESSION GATE: before printing, `next` runs the validator in-process
 * (the same `checkOne` the `check` verb uses — never shells out to itself) and
 * REFUSES on drift — drift summary to stderr, no prompt on stdout, exit 1. This
 * closes the START boundary symmetrically with `install-hook`'s push boundary:
 * a harness can't auto-advance into the next session on top of a lying state.
 * `--no-check` is the explicit escape hatch; `next` never RUNS anything after
 * printing — it stays a printer, not a runner (anti-roadmap).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';
import { c, loadState, readFrontmatter } from './shared.js';
import { checkOne, summarize } from './check.js';

const ROOT = process.cwd();
const STATE = join(ROOT, 'casp', 'state.json');

export function runNext(args: string[]): void {
  const noCheck = args.includes('--no-check');
  const noGit = args.includes('--no-git');

  if (!existsSync(STATE)) {
    console.error(c.red('no casp/state.json found'));
    console.error(c.gray('  → run `npx @justethales/casp init` first'));
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
    console.error(c.gray('  → set it in casp/state.json, or draft one: `npx @justethales/casp new prompt --slug <slug>`'));
    exit(1);
  }

  const path = join(ROOT, nextPrompt);
  if (!existsSync(path)) {
    console.error(c.red(`state.next_prompt points at a missing file: ${nextPrompt}`));
    console.error(c.gray('  → `npx @justethales/casp check` will flag this. Fix state.next_prompt or draft the prompt.'));
    exit(1);
  }

  const fm = readFrontmatter(path);
  const status = fm ? String(fm.status ?? '?') : '(no frontmatter)';
  if (status === 'shipped') {
    console.error(
      c.red(`next_prompt is already SHIPPED: ${nextPrompt}`)
    );
    console.error(
      c.gray('  → casp was not bumped after that session. Run `npx @justethales/casp check` and reconcile before starting.')
    );
    exit(1);
  }

  // PRE-SESSION GATE — refuse to hand out the next prompt on a drifted state,
  // unless explicitly waived. Run the validator in-process and block on any FAIL.
  // (Missing-file / shipped-prompt drift is already caught above with sharper
  // messages; this catches the rest — stale last_commit, unmappable claims, etc.)
  if (!noCheck) {
    const findings = checkOne(ROOT, { noGit });
    const { fail } = summarize(findings);
    if (fail > 0) {
      console.error(c.red(`✗ state has drifted — refusing to start the next session.`));
      for (const f of findings) {
        if (f.severity !== 'fail') continue;
        console.error(`  ${c.red('FAIL')} ${f.label}${f.detail ? c.gray(` · ${f.detail}`) : ''}`);
        if (f.fix) console.error(`         ${c.cyan('→')} ${c.gray(f.fix)}`);
      }
      console.error('');
      console.error(c.gray('  → run `casp check` to see the full report, reconcile the state, then retry.'));
      console.error(c.gray('  → or `casp next --no-check` to start anyway (you own the drift).'));
      exit(1);
    }
  }

  // Header to stderr (human context), prompt body to stdout (pipe-friendly).
  console.error(c.bold(`next prompt`) + ` · ${c.cyan(nextPrompt)} · status ${c.green(status)}`);
  console.error(c.gray('─'.repeat(70)));
  process.stdout.write(readFileSync(path, 'utf8'));
  exit(0);
}
