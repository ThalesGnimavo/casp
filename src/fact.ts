/**
 * `casp fact list|check|verify|stale` — the facts-layer verbs.
 *
 * One syllable, read-only by default — same grammar as the rest of the CLI.
 * `verify` is the sole exception and the one deliberate code-execution surface
 * in this binary: it replays the fact's declared `method` (a shell command the
 * project itself wrote into casp/facts.json — repository content, therefore
 * untrusted). It asks TWICE, and the order is load-bearing: `run this command?`
 * BEFORE executing, then `write this fact?` once the before/after is on screen.
 * With no TTY it refuses outright; `--yes` is the only bypass. Nothing else in
 * CASP ever executes repository content, and no gate ever calls this — see
 * docs/threat-model.md.
 *
 *   casp fact list [--json]         inventory, with each fact's freshness
 *   casp fact check [--json]        FACT-only subset of `casp check`
 *   casp fact verify <id> [--yes]   replay method, show before/after, confirm, write
 *   casp fact stale [--json]        facts that are expired or drifted — the work list
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { exit, stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { c, fileHash, git, todayISO } from './shared.js';
import { ruleFor } from './rules.js';
import { checkOneSafe, printReport, summarize } from './check.js';
import { analyzeFacts, loadFacts, saveFacts, type FactCheck } from './facts.js';

function factsPath(root: string): string {
  return join(root, 'casp', 'facts.json');
}

function fail(msg: string, hint?: string): never {
  console.error(c.red(msg));
  if (hint) console.error(c.gray(`  → ${hint}`));
  exit(1);
}

function statusOf(check: FactCheck): { label: string; ok: boolean } {
  const stale = check.ttl.severity !== 'pass' || (check.hash.applicable && check.hash.ok === false) || !check.source.ok || check.trap.hit;
  return { label: stale ? 'STALE' : 'fresh', ok: !stale };
}

function runList(root: string, json: boolean): void {
  const path = factsPath(root);
  const file = loadFacts(path);
  if (!file) fail('no readable casp/facts.json found', 'declare a fact first — see docs/rules.md#the-facts-layer');
  const analysis = analyzeFacts(root, path);
  const checks = analysis.adopted && !analysis.malformed ? analysis.checks : [];
  const byId = new Map(file.facts.map((f) => [f.id, f]));

  if (json) {
    console.log(
      JSON.stringify(
        checks.map((c) => ({
          id: c.id,
          value: byId.get(c.id)?.value ?? null,
          source: byId.get(c.id)?.source ?? null,
          verified_at: byId.get(c.id)?.verified_at ?? null,
          fresh: statusOf(c).ok
        })),
        null,
        2
      )
    );
    exit(0);
  }

  console.log('');
  console.log(c.bold(`casp fact list · ${checks.length} fact(s)`));
  console.log(c.gray('─'.repeat(70)));
  for (const check of checks) {
    const f = byId.get(check.id);
    const { label, ok } = statusOf(check);
    const tag = ok ? c.green(label) : c.yellow(label);
    console.log(`  ${tag}  ${c.bold(check.id)}  ${c.gray(f?.value ?? '')}`);
    console.log(`        ${c.gray(`source: ${f?.source ?? ''} · verified_at: ${f?.verified_at ?? ''}`)}`);
  }
  console.log('');
  exit(0);
}

function runCheckSubset(root: string, json: boolean): void {
  const findings = checkOneSafe(root).filter((f) => (ruleFor(f.id)?.area ?? '') === 'FACT');
  const { fail: failCount } = summarize(findings);
  if (json) {
    console.log(
      JSON.stringify(
        {
          summary: summarize(findings),
          findings: findings.map((f) => ({ ...f, rule: ruleFor(f.id)?.code ?? null }))
        },
        null,
        2
      )
    );
    exit(failCount > 0 ? 1 : 0);
  }
  if (findings.length === 0) {
    console.log('');
    console.log(c.gray('no casp/facts.json — the facts layer is not adopted here'));
    console.log('');
    exit(0);
  }
  printReport(findings, false);
  exit(failCount > 0 ? 1 : 0);
}

function runStale(root: string, json: boolean): void {
  const path = factsPath(root);
  const analysis = analyzeFacts(root, path);
  const checks = analysis.adopted && !analysis.malformed ? analysis.checks : [];
  const stale = checks.filter((c) => !statusOf(c).ok);

  if (json) {
    console.log(JSON.stringify(stale.map((c) => ({ id: c.id, reasons: reasonsFor(c) })), null, 2));
    exit(stale.length > 0 ? 1 : 0);
  }

  console.log('');
  console.log(c.bold(`casp fact stale · ${stale.length} of ${checks.length} fact(s)`));
  console.log(c.gray('─'.repeat(70)));
  for (const c2 of stale) {
    console.log(`  ${c.yellow('STALE')}  ${c.bold(c2.id)}`);
    for (const reason of reasonsFor(c2)) console.log(`        ${c.gray('· ' + reason)}`);
  }
  console.log('');
  exit(stale.length > 0 ? 1 : 0);
}

function reasonsFor(check: FactCheck): string[] {
  const reasons: string[] = [];
  if (!check.source.ok) reasons.push(check.source.detail);
  if (check.hash.applicable && check.hash.ok === false) reasons.push(check.hash.detail);
  if (check.ttl.severity !== 'pass') reasons.push(check.ttl.detail);
  if (check.trap.hit) reasons.push(check.trap.detail);
  return reasons;
}

/**
 * Ask a yes/no question on a TTY. Returns false on anything but an explicit yes.
 *
 * With no TTY there is nobody to ask, so this never silently proceeds: it fails
 * with `refusal` and exits non-zero. `--yes` is the only way through in CI, and
 * it has to be typed on purpose.
 */
async function confirm(question: string, refusal: string): Promise<boolean> {
  if (!stdin.isTTY) fail(refusal, 'pass --yes to confirm');
  const rl = createInterface({ input: stdin, output: stdout });
  let answer: string;
  try {
    answer = (await rl.question(question)).trim().toLowerCase();
  } catch {
    // Ctrl+D (or any aborted read) is a person declining, not a crash. Node
    // rejects the pending question with an AbortError; treat it as "no" so the
    // caller aborts cleanly instead of printing a stack trace over the prompt.
    return false;
  } finally {
    rl.close();
  }
  return answer === 'y' || answer === 'yes';
}

async function runVerify(root: string, id: string, yes: boolean): Promise<void> {
  const path = factsPath(root);
  const file = loadFacts(path);
  if (!file) fail('no readable casp/facts.json found');
  const fact = file.facts.find((f) => f.id === id);
  if (!fact) fail(`no fact '${id}' in casp/facts.json`, `known ids: ${file.facts.map((f) => f.id).join(', ') || '(none)'}`);
  if (!fact.method || !fact.method.trim()) {
    fail(`fact '${id}' has no method recorded`, 'a method is required to replay the verification — record one first');
  }

  console.log('');
  console.log(c.bold(`casp fact verify ${id}`));
  console.log(c.gray('─'.repeat(70)));
  console.log(`  ${c.cyan('method')}  ${fact.method}`);

  // SECURITY GATE — this must stay ABOVE the execSync below.
  //
  // `method` is repository content: casp/facts.json may have been written by an
  // autonomous agent, or arrived with a repo someone cloned. Running it is the
  // one deliberate code-execution surface in this binary, so the operator has to
  // agree to it BEFORE it runs, not after. An earlier revision executed first and
  // only then asked "write this fact?" — which read as consent but gated the
  // write, so the command had already run by the time anyone was asked, even with
  // no TTY and no --yes. See docs/threat-model.md.
  if (!yes) {
    const agreed = await confirm(
      `  ${c.bold('run this command?')} ${c.gray('it comes from casp/facts.json')} ${c.gray('[y/N]')} `,
      'refusing to run a fact method without confirmation in a non-interactive shell',
    );
    if (!agreed) {
      console.log(c.gray('  aborted — nothing run, nothing written'));
      exit(0);
    }
  }

  console.log(c.gray('  running…'));

  let stdout_: string;
  try {
    stdout_ = execSync(fact.method, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
  } catch (err) {
    fail(`method failed: ${(err as Error).message}`);
  }

  const isExternal = fact.source.startsWith('external:');
  const sourceAbs = join(root, fact.source);
  const newHash = !isExternal && existsSync(sourceAbs) ? fileHash(sourceAbs) : null;

  console.log('');
  console.log(`  ${c.bold('before')}  value: ${c.gray(fact.value)}`);
  console.log(`           hash:  ${c.gray(fact.source_hash ?? '(none)')}`);
  console.log(`           at:    ${c.gray(fact.verified_at ?? '(never)')}`);
  console.log(`  ${c.bold('after')}   value: ${c.green(stdout_)}`);
  console.log(`           hash:  ${c.green(newHash ?? '(external — no hash)')}`);
  console.log(`           at:    ${c.green(todayISO())}`);
  console.log('');

  // Data gate — separate from the security gate above and deliberately kept.
  // The first prompt agrees to RUN the command; this one agrees to persist the
  // value it produced, which is the first moment anyone can actually see it.
  if (!yes) {
    const agreed = await confirm(
      `  write this fact? ${c.gray('[y/N]')} `,
      'refusing to write without confirmation in a non-interactive shell',
    );
    if (!agreed) {
      console.log(c.gray('  aborted — nothing written'));
      exit(0);
    }
  }

  fact.value = stdout_;
  if (newHash) fact.source_hash = newHash;
  fact.verified_at = todayISO();
  const head = git('rev-parse --short HEAD', root);
  if (head) fact.verified_commit = head;
  saveFacts(path, file);

  console.log(`  ${c.green('✓')} fact '${id}' verified and written`);
  console.log('');
  exit(0);
}

export async function runFact(args: string[]): Promise<void> {
  const root = process.cwd();
  const [verb, ...rest] = args;
  const json = rest.includes('--json');
  const yes = rest.includes('--yes') || rest.includes('-y');

  switch (verb) {
    case 'list':
      runList(root, json);
      break;
    case 'check':
      runCheckSubset(root, json);
      break;
    case 'stale':
      runStale(root, json);
      break;
    case 'verify': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) fail('casp fact verify <id> — id is required');
      await runVerify(root, id, yes);
      break;
    }
    default:
      console.error(c.red(`unknown \`casp fact\` verb: '${verb ?? ''}'`));
      console.error(c.gray('  → one of: list | check | verify <id> | stale'));
      exit(1);
  }
}
