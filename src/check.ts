/**
 * `casp check` — validate state.json against filesystem + git + prompt frontmatter.
 *
 * The wedge of the whole protocol: everyone STORES state, CASP VALIDATES it
 * against git ground-truth. Exits 1 on any FAIL so it works as a real CI status
 * check / pre-push gate — not a decorative log. Use --quiet to suppress PASS
 * lines (CI-friendly). Use --json for a machine-readable report (stable schema,
 * documented in docs/check-json.md) — same checks, same exit code, different
 * format only. Use --all to validate every casp/ cockpit under a root.
 *
 * The per-root validation lives in `checkOne(root)` and is pure — it returns
 * findings, never prints, never exits. `runCheck` is the thin shell that picks
 * single-root vs --all, renders (human or JSON), and owns the exit code.
 */

import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { exit } from 'node:process';
import { c, git, gitArgs, loadState, pkgVersion, readFrontmatter, resolveDirs } from './shared.js';
import { ruleFor } from './rules.js';

type Severity = 'pass' | 'warn' | 'fail';

// A claim's backing path must be a real directory — a file squatting the path
// is just as unverifiable as a missing dir (and crashes readdirSync).
function isDir(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}
export interface Finding {
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

export function summarize(findings: Finding[]): {
  pass: number;
  warn: number;
  fail: number;
} {
  return {
    pass: findings.filter((f) => f.severity === 'pass').length,
    warn: findings.filter((f) => f.severity === 'warn').length,
    fail: findings.filter((f) => f.severity === 'fail').length
  };
}

function buildReport(findings: Finding[]): Record<string, unknown> {
  const summary = summarize(findings);
  const exitCode = summary.fail > 0 ? 1 : 0;
  return {
    schema_version: JSON_SCHEMA_VERSION,
    casp_version: pkgVersion(),
    verdict: exitCode === 0 ? 'clean' : 'drift',
    exit_code: exitCode,
    summary,
    findings: findings.map((f) => ({
      id: f.id,
      rule: ruleFor(f.id)?.code ?? null,
      severity: f.severity,
      label: f.label,
      detail: f.detail,
      fix: f.fix ?? null
    }))
  };
}

function emitJson(findings: Finding[]): never {
  const report = buildReport(findings);
  console.log(JSON.stringify(report, null, 2));
  exit(report.exit_code as number);
}

/**
 * Validate one cockpit rooted at `root`. Pure: returns findings, never prints,
 * never exits. The terminal cases (no state file / invalid JSON) return a
 * single `state.file` finding and run nothing further.
 */
export function checkOne(root: string, opts: { noGit?: boolean } = {}): Finding[] {
  const noGit = opts.noGit ?? false;
  const STATE_PATH = join(root, 'casp', 'state.json');

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
    return findings;
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
    return findings;
  }

  // Resolve the state-surface dirs from state (defaults when unset). Computed
  // here — after state loads — so the optional sessions_dir / logs_dir keys are
  // honored everywhere below. SESSIONS_DIR / LOGS_DIR are the absolute forms;
  // dirs.*Rel is what every message and git pathspec prints (the RESOLVED path,
  // not the hardcoded default).
  const dirs = resolveDirs(root, state);
  const SESSIONS_DIR = dirs.sessionsAbs;
  const LOGS_DIR = dirs.logsAbs;

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
    const path = join(root, state.next_prompt);
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
        `cannot verify last_session_id: ${dirs.logsRel}/ is not a directory`,
        `state claims session ${state.last_session_id} but ${dirs.logsRel}/ is missing (or not a directory)`,
        `create ${dirs.logsRel}/ and write the log OR fix last_session_id`
      );
    } else {
      const logPath = join(LOGS_DIR, `${state.last_session_id}.md`);
      if (existsSync(logPath)) {
        record(
          'last_session.log_exists',
          'pass',
          'last_session_id has a matching session log',
          `${dirs.logsRel}/${state.last_session_id}.md`
        );
      } else {
        record(
          'last_session.log_exists',
          'fail',
          'last_session_id does not map to a session log',
          `expected ${dirs.logsRel}/${state.last_session_id}.md`,
          `write the session log (try \`npx @justethales/casp new log --slug <slug>\`) OR fix last_session_id`
        );
      }
    }
  }

  /* 3b. phases_shipped claims a history → its dirs must exist ------------ */

  if (Array.isArray(state.phases_shipped) && state.phases_shipped.length > 0) {
    const historyDirs: Array<[string, string, string]> = [
      [SESSIONS_DIR, `${dirs.sessionsRel}/`, 'sessions_dir'],
      [LOGS_DIR, `${dirs.logsRel}/`, 'logs_dir']
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
    const head = git('rev-parse --short HEAD', root);
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
      // last_commit is repo content — inject-safe form (a crafted value can't
      // reach a shell; it becomes one invalid ref → git errors → '' → FAIL).
      const exists = gitArgs(['rev-parse', '--verify', `${state.last_commit}^{commit}`], root);
      if (exists) {
        // The canonical close loop ends with a state-bump commit: the session
        // is committed, last_commit is set to that SHA, and the bump itself is
        // committed — moving HEAD one past last_commit. That is not drift.
        // PASS when last_commit is the parent of HEAD and HEAD touches only
        // the state surface; anything else stays WARN.
        const parent = git('rev-parse --short HEAD^', root);
        const isParent =
          parent.length > 0 &&
          (parent.startsWith(state.last_commit) ||
            state.last_commit.startsWith(parent));
        const touched = git('diff-tree --no-commit-id --name-only -r HEAD', root)
          .split('\n')
          .filter(Boolean);
        const STATE_SURFACE = ['casp/', `${dirs.sessionsRel}/`, `${dirs.logsRel}/`];
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

  /* 6. migrations_applied (opt-in) -------------------------------------- */

  // Migrations are entirely optional. A project that tracks none (no
  // migrations_dir, no/empty migrations_applied) gets no migration finding at
  // all — silence, not a green line — so non-code cockpits carry no noise.
  const migrationsClaimed =
    Array.isArray(state.migrations_applied) &&
    state.migrations_applied.length > 0;
  if (dirs.migrationsRel === null || dirs.migrationsAbs === null) {
    if (migrationsClaimed) {
      // A claim with nothing to verify it against is drift, not a skip.
      record(
        'migrations.dir',
        'fail',
        'migrations_applied is set but migrations_dir is absent',
        `state claims ${(state.migrations_applied as string[]).length} migration(s) with no migrations_dir to verify against`,
        'set state.migrations_dir to the migrations directory OR empty migrations_applied'
      );
    }
    // else: this project has no migration concept → skip silently.
  } else {
    const migrationsDir = dirs.migrationsAbs;
    if (migrationsClaimed && !isDir(migrationsDir)) {
      // The canonical false-green: state claims applied migrations, the dir is
      // gone — the old behavior silently skipped and reported green.
      record(
        'migrations.dir',
        'fail',
        `cannot verify migrations_applied: ${dirs.migrationsRel}/ not found`,
        `state claims ${(state.migrations_applied as string[]).length} migration(s) but the directory is missing`,
        'create the migrations directory OR fix state.migrations_dir OR empty migrations_applied'
      );
    } else if (Array.isArray(state.migrations_applied) && isDir(migrationsDir)) {
      // Migration files: SQL (drizzle, raw) or Python (alembic). Dunder entries
      // (__init__.py, __pycache__) are infrastructure, not migrations.
      const onDisk = readdirSync(migrationsDir)
        .filter((f) => /\.(sql|py)$/.test(f) && !f.startsWith('__'))
        .map((f) => f.replace(/\.(sql|py)$/, ''))
        .sort();
      const inState = [...state.migrations_applied].sort();
      const missingFromState = onDisk.filter((m) => !inState.includes(m));
      const missingFromDisk = inState.filter((m) => !onDisk.includes(m));
      if (missingFromState.length || missingFromDisk.length) {
        record(
          'migrations.match',
          'fail',
          `migrations_applied does not match ${dirs.migrationsRel}/`,
          `state-missing: ${missingFromState.join(', ') || '(none)'} · disk-missing: ${missingFromDisk.join(', ') || '(none)'}`,
          'add missing-from-state to state.migrations_applied OR remove ghosts'
        );
      } else if (onDisk.length > 0) {
        record(
          'migrations.match',
          'pass',
          `migrations_applied matches ${dirs.migrationsRel}/ (${onDisk.length} files)`,
          ''
        );
      }
    } else if (!Array.isArray(state.migrations_applied) && isDir(migrationsDir)) {
      // migrations_dir is configured and the directory exists, but state does
      // not declare migrations_applied at all. If the directory actually holds
      // migration files, the cockpit is blind to them — a likely mis-config.
      // WARN, not FAIL: a genuinely empty dir is legitimate (fresh project), so
      // only flag when files are present. Non-blocking by design.
      const onDisk = readdirSync(migrationsDir).filter(
        (f) => /\.(sql|py)$/.test(f) && !f.startsWith('__')
      );
      if (onDisk.length > 0) {
        record(
          'migrations.untracked',
          'warn',
          `${dirs.migrationsRel}/ holds ${onDisk.length} migration file(s) but migrations_applied is not set`,
          'state does not track any migrations while the configured directory contains some',
          'add the applied migrations to state.migrations_applied OR remove migrations_dir if unused'
        );
      }
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
      const rel = relative(root, p);
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
            `set session_log: ${dirs.logsRel}/<id>.md in the frontmatter`
          );
        } else {
          // A phase shipped across several sessions lists its logs as a YAML
          // list or a comma-separated string. Every entry must resolve.
          const rawLog = fm.session_log;
          const entries = (
            Array.isArray(rawLog) ? rawLog.map(String) : logField.split(',')
          )
            .map((s) => s.trim())
            .filter(Boolean);
          const missing = entries.filter((e) => !existsSync(join(root, e)));
          if (missing.length) {
            record(
              `prompt.${rel}.session_log_exists`,
              'fail',
              "shipped prompt's session_log file is missing",
              `${rel} -> ${missing.join(', ')}`,
              'either write the missing log(s) OR fix the pointer (repo-relative paths, comma-separated)'
            );
          }
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
    // sessionsRel / logsRel come from state (repo content) — inject-safe form.
    const dirty = gitArgs(
      ['status', '--porcelain', 'casp', dirs.sessionsRel, dirs.logsRel],
      root
    );
    if (dirty) {
      record(
        'workdir.clean',
        'warn',
        'casp / sessions / logs have uncommitted changes',
        dirty.split('\n').slice(0, 5).join(' · '),
        'commit + push before the session closes'
      );
    } else {
      record('workdir.clean', 'pass', 'casp + sessions + logs are committed', '');
    }
  }

  return findings;
}

/* Human report rendering — extracted so single-root and --all share it. ---- */

export function printReport(findings: Finding[], quiet: boolean): void {
  const { pass, warn, fail } = summarize(findings);
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
    // Surface the stable rule code on actionable findings only (warn/fail), so a
    // reader can `casp explain <CODE>`. PASS lines stay uncluttered.
    const code = f.severity !== 'pass' ? `${c.gray(ruleFor(f.id)?.code ?? '')} ` : '';
    console.log(`  ${tag}  ${code}${f.label}${detail}`);
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

/* --all: discover and validate every cockpit under a root. ----------------- */

const WALK_SKIP = new Set(['node_modules', '.git', 'dist', '.next', 'build']);

function findCockpits(root: string): string[] {
  const found: string[] = [];
  // Track resolved real paths so a symlink cycle (a/b -> ../a) can't recurse
  // forever — the walk crosses arbitrary user trees under --all.
  const visited = new Set<string>();
  const walk = (dir: string): void => {
    let real: string;
    try {
      real = realpathSync(dir);
    } catch {
      return;
    }
    if (visited.has(real)) return;
    visited.add(real);

    if (existsSync(join(dir, 'casp', 'state.json'))) found.push(dir);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith('.') || WALK_SKIP.has(entry)) continue;
      if (entry === 'casp') continue; // the cockpit itself holds no nested cockpits
      const sub = join(dir, entry);
      try {
        if (statSync(sub).isDirectory()) walk(sub);
      } catch {
        /* unreadable entry — skip */
      }
    }
  };
  walk(root);
  return found;
}

function runAll(root: string, opts: { json: boolean; quiet: boolean; noGit: boolean }): never {
  const cockpits = findCockpits(root);

  if (cockpits.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ root, cockpits: [] }, null, 2));
      exit(0);
    }
    console.log('');
    console.log(c.yellow(`no casp/ cockpit found under ${root}`));
    console.log(c.gray('  → run `npx @justethales/casp init` in a project first'));
    console.log('');
    exit(0);
  }

  const results = cockpits.map((dir) => ({
    root: relative(root, dir) || basename(dir) || '.',
    findings: checkOne(dir, { noGit: opts.noGit })
  }));

  const anyFail = results.some((r) => summarize(r.findings).fail > 0);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          root,
          cockpits: results.map((r) => ({
            root: r.root,
            ...buildReport(r.findings)
          }))
        },
        null,
        2
      )
    );
    exit(anyFail ? 1 : 0);
  }

  let totPass = 0;
  let totWarn = 0;
  let totFail = 0;
  for (const r of results) {
    const s = summarize(r.findings);
    totPass += s.pass;
    totWarn += s.warn;
    totFail += s.fail;
  }
  console.log('');
  console.log(
    `${c.bold('casp:check --all')} · ${cockpits.length} cockpit${cockpits.length > 1 ? 's' : ''} · ${totPass} PASS · ${totWarn > 0 ? c.yellow(`${totWarn} WARN`) : `${totWarn} WARN`} · ${totFail > 0 ? c.red(`${totFail} FAIL`) : `${totFail} FAIL`}`
  );
  for (const r of results) {
    const s = summarize(r.findings);
    const verdict =
      s.fail > 0
        ? c.red('FAIL')
        : s.warn > 0
          ? c.yellow('WARN')
          : c.green('PASS');
    console.log('');
    console.log(`${verdict}  ${c.cyan(r.root)}  ${c.gray(`(${s.pass}/${s.warn}/${s.fail})`)}`);
    for (const f of r.findings) {
      if (f.severity === 'pass') continue; // --all summary shows only WARN/FAIL per cockpit
      const tag = f.severity === 'fail' ? c.red('FAIL') : c.yellow('WARN');
      const detail = f.detail ? c.gray(` · ${f.detail}`) : '';
      console.log(`    ${tag}  ${f.label}${detail}`);
      if (f.fix) console.log(`          ${c.cyan('→')} ${c.gray(f.fix)}`);
    }
  }
  console.log('');
  if (anyFail) {
    console.log(c.red(`✗ drift in at least one cockpit. Push blocked.`));
  } else if (totWarn > 0) {
    console.log(c.yellow(`⚠ ${totWarn} warning${totWarn > 1 ? 's' : ''} across cockpits (not blocking).`));
  } else {
    console.log(c.green('✓ every cockpit in sync with git. Clear for push.'));
  }
  console.log('');
  exit(anyFail ? 1 : 0);
}

export function runCheck(args: string[]): void {
  const json = args.includes('--json');
  const quiet = args.includes('--quiet');
  const noGit = args.includes('--no-git');
  const all = args.includes('--all');

  if (all) {
    // Optional positional root after --all (first non-flag arg); default cwd.
    // resolve() (not join()) so an ABSOLUTE root is used as-is — join(cwd, abs)
    // would concatenate them into a doubled path. Relative roots still resolve
    // against cwd.
    const rootArg = args.find((a) => !a.startsWith('--'));
    const root = rootArg ? resolve(process.cwd(), rootArg) : process.cwd();
    runAll(root, { json, quiet, noGit });
    return; // runAll is `never`, but make the single-root path unreachable explicitly
  }

  const root = process.cwd();
  const findings = checkOne(root, { noGit });

  if (json) emitJson(findings);

  // Terminal cases keep their original short, custom stderr message (not the
  // full report block) so single-root output stays byte-identical to before.
  if (findings.length === 1 && findings[0].id === 'state.file') {
    const f = findings[0];
    if (f.label === 'no casp/state.json found') {
      console.error(c.red('FAIL') + ` no casp/state.json found at ${f.detail}`);
      console.error(c.gray('       → run `npx @justethales/casp init` first'));
    } else {
      console.error(c.red('FAIL') + ' casp/state.json is not valid JSON');
    }
    exit(1);
  }

  const fail = summarize(findings).fail;
  if (!quiet || fail > 0) {
    printReport(findings, quiet);
  }
  exit(fail > 0 ? 1 : 0);
}
