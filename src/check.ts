/**
 * `casp check` — validate state.json against filesystem + git + prompt frontmatter.
 *
 * The wedge of the whole protocol: everyone STORES state, CASP VALIDATES it
 * against git ground-truth. Exits 1 on any FAIL so it works as a real CI status
 * check / pre-push gate — not a decorative log. Use --quiet to suppress PASS
 * lines (CI-friendly). Use --json for a machine-readable report (stable schema,
 * documented in docs/check-json.md) — same checks, same exit code, different
 * format only.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { exit } from 'node:process';
import { c, git, loadState, pkgVersion, readFrontmatter } from './shared.js';

const ROOT = process.cwd();
const STATE_PATH = join(ROOT, 'casp', 'state.json');
const SESSIONS_DIR = join(ROOT, 'docs', 'plan', 'sessions');
const LOGS_DIR = join(ROOT, 'session-logs');

type Severity = 'pass' | 'warn' | 'fail';

// A claim's backing path must be a real directory — a file squatting the path
// is just as unverifiable as a missing dir (and crashes readdirSync).
function isDir(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}
interface Finding {
  id: string;
  severity: Severity;
  label: string;
  detail: string;
  fix?: string;
}

/**
 * The stable `--json` report contract (documented in docs/check-json.md).
 * `schema_version` only bumps on a breaking change to this shape — additive
 * fields do not bump it. The verdict logic is shared with the human report;
 * `--json` changes the format, never the outcome.
 */
const JSON_SCHEMA_VERSION = 1;

function emitJson(findings: Finding[]): never {
  const summary = {
    pass: findings.filter((f) => f.severity === 'pass').length,
    warn: findings.filter((f) => f.severity === 'warn').length,
    fail: findings.filter((f) => f.severity === 'fail').length
  };
  const exitCode = summary.fail > 0 ? 1 : 0;
  console.log(
    JSON.stringify(
      {
        schema_version: JSON_SCHEMA_VERSION,
        casp_version: pkgVersion(),
        verdict: exitCode === 0 ? 'clean' : 'drift',
        exit_code: exitCode,
        summary,
        findings: findings.map((f) => ({
          id: f.id,
          severity: f.severity,
          label: f.label,
          detail: f.detail,
          fix: f.fix ?? null
        }))
      },
      null,
      2
    )
  );
  exit(exitCode);
}

export function runCheck(args: string[]): void {
  const json = args.includes('--json');
  const quiet = args.includes('--quiet');
  const noGit = args.includes('--no-git');

  const findings: Finding[] = [];
  function record(
    id: string,
    severity: Severity,
    label: string,
    detail: string,
    fix?: string
  ): void {
    findings.push({ id, severity, label, detail, fix });
  }

  if (!existsSync(STATE_PATH)) {
    record(
      'state.file',
      'fail',
      'no casp/state.json found',
      STATE_PATH,
      'run `npx @justethales/casp init` first'
    );
    if (json) emitJson(findings);
    console.error(c.red('FAIL') + ` no casp/state.json found at ${STATE_PATH}`);
    console.error(c.gray('       → run `npx @justethales/casp init` first'));
    exit(1);
  }
  const state = loadState(STATE_PATH);
  if (!state) {
    record(
      'state.file',
      'fail',
      'casp/state.json is not valid JSON',
      STATE_PATH,
      'fix the JSON syntax (a trailing comma or unquoted key, usually)'
    );
    if (json) emitJson(findings);
    console.error(c.red('FAIL') + ' casp/state.json is not valid JSON');
    exit(1);
  }

  /* 1. Required keys ----------------------------------------------------- */

  // Keys that must be present AND non-null.
  const requiredNonNull = [
    'updated_at',
    'last_session_id',
    'last_commit',
    'current_phase',
    'phases_shipped'
  ] as const;
  for (const key of requiredNonNull) {
    if (state[key] === undefined || state[key] === null) {
      record(
        `state.shape.${key}`,
        'fail',
        'state.json missing required key',
        `key '${key}' is missing`,
        `add "${key}": <value> to casp/state.json`
      );
    } else {
      record(`state.shape.${key}`, 'pass', `state.json has '${key}'`, '');
    }
  }

  // next_phase / next_prompt MUST be present as keys, but may be null — a
  // project can legitimately have no queued next slice (parked, launch hold,
  // roadmap complete). The key being absent is still a shape error; an explicit
  // null is a valid "parked" state, not drift.
  for (const key of ['next_phase', 'next_prompt'] as const) {
    if (!(key in state)) {
      record(
        `state.shape.${key}`,
        'fail',
        'state.json missing required key',
        `key '${key}' is missing`,
        `add "${key}": null to casp/state.json (use null when there is no queued next slice)`
      );
    } else if (state[key] === null) {
      record(
        `state.shape.${key}`,
        'pass',
        `state.json '${key}' is null (parked — no queued next slice)`,
        ''
      );
    } else {
      record(`state.shape.${key}`, 'pass', `state.json has '${key}'`, '');
    }
  }

  /* 2. next_prompt resolves --------------------------------------------- */

  if (state.next_prompt) {
    const path = join(ROOT, state.next_prompt);
    if (!existsSync(path)) {
      record(
        'next_prompt.exists',
        'fail',
        'state.json.next_prompt points at a missing file',
        `${state.next_prompt} does not exist`,
        `draft the prompt at that path (try \`npx @justethales/casp new prompt --slug <slug>\`) OR fix state.json.next_prompt`
      );
    } else {
      record(
        'next_prompt.exists',
        'pass',
        'next_prompt file exists',
        state.next_prompt
      );

      const fm = readFrontmatter(path);
      if (!fm) {
        record(
          'next_prompt.frontmatter',
          'fail',
          'next_prompt has no frontmatter',
          `${state.next_prompt} should start with --- ... ---`,
          `add status / session_id / drafted_at frontmatter`
        );
      } else {
        const status = String(fm.status ?? '');
        if (status === 'shipped') {
          record(
            'next_prompt.status',
            'fail',
            'next_prompt is already SHIPPED',
            `${state.next_prompt} has status: shipped — casp was not bumped after that session`,
            `either update state.json.next_prompt to the real next slice, or re-execute the shipped prompt explicitly`
          );
        } else if (status === 'queued' || status === 'in-progress') {
          record(
            'next_prompt.status',
            'pass',
            `next_prompt status is '${status}'`,
            state.next_prompt
          );
        } else {
          record(
            'next_prompt.status',
            'warn',
            'next_prompt has unusual status',
            `status='${status}' — expected 'queued' or 'in-progress'`,
            `set status: queued in the prompt frontmatter`
          );
        }
      }
    }
  }

  /* 3. last_session_id → log -------------------------------------------- */

  // A state claim must be verifiable or the check FAILs — a check that cannot
  // find what it needs never reports green. A placeholder ('pending', fresh
  // init) is not a claim: WARN, consistent with last_commit='pending'.
  if (state.last_session_id === 'pending') {
    record(
      'last_session.log_exists',
      'warn',
      "last_session_id is 'pending'",
      'expected before the first session closes',
      'set last_session_id when the first session log is written'
    );
  } else if (
    typeof state.last_session_id === 'string' &&
    state.last_session_id.trim() === ''
  ) {
    // Empty string is neither a session id nor the 'pending' placeholder —
    // treating it as "no claim" would be a silent green.
    record(
      'last_session.id_empty',
      'fail',
      'last_session_id is empty',
      `'' is neither a session id nor the 'pending' placeholder`,
      "set last_session_id to the real session id (or 'pending' before the first session)"
    );
  } else if (state.last_session_id) {
    if (!isDir(LOGS_DIR)) {
      record(
        'last_session.logs_dir',
        'fail',
        'cannot verify last_session_id: session-logs/ is not a directory',
        `state claims session ${state.last_session_id} but session-logs/ is missing (or not a directory)`,
        'create session-logs/ and write the log OR fix last_session_id'
      );
    } else {
      const logPath = join(LOGS_DIR, `${state.last_session_id}.md`);
      if (existsSync(logPath)) {
        record(
          'last_session.log_exists',
          'pass',
          'last_session_id has a matching session log',
          `session-logs/${state.last_session_id}.md`
        );
      } else {
        record(
          'last_session.log_exists',
          'fail',
          'last_session_id does not map to a session log',
          `expected session-logs/${state.last_session_id}.md`,
          `write the session log (try \`npx @justethales/casp new log --slug <slug>\`) OR fix last_session_id`
        );
      }
    }
  }

  /* 3b. phases_shipped claims a history → its dirs must exist ------------ */

  if (Array.isArray(state.phases_shipped) && state.phases_shipped.length > 0) {
    const historyDirs: Array<[string, string, string]> = [
      [SESSIONS_DIR, 'docs/plan/sessions/', 'sessions_dir'],
      [LOGS_DIR, 'session-logs/', 'logs_dir']
    ];
    for (const [dir, name, key] of historyDirs) {
      if (!isDir(dir)) {
        record(
          `shipped_history.${key}`,
          'fail',
          `cannot verify shipped history: ${name} not found`,
          `state claims ${state.phases_shipped.length} shipped phase(s) but ${name} is missing (or not a directory)`,
          `create ${name} (the protocol's prompts and logs live there) OR empty phases_shipped`
        );
      }
    }
  }

  /* 4. last_commit vs git ----------------------------------------------- */

  if (!noGit && state.last_commit && state.last_commit !== 'pending') {
    const head = git('rev-parse --short HEAD');
    if (!head) {
      record('last_commit.git', 'warn', 'cannot run git', 'is this a repo?');
    } else if (
      head.startsWith(state.last_commit) ||
      state.last_commit.startsWith(head)
    ) {
      record(
        'last_commit.git',
        'pass',
        'last_commit matches HEAD',
        `state=${state.last_commit} HEAD=${head}`
      );
    } else {
      const exists = git(`rev-parse --verify ${state.last_commit}^{commit}`);
      if (exists) {
        // The canonical close loop ends with a state-bump commit: the session
        // is committed, last_commit is set to that SHA, and the bump itself is
        // committed — moving HEAD one past last_commit. That is not drift.
        // PASS when last_commit is the parent of HEAD and HEAD touches only
        // the state surface; anything else stays WARN.
        const parent = git('rev-parse --short HEAD^');
        const isParent =
          parent.length > 0 &&
          (parent.startsWith(state.last_commit) ||
            state.last_commit.startsWith(parent));
        const touched = git('diff-tree --no-commit-id --name-only -r HEAD')
          .split('\n')
          .filter(Boolean);
        const STATE_SURFACE = ['casp/', 'docs/plan/sessions/', 'session-logs/'];
        const bumpOnly =
          touched.length > 0 &&
          touched.every((f) => STATE_SURFACE.some((p) => f.startsWith(p)));
        if (isParent && bumpOnly) {
          record(
            'last_commit.git',
            'pass',
            'last_commit is the parent of HEAD (state-bump commit)',
            `state=${state.last_commit} HEAD=${head} touches only the state surface`
          );
        } else {
          record(
            'last_commit.git',
            'warn',
            'last_commit is in history but not at HEAD',
            `state=${state.last_commit} HEAD=${head}`,
            `if the new commits are out-of-band work, bump state.last_commit to ${head}`
          );
        }
      } else {
        record(
          'last_commit.git',
          'fail',
          'last_commit not found in git',
          `state=${state.last_commit} does not exist in this repo`,
          `set state.last_commit to a real SHA (HEAD = ${head})`
        );
      }
    }
  } else if (state.last_commit === 'pending') {
    record(
      'last_commit.git',
      'warn',
      "last_commit is 'pending'",
      'expected after first commit of session, before push',
      'bump state.last_commit to the commit SHA before push'
    );
  }

  /* 5. phases_shipped uniqueness ---------------------------------------- */

  if (Array.isArray(state.phases_shipped)) {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const p of state.phases_shipped) {
      if (seen.has(p)) dupes.push(p);
      seen.add(p);
    }
    if (dupes.length) {
      record(
        'phases_shipped.unique',
        'fail',
        'phases_shipped has duplicates',
        dupes.join(', '),
        'dedupe the array'
      );
    } else {
      record(
        'phases_shipped.unique',
        'pass',
        `phases_shipped is unique (${state.phases_shipped.length} entries)`,
        ''
      );
    }
  }

  /* 6. migrations_applied (optional) ------------------------------------- */

  const migrationsDir = join(ROOT, state.migrations_dir || 'drizzle');
  const migrationsClaimed =
    Array.isArray(state.migrations_applied) &&
    state.migrations_applied.length > 0;
  if (migrationsClaimed && !isDir(migrationsDir)) {
    // The canonical false-green: state claims applied migrations, the dir is
    // gone — the old behavior silently skipped and reported green.
    record(
      'migrations.dir',
      'fail',
      `cannot verify migrations_applied: ${state.migrations_dir || 'drizzle'}/ not found`,
      `state claims ${(state.migrations_applied as string[]).length} migration(s) but the directory is missing`,
      'create the migrations directory OR fix state.migrations_dir OR empty migrations_applied'
    );
  } else if (Array.isArray(state.migrations_applied) && isDir(migrationsDir)) {
    const onDisk = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.replace(/\.sql$/, ''))
      .sort();
    const inState = [...state.migrations_applied].sort();
    const missingFromState = onDisk.filter((m) => !inState.includes(m));
    const missingFromDisk = inState.filter((m) => !onDisk.includes(m));
    if (missingFromState.length || missingFromDisk.length) {
      record(
        'migrations.match',
        'fail',
        `migrations_applied does not match ${state.migrations_dir || 'drizzle'}/`,
        `state-missing: ${missingFromState.join(', ') || '(none)'} · disk-missing: ${missingFromDisk.join(', ') || '(none)'}`,
        'add missing-from-state to state.migrations_applied OR remove ghosts'
      );
    } else if (onDisk.length > 0) {
      record(
        'migrations.match',
        'pass',
        `migrations_applied matches ${state.migrations_dir || 'drizzle'}/ (${onDisk.length} files)`,
        ''
      );
    }
  }

  /* 7. Session prompt frontmatter --------------------------------------- */

  const VALID_STATUS = new Set(['queued', 'in-progress', 'shipped', 'archived']);
  if (isDir(SESSIONS_DIR)) {
    const prompts = readdirSync(SESSIONS_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => join(SESSIONS_DIR, f))
      .filter((f) => statSync(f).isFile());

    let shippedWithoutLog = 0;
    let invalidStatusValues: string[] = [];

    for (const p of prompts) {
      const rel = relative(ROOT, p);
      const fm = readFrontmatter(p);
      if (!fm) {
        record(
          `prompt.${rel}.frontmatter`,
          'warn',
          'prompt has no parsable frontmatter',
          rel
        );
        continue;
      }
      const status = String(fm.status ?? '');
      if (!VALID_STATUS.has(status)) {
        invalidStatusValues.push(`${rel} status='${status}'`);
      }
      if (status === 'shipped') {
        const logField = String(fm.session_log ?? '');
        if (!logField || logField === 'pending') {
          shippedWithoutLog++;
          record(
            `prompt.${rel}.session_log`,
            'fail',
            'shipped prompt has no session_log pointer',
            rel,
            'set session_log: session-logs/<id>.md in the frontmatter'
          );
        } else if (!existsSync(join(ROOT, logField))) {
          record(
            `prompt.${rel}.session_log_exists`,
            'fail',
            "shipped prompt's session_log file is missing",
            `${rel} -> ${logField}`,
            'either write the missing log OR fix the pointer'
          );
        }
      }
    }

    if (invalidStatusValues.length) {
      record(
        'prompts.status_values',
        'warn',
        'some prompts have non-canonical status values',
        invalidStatusValues.join(' · '),
        `use one of: ${[...VALID_STATUS].join(' | ')}`
      );
    } else if (prompts.length) {
      record(
        'prompts.status_values',
        'pass',
        `all ${prompts.length} prompt(s) have canonical status`,
        ''
      );
    }
    if (shippedWithoutLog === 0 && prompts.length) {
      record(
        'prompts.shipped_logged',
        'pass',
        'every shipped prompt has a session_log pointer',
        ''
      );
    }
  }

  /* 8. Working tree clean for casp + sessions + logs -------------------- */

  if (!noGit) {
    const dirty = git('status --porcelain casp docs/plan/sessions session-logs');
    if (dirty) {
      record(
        'workdir.clean',
        'warn',
        'casp / sessions / logs have uncommitted changes',
        dirty.split('\n').slice(0, 5).join(' · '),
        'commit + push before the session closes'
      );
    } else {
      record(
        'workdir.clean',
        'pass',
        'casp + sessions + logs are committed',
        ''
      );
    }
  }

  /* Report --------------------------------------------------------------- */

  if (json) emitJson(findings);

  const pass = findings.filter((f) => f.severity === 'pass').length;
  const warn = findings.filter((f) => f.severity === 'warn').length;
  const fail = findings.filter((f) => f.severity === 'fail').length;

  if (!quiet || fail > 0) {
    const head = `${c.bold('casp:check')} · ${pass} PASS · ${warn > 0 ? c.yellow(`${warn} WARN`) : `${warn} WARN`} · ${fail > 0 ? c.red(`${fail} FAIL`) : `${fail} FAIL`}`;
    console.log('');
    console.log(head);
    console.log(c.gray('─'.repeat(70)));
    for (const f of findings) {
      const tag =
        f.severity === 'pass'
          ? c.green('PASS')
          : f.severity === 'warn'
            ? c.yellow('WARN')
            : c.red('FAIL');
      if (f.severity === 'pass' && quiet) continue;
      const detail = f.detail ? c.gray(` · ${f.detail}`) : '';
      console.log(`  ${tag}  ${f.label}${detail}`);
      if (f.fix && f.severity !== 'pass') {
        console.log(`        ${c.cyan('→')} ${c.gray(f.fix)}`);
      }
    }
    console.log('');
    if (fail > 0) {
      console.log(
        c.red(`✗ ${fail} drift${fail > 1 ? 's' : ''} detected. Push blocked — fix before push.`)
      );
    } else if (warn > 0) {
      console.log(c.yellow(`⚠ ${warn} warning${warn > 1 ? 's' : ''} (not blocking).`));
    } else {
      console.log(c.green('✓ state in sync with git. Clear for push.'));
    }
    console.log('');
  }

  exit(fail > 0 ? 1 : 0);
}
