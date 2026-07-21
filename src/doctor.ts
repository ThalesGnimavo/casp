/**
 * `casp doctor` — read-only environment diagnostic for onboarding.
 *
 * doctor answers "is this machine set up to run casp?", NOT "has the state
 * drifted?" — that is `casp check`'s job and its exclusive one. So doctor
 * inspects the ENVIRONMENT (Node, git, the cockpit file's presence, the
 * resolved state-surface dirs, the pre-push hook, core.hooksPath) and, crucially,
 * NEVER gates: it always exits 0, even when it reports a FAIL. It is a map of
 * what to fix, not a gate that blocks anything. `check` remains the only gate.
 *
 * Deterministic, local-only: no network, no LLM. Reuses the same resolvers and
 * hook-detection the rest of the binary uses, so its verdicts never diverge.
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';
import { c, git, loadState, pkgVersion, resolveDirs, setColor } from './shared.js';
import { isCaspHook, resolveHookPath } from './install-hook.js';
import { compareVersions } from './upgrade.js';

// doctor's own machine-readable envelope version — independent of the
// check-json schema. Bumps only on a breaking change to this shape.
const DOCTOR_SCHEMA_VERSION = 1;

type Severity = 'pass' | 'warn' | 'fail';

interface DoctorCheck {
  id: string;
  severity: Severity;
  label: string;
  detail: string;
}

function isDir(p: string): boolean {
  // statSync can throw (EACCES on an unreadable parent) even after existsSync
  // returned true. doctor must never crash — a throw here is "not a usable dir".
  try {
    return existsSync(p) && statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// isCaspHook reads the hook file, which throws EISDIR if pre-push is a directory
// (or EACCES if unreadable). doctor treats any such throw as "not a CASP hook".
function isCaspHookSafe(path: string): boolean {
  try {
    return isCaspHook(path);
  } catch {
    return false;
  }
}

/** The minimum Node major casp supports (kept in lockstep with package.json engines). */
const MIN_NODE_MAJOR = 20;

/**
 * Run every environment probe. Pure: returns the checks, never prints, never
 * exits. `root` is the directory to diagnose (the cwd for the real command).
 */
export function runChecks(root: string): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const add = (id: string, severity: Severity, label: string, detail = ''): void => {
    checks.push({ id, severity, label, detail });
  };

  /* 1. Node --------------------------------------------------------------- */
  const nodeMajor = Number(process.version.replace(/^v/, '').split('.')[0]);
  if (Number.isFinite(nodeMajor) && nodeMajor >= MIN_NODE_MAJOR) {
    add('node.version', 'pass', `Node ${process.version} (>= ${MIN_NODE_MAJOR})`, '');
  } else {
    add(
      'node.version',
      'fail',
      `Node ${process.version} is below the required ${MIN_NODE_MAJOR}`,
      `upgrade to Node ${MIN_NODE_MAJOR} or newer`
    );
  }

  /* 2. git binary --------------------------------------------------------- */
  const gitVersion = git('--version', root);
  const hasGit = gitVersion.startsWith('git version');
  if (hasGit) {
    add('git.present', 'pass', gitVersion, '');
  } else {
    add(
      'git.present',
      'fail',
      'git not found on PATH',
      'install git — casp check validates state against git history'
    );
  }

  /* 3. git repository ----------------------------------------------------- */
  const inRepo = hasGit && git('rev-parse --is-inside-work-tree', root) === 'true';
  if (inRepo) {
    const branch = git('rev-parse --abbrev-ref HEAD', root) || '(detached)';
    const head = git('rev-parse --short HEAD', root) || '(no commits yet)';
    add('git.repo', 'pass', 'inside a git repository', `branch ${branch} · HEAD ${head}`);
  } else if (hasGit) {
    add(
      'git.repo',
      'warn',
      'not a git repository',
      "casp check's git-dependent checks cannot run here — run `git init` or cd into a repo"
    );
  }
  // (no git binary → the git.present FAIL already tells the story; skip a repo line)

  /* 4. casp/state.json present + valid ------------------------------------ */
  const statePath = join(root, 'casp', 'state.json');
  const state = existsSync(statePath) ? loadState(statePath) : null;
  if (!existsSync(statePath)) {
    add(
      'state.present',
      'fail',
      'no casp/state.json found',
      'run `casp init` to scaffold the continuity layer'
    );
  } else if (!state) {
    add(
      'state.valid',
      'fail',
      'casp/state.json is not valid JSON',
      'fix the JSON syntax (a trailing comma or unquoted key, usually)'
    );
  } else {
    add('state.valid', 'pass', 'casp/state.json present and valid JSON', 'casp/state.json');

    /* 4b. cockpit CASP version --------------------------------------------
     *
     * The stamp `casp init` writes and `casp upgrade` refreshes. A stale or
     * absent stamp means the cockpit's scaffolds may predate the installed
     * CLI's — which is exactly how the 0.11.0 session-log template became
     * unadoptable before `upgrade` existed. WARN, never FAIL: doctor never
     * gates, and an unstamped cockpit is perfectly valid state.
     */
    const installed = pkgVersion();
    // A hand-edited stamp that is not a version string at all (empty, 'abc', a
    // number, an object) is treated as unstamped rather than rendered verbatim
    // into a nonsense WARN label.
    const raw = state.casp_version;
    const stamped = typeof raw === 'string' && /^\d/.test(raw.trim()) ? raw.trim() : null;
    if (!stamped) {
      add(
        'cockpit.version',
        'warn',
        'cockpit is not version-stamped',
        `scaffolded before version tracking — run \`casp upgrade\` to adopt it and refresh the scaffolds (casp ${installed} installed)`
      );
    } else if (compareVersions(stamped, installed) < 0) {
      add(
        'cockpit.version',
        'warn',
        `cockpit scaffolded by casp ${stamped}, casp ${installed} installed`,
        'run `casp upgrade` to refresh the scaffolds — your state.json / now.md / roadmap.md are not touched'
      );
    } else if (compareVersions(stamped, installed) > 0) {
      add(
        'cockpit.version',
        'warn',
        `cockpit stamped casp ${stamped}, but casp ${installed} is installed`,
        'this CLI is older than the cockpit — update the package before running upgrade'
      );
    } else {
      add('cockpit.version', 'pass', `cockpit current with casp ${installed}`, 'casp/state.json casp_version');
    }

    /* 5. resolved state-surface dirs exist -------------------------------- */
    const dirs = resolveDirs(root, state);
    for (const [rel, abs, key] of [
      [dirs.sessionsRel, dirs.sessionsAbs, 'sessions_dir'],
      [dirs.logsRel, dirs.logsAbs, 'logs_dir']
    ] as const) {
      if (isDir(abs)) {
        add(`dirs.${key}`, 'pass', `${key} exists`, `${rel}/`);
      } else {
        add(
          `dirs.${key}`,
          'warn',
          `${key} is missing`,
          `${rel}/ does not exist yet — \`casp new prompt|log\` will create it, or make it by hand`
        );
      }
    }
  }

  /* 6. core.hooksPath ----------------------------------------------------- */
  if (inRepo) {
    const hooksPath = git('config --get core.hooksPath', root);
    if (hooksPath) {
      add(
        'git.hooks_path',
        'warn',
        `core.hooksPath is set to '${hooksPath}'`,
        'git ignores .git/hooks here — wire `casp check --quiet` into that directory yourself'
      );
    } else {
      add('git.hooks_path', 'pass', 'core.hooksPath is not set', 'git uses .git/hooks');
    }
  }

  /* 7. pre-push hook ------------------------------------------------------ */
  const resolved = resolveHookPath(root);
  if (!resolved.ok) {
    if (resolved.reason === 'no-git') {
      add('hook.pre_push', 'warn', 'cannot check the pre-push hook', 'not a git repository');
    } else {
      add(
        'hook.pre_push',
        'warn',
        'the casp pre-push hook cannot live at .git/hooks',
        'core.hooksPath is set — add `casp check --quiet` to the pre-push hook in that directory'
      );
    }
  } else if (isCaspHookSafe(resolved.path)) {
    add('hook.pre_push', 'pass', 'pre-push gate installed (CASP-managed)', '.git/hooks/pre-push');
  } else if (existsSync(resolved.path)) {
    add(
      'hook.pre_push',
      'warn',
      'a non-CASP pre-push hook exists',
      'the casp gate is not wired into it — `casp install-hook --force` to take it over'
    );
  } else {
    add(
      'hook.pre_push',
      'warn',
      'no pre-push hook installed',
      'run `casp install-hook` to run casp check automatically on every push'
    );
  }

  return checks;
}

function summarize(checks: DoctorCheck[]): { pass: number; warn: number; fail: number } {
  return {
    pass: checks.filter((k) => k.severity === 'pass').length,
    warn: checks.filter((k) => k.severity === 'warn').length,
    fail: checks.filter((k) => k.severity === 'fail').length
  };
}

function printReport(checks: DoctorCheck[]): void {
  const { pass, warn, fail } = summarize(checks);
  const head = `${c.bold('casp:doctor')} · ${pass} PASS · ${warn > 0 ? c.yellow(`${warn} WARN`) : `${warn} WARN`} · ${fail > 0 ? c.red(`${fail} FAIL`) : `${fail} FAIL`}`;
  console.log('');
  console.log(head);
  console.log(c.gray('─'.repeat(70)));
  for (const k of checks) {
    const tag =
      k.severity === 'pass'
        ? c.green('PASS')
        : k.severity === 'warn'
          ? c.yellow('WARN')
          : c.red('FAIL');
    const detail = k.detail ? c.gray(` · ${k.detail}`) : '';
    console.log(`  ${tag}  ${k.label}${detail}`);
  }
  console.log('');
  // doctor is a diagnostic, not a gate: it never blocks. Say so plainly so a
  // FAIL here is never mistaken for a push-blocking verdict (that is `check`).
  if (fail > 0) {
    console.log(c.red(`✗ ${fail} environment issue${fail > 1 ? 's' : ''} to fix.`) + c.gray('  doctor never blocks — `casp check` is the gate.'));
  } else if (warn > 0) {
    console.log(c.yellow(`⚠ ${warn} suggestion${warn > 1 ? 's' : ''}.`) + c.gray('  environment is workable.'));
  } else {
    console.log(c.green('✓ environment ready for casp.'));
  }
  console.log('');
}

export function runDoctor(args: string[]): void {
  if (args.includes('--plain')) setColor(false);
  const root = process.cwd();
  // Belt-and-suspenders: the probes guard their own throw-prone calls, but the
  // "doctor always exits 0" invariant is absolute — an unforeseen throw must
  // still surface as a diagnostic, never a non-zero crash exit.
  let checks: DoctorCheck[];
  try {
    checks = runChecks(root);
  } catch (err) {
    checks = [
      {
        id: 'doctor.internal',
        severity: 'fail',
        label: 'doctor could not complete',
        detail: err instanceof Error ? err.message : String(err)
      }
    ];
  }

  if (args.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          schema_version: DOCTOR_SCHEMA_VERSION,
          casp_version: pkgVersion(),
          node: process.version,
          summary: summarize(checks),
          checks
        },
        null,
        2
      )
    );
    // Never gates — a diagnostic always exits 0, even when it reports a FAIL.
    exit(0);
  }

  printReport(checks);
  exit(0);
}
