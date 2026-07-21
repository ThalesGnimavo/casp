/**
 * `casp upgrade` — refresh a cockpit's scaffolds without eating its state.
 *
 * The gap this closes: `init` refuses when `casp/` already exists, and
 * `init --force` overwrites EVERY file the package ships under `templates/` —
 * `state.json`, `now.md` and `roadmap.md` included. So the only refresh path
 * destroyed the operator's data, and a cockpit scaffolded by an older CASP had
 * no way to adopt a newer template short of copying files by hand. That was
 * theoretical while no scaffold byte changed between releases; 0.11.0 changed
 * the session-log template (the `phase:` frontmatter CASP-SESSION-003 reads),
 * so the newest rule was unadoptable by every existing cockpit.
 *
 * The contract, and it is the whole point:
 *
 *   - It refreshes ONLY the scaffolds — `README.md` and everything under
 *     `casp/templates/`. That set is an ALLOWLIST: a shipped file this code has
 *     never heard of is skipped, not written. A denylist would have made every
 *     future root-level template an unannounced overwrite of operator data.
 *   - It NEVER writes `now.md` or `roadmap.md`, and it never templates over
 *     `state.json`. The single state write is additive: stamp `casp_version`
 *     with the installed CLI's version, round-tripped through the parsed object
 *     so every existing value stays byte-identical. The key is namespaced on
 *     purpose — `state.json` has always allowed arbitrary extra keys, and a bare
 *     `version` would have silently eaten an operator's own product version.
 *   - It never deletes, and it never writes THROUGH a symlink — the leaf itself,
 *     or any parent component: a linked path in the cockpit points somewhere the
 *     operator chose, possibly outside `casp/`. Every write target must resolve
 *     back inside the resolved cockpit, and an unresolvable path fails closed.
 *   - An unrecognised flag exits 2 rather than being ignored. On the one verb
 *     that writes into a user's repository, `--dryrun` must not mean `apply`.
 *   - A write that fails (a directory in the way, an unwritable file) is
 *     reported per file and the run continues — a partial refresh must never
 *     also skip the version stamp, or the next run repeats it forever.
 *   - It is idempotent: on an already-current cockpit it writes nothing and
 *     says so. `--dry-run` prints the same plan and writes nothing ever.
 *
 * Deterministic and local-only, like the rest of the binary: file IO plus a
 * version compare. No network, no LLM, no git. `upgrade` never gates — `check`
 * remains the only gate.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exit } from 'node:process';
import { c, loadStateWithHash, pkgVersion, saveState, StateConflictError, setColor, todayISO } from './shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(__dirname, '..', 'templates');

/**
 * What `upgrade` is ALLOWED to write — an allowlist, not a denylist, because the
 * default for a file this code has never heard of must be "leave it alone".
 *
 * Everything under `casp/templates/` is by definition a scaffold: it exists to be
 * copied out of, never edited in place. At the cockpit root the only scaffold is
 * `README.md`; `state.json`, `now.md` and `roadmap.md` are the operator's data.
 *
 * The earlier shape denied those three by name and refreshed everything else,
 * which meant a future root-level template — an operator-prose file, say, or the
 * facts file a later phase adds — would be silently overwritten until somebody
 * remembered to extend the list. Correctness must not depend on that memory. A
 * new root-level scaffold is now skipped until it is deliberately opted in here.
 */
function isRefreshable(rel: string): boolean {
  return rel === 'README.md' || rel.startsWith('templates/');
}

/**
 * True when the directory a file would be written into does not resolve back
 * inside the cockpit — i.e. some component of the path is a symlink pointing
 * out. Resolves the deepest EXISTING ancestor, because the leaf (and possibly
 * its directory) may legitimately not exist yet on an `add`.
 *
 * Fails CLOSED: if the cockpit itself cannot be resolved, nothing is written.
 */
function escapesCockpit(cockpit: string, destAbs: string): boolean {
  let base: string;
  try {
    base = realpathSync(cockpit);
  } catch {
    return true;
  }
  let dir = dirname(destAbs);
  // Walk up to the first component that exists; that is the one realpath can
  // resolve, and the one a write would actually land under.
  while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
  let resolved: string;
  try {
    resolved = realpathSync(dir);
  } catch {
    return true;
  }
  return resolved !== base && !resolved.startsWith(base + sep);
}

/**
 * The scaffolded README carries the date the cockpit was created — a fact about
 * this repo, not a template value. Refreshing it must keep that date, or the
 * file would differ every day and `upgrade` would never be idempotent.
 */
const SCAFFOLDED_DATE = /\*\*Scaffolded\*\*\s*:\s*(\d{4}-\d{2}-\d{2})/;

type Action = 'add' | 'refresh' | 'same' | 'skip' | 'symlink' | 'error';

export interface FileVerdict {
  /** Path relative to `casp/`, POSIX-separated. */
  rel: string;
  action: Action;
  /** The bytes to write — null for `same` / `skip`. */
  content: string | null;
}

/** Every file the package ships under templates/, as `casp/`-relative paths. */
function shippedFiles(src: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(src)) {
    if (entry === '.DS_Store') continue; // never scaffold Finder junk into a user's repo
    const abs = join(src, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(abs).isDirectory()) out.push(...shippedFiles(abs, rel));
    else out.push(rel);
  }
  return out;
}

/**
 * Resolve a shipped scaffold's canonical bytes for THIS cockpit: the package
 * copy with its placeholders filled. `{{TODAY}}` in the README means "the date
 * this cockpit was scaffolded", so an existing README's own date wins over
 * today's — that is what makes a same-day and a next-day run agree.
 */
function canonicalContent(srcAbs: string, destAbs: string): string {
  const raw = readFileSync(srcAbs, 'utf8');
  if (!raw.includes('{{TODAY}}')) return raw;
  let stamp = todayISO();
  if (existsSync(destAbs)) {
    try {
      const m = readFileSync(destAbs, 'utf8').match(SCAFFOLDED_DATE);
      if (m) stamp = m[1];
    } catch {
      /* unreadable target → fall back to today; the write below will report it */
    }
  }
  return raw.split('{{TODAY}}').join(stamp);
}

/**
 * Compute the plan. Pure: reads the filesystem, writes nothing. Exported so the
 * tests can assert the plan independently of the printing.
 */
export function planUpgrade(cockpit: string): FileVerdict[] {
  const plan: FileVerdict[] = [];
  let shipped: string[];
  try {
    shipped = shippedFiles(TEMPLATES).sort();
  } catch {
    // The packaged templates/ tree is unreadable — a broken install, not a
    // cockpit problem. An empty plan lets the caller say so instead of dying on
    // an ENOENT stack trace.
    return plan;
  }
  for (const rel of shipped) {
    const destAbs = join(cockpit, ...rel.split('/'));
    // Not on the allowlist → the operator's data, or a file this version has no
    // business touching. Either way: skip.
    if (!isRefreshable(rel)) {
      plan.push({ rel, action: 'skip', content: null });
      continue;
    }
    // A symlink in the cockpit points somewhere the operator chose — very
    // possibly outside casp/. Writing through it would rewrite a file this verb
    // was never pointed at, so a link is reported and left alone.
    //
    // Checking the LEAF is not enough: every parent component is followed by
    // mkdirSync/writeFileSync, so a symlinked `casp/templates/` — or a symlinked
    // `casp/` itself, ordinary in a monorepo — escapes the cockpit just as
    // effectively, with no race required. So the resolved parent directory must
    // still be inside the resolved cockpit before anything is written there.
    let link = false;
    try {
      link = lstatSync(destAbs).isSymbolicLink();
    } catch {
      link = false; // nothing there, or unreadable — the paths below handle it
    }
    if (link || escapesCockpit(cockpit, destAbs)) {
      plan.push({ rel, action: 'symlink', content: null });
      continue;
    }
    const content = canonicalContent(join(TEMPLATES, ...rel.split('/')), destAbs);
    if (!existsSync(destAbs)) {
      plan.push({ rel, action: 'add', content });
      continue;
    }
    let current: string | null = null;
    try {
      current = statSync(destAbs).isFile() ? readFileSync(destAbs, 'utf8') : null;
    } catch {
      current = null; // unreadable or a directory in the way → treat as needing a refresh
    }
    plan.push(
      current === content
        ? { rel, action: 'same', content: null }
        : { rel, action: 'refresh', content }
    );
  }
  return plan;
}

/** Numeric semver compare, prerelease suffix ignored. -1 / 0 / 1. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string): number[] =>
    v
      .split(/[-+]/)[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function label(action: Action): string {
  switch (action) {
    case 'add':
      return c.green('add    ');
    case 'refresh':
      return c.green('refresh');
    case 'same':
      return c.gray('same   ');
    case 'skip':
      return c.gray('skip   ');
    case 'symlink':
      return c.yellow('symlink');
    case 'error':
      return c.red('error  ');
  }
}

export function runUpgrade(args: string[]): void {
  // An unrecognised flag must never be read as "apply". This is the one verb
  // that writes into the operator's repository, so a typo like `--dryrun` or a
  // half-remembered `-N` has to stop the run, not silently perform the real
  // thing the user was trying to avoid.
  const KNOWN = new Set(['--plain', '--dry-run', '-n']);
  const unknown = args.filter((a) => !KNOWN.has(a));
  if (unknown.length > 0) {
    console.error(c.red(`unknown flag: ${unknown.join(' ')}`));
    console.error(c.gray('  → casp upgrade [--dry-run|-n] [--plain]'));
    exit(2);
  }
  if (args.includes('--plain')) setColor(false);
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  const root = process.cwd();
  const cockpit = join(root, 'casp');

  if (!existsSync(cockpit)) {
    console.error(c.red(`no casp/ cockpit at ${root}`));
    console.error(c.gray('  → run `casp init` to scaffold one; upgrade refreshes an existing cockpit'));
    exit(1);
  }

  const version = pkgVersion();
  console.log('');
  console.log(
    `${c.bold('casp upgrade')} · ${c.cyan(relative(root, cockpit) || 'casp')}${dryRun ? c.gray(' · dry run, nothing will be written') : ''}`
  );
  console.log('');

  const plan = planUpgrade(cockpit);
  if (plan.length === 0) {
    console.error(c.red('this casp install has no packaged templates/ directory'));
    console.error(c.gray('  → the install is incomplete — reinstall @justethales/casp'));
    exit(1);
  }
  const errors: string[] = [];
  for (const v of plan) {
    let note = '';
    if (v.action === 'skip') note = c.gray(' (your data — never touched)');
    else if (v.action === 'same') note = c.gray(' (already current)');
    else if (v.action === 'symlink')
      note = c.gray(' (a symlink — left alone, upgrade never writes through one)');
    // casp/README.md is a scaffold, not a data file: a refresh REPLACES it. Say
    // so on the line itself, because it is the one refreshable file an operator
    // plausibly hand-edits, and the closing summary only vouches for the three
    // data files.
    else if (v.action === 'refresh' && v.rel === 'README.md')
      note = c.yellow(' (replaces your local edits — keep notes in now.md)');

    if (dryRun || (v.action !== 'add' && v.action !== 'refresh')) {
      console.log(`  ${label(v.action)} ${v.rel}${note}`);
      continue;
    }
    // A write can fail on a hostile filesystem shape — a DIRECTORY where a
    // scaffold belongs (EISDIR), an unwritable file (EACCES), a regular file
    // where casp/templates/ belongs (ENOTDIR). None of those may abort the run:
    // an uncaught throw here would leave the cockpit half-refreshed AND
    // unstamped, so a re-run repeats the same partial write forever. Report the
    // file, keep going, still reach the stamp and exit 0.
    const destAbs = join(cockpit, ...v.rel.split('/'));
    try {
      mkdirSync(dirname(destAbs), { recursive: true });
      writeFileSync(destAbs, v.content as string);
      console.log(`  ${label(v.action)} ${v.rel}${note}`);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? 'unknown';
      v.action = 'error';
      errors.push(v.rel);
      console.log(
        `  ${label('error')} ${v.rel}${c.gray(` (${code} — could not write; something is in the way)`)}`
      );
    }
  }

  /* state.json — additive only ------------------------------------------- */
  //
  // The ONLY state write is the version stamp. Every other optional key the
  // schema defines (sessions_dir, logs_dir, migrations_dir, migrations_applied,
  // last_deep_audit) is one whose ABSENCE is its default — writing a value for
  // an unset key would invent a claim, not migrate one. So there is no table of
  // defaults to apply here, deliberately; when a future key has a real default,
  // it lands in this block.
  const statePath = join(cockpit, 'state.json');
  const loaded = loadStateWithHash(statePath);
  const state = loaded?.state;
  let stateLine: string;
  if (!existsSync(statePath)) {
    stateLine = c.yellow('state.json is missing — not stamped (run `casp init` in an empty repo)');
  } else if (!state || typeof state !== 'object' || Array.isArray(state)) {
    // `loadStateWithHash` returns whatever the file parsed to. A bare scalar
    // (`42`) is truthy and not null, and assigning a property onto it throws
    // under strict mode — after the scaffolds were already written and before
    // the stamp. A state file that is not an object is a broken cockpit, not a
    // target.
    stateLine = c.yellow('state.json is not valid JSON — not stamped, fix the syntax and re-run');
  } else {
    const from = typeof state.casp_version === 'string' ? state.casp_version : null;
    if (from === version) {
      stateLine = c.gray(`state.json casp_version: ${version} (already current)`);
    } else {
      stateLine = `state.json casp_version: ${c.gray(from ?? 'unstamped')} → ${c.green(version)}`;
      if (!dryRun) {
        state.casp_version = version;
        try {
          saveState(statePath, state, loaded?.hash);
        } catch (err) {
          if (err instanceof StateConflictError) {
            stateLine += c.red(` — refused: ${err.message}`);
          } else {
            throw err;
          }
        }
      }
    }
  }

  const written = plan.filter((v) => v.action === 'add' || v.action === 'refresh').length;
  console.log('');
  console.log(`  ${stateLine}`);
  console.log('');
  if (dryRun) {
    console.log(
      c.gray(`dry run — ${written} scaffold${written === 1 ? '' : 's'} would be refreshed. Re-run without --dry-run to apply.`)
    );
  } else if (written === 0) {
    console.log(c.green(`✓ cockpit already current with casp ${version}.`));
  } else {
    console.log(
      c.green(`✓ ${written} scaffold${written === 1 ? '' : 's'} refreshed to casp ${version}.`) +
        c.gray('  your state.json / now.md / roadmap.md were not touched.')
    );
  }
  if (errors.length > 0) {
    console.log(
      c.yellow(`⚠ ${errors.length} file${errors.length === 1 ? '' : 's'} could not be written`) +
        c.gray(`: ${errors.join(', ')} — clear what is in the way and re-run.`)
    );
  }
  console.log('');
  // upgrade is not a gate: it reports what it did and exits 0, even when some
  // files could not be written. `check` is the only verb that gates.
  exit(0);
}
