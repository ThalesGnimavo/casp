/**
 * `casp rules` and `casp explain <CODE>` — make the verification rules a
 * first-class, inspectable surface. Both are read-only and always deterministic:
 * `rules` lists the catalogue, `explain` prints one rule's full definition. No
 * gating (exit 0 on success), no network, no LLM.
 */

import { exit } from 'node:process';
import { c } from './shared.js';
import { RULES, resolveRule, type Rule } from './rules.js';

function renderRule(r: Rule): string {
  return [
    '',
    `${c.bold(r.code)} — ${r.title}`,
    c.gray('─'.repeat(70)),
    `${c.cyan('area')}         ${r.area}`,
    `${c.cyan('verifies')}     ${r.verifies}`,
    `${c.cyan('evidence')}     ${r.evidence}`,
    `${c.cyan('remediation')}  ${r.remediation}`,
    ''
  ].join('\n');
}

/** `casp explain <CODE|finding-id>`. Exit 0 for a known rule, 1 otherwise. */
export function runExplain(args: string[]): void {
  const query = args.find((a) => !a.startsWith('-'));
  const json = args.includes('--json');
  if (!query) {
    console.error(c.red('FAIL') + ' casp explain needs a rule code');
    console.error(c.gray('  → e.g. casp explain CASP-GIT-001   (list them with `casp rules`)'));
    exit(1);
  }
  const rule = resolveRule(query);
  if (!rule) {
    console.error(c.red('FAIL') + ` no rule matches '${query}'`);
    console.error(c.gray('  → list every rule with `casp rules`'));
    exit(1);
  }
  if (json) {
    const { matches, ...data } = rule;
    void matches;
    console.log(JSON.stringify(data, null, 2));
    exit(0);
  }
  console.log(renderRule(rule));
  exit(0);
}

/** `casp rules [--json]`. The full catalogue; always exit 0. */
export function runRules(args: string[]): void {
  const json = args.includes('--json');
  if (json) {
    console.log(
      JSON.stringify(
        RULES.map(({ matches, ...data }) => {
          void matches;
          return data;
        }),
        null,
        2
      )
    );
    exit(0);
  }
  console.log('');
  console.log(c.bold('casp rules') + c.gray(` · ${RULES.length} verification rules`));
  console.log(c.gray('─'.repeat(70)));
  const w = Math.max(...RULES.map((r) => r.code.length));
  for (const r of RULES) {
    console.log(`  ${c.cyan(r.code.padEnd(w))}  ${r.title}`);
  }
  console.log('');
  console.log(c.gray('  → `casp explain <CODE>` for one rule’s full definition'));
  console.log('');
  exit(0);
}
