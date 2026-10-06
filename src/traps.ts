/**
 * The trap registry — CASP-FACT-006's evidence source.
 *
 * Same posture as src/rules.ts: *"No LLM, no network — this registry is static
 * data."* A `method` is a command or query a fact declares as how its value was
 * produced. Some methods produce an ESTIMATE that reads like a measurement — the
 * planner's row-count guess, an EXPLAIN without ANALYZE, a single instantaneous
 * stats sample. Nobody misreads these on purpose; they misread them because the
 * output *looks* exact. The 2026-07-20 incident's worst line was exactly this
 * shape: `n_live_tup` (a Postgres planner estimate) read as a row count, off by
 * ~40x, propagated into five files in minutes.
 *
 * This registry catches only the traps it knows. The next unknown one will pass
 * — see docs/what-casp-proves.md. Extending it is a data change, never a code
 * change: add a pattern here for a built-in, or a plain substring in a project's
 * own `casp/facts.json` `traps` array for something local to that repo.
 */

export interface Trap {
  /** Stable id for this trap, surfaced in the finding detail. */
  id: string;
  /** True when `method` exhibits the trap. */
  test: (method: string) => boolean;
  /** Why this pattern is a trap, not just a style nit. */
  why: string;
  /**
   * 'fail' (the default) when a hit is certain to be an estimate read as a
   * measurement. 'warn' when the method MAY measure the wrong thing — a
   * suspicion, which the facts layer never blocks a push on.
   */
  severity?: 'fail' | 'warn';
}

/** Package runners whose bare `<pkg>` may resolve to a cached copy, not the registry's current version. */
const RUNNER = /(?:^|[|;&(`\n]|\$\()\s*(npx|npm\s+(?:exec|x)|bunx|pnpm\s+dlx|yarn\s+dlx)(?=\s)/g;
/** Runner flags that consume the next token as their value. */
const VALUED_FLAGS = new Set([
  '--cache',
  '--registry',
  '--userconfig',
  '--prefix',
  '-w',
  '--workspace',
  '--shell',
  '--loglevel',
  '--node-options'
]);
/** The rest of one shell command, up to the next separator. Sticky, so each scan is bounded by its own segment. */
const SEGMENT = /[^|;&)`\n]*/y;
/** An npm package name with no version, tag or range: `pkg` or `@scope/pkg`. */
const BARE_PACKAGE = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

/**
 * The package names an invocation runs, read from the tokens after the runner.
 * `-p`/`--package` name them explicitly; otherwise the first positional token
 * (after an optional `--`) is the package. Returns [] when no package is named
 * (`npx -c '...'` with no `-p`).
 */
function runnerPackages(tokens: string[]): string[] {
  const explicit: string[] = [];
  let positional: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--') {
      positional = tokens[i + 1] ?? null;
      break;
    }
    if (t === '-p' || t === '--package') {
      if (tokens[i + 1] !== undefined) explicit.push(tokens[++i]);
      continue;
    }
    if (t.startsWith('--package=')) {
      explicit.push(t.slice('--package='.length));
      continue;
    }
    if (VALUED_FLAGS.has(t)) {
      i++;
      continue;
    }
    if (t === '-c' || t === '--call') break;
    if (t.startsWith('-')) continue;
    positional = t;
    break;
  }
  return explicit.length > 0 ? explicit : positional === null ? [] : [positional];
}

/**
 * True when `method` runs a package through npx / npm exec / bunx / pnpm dlx /
 * yarn dlx with no version or tag specifier. Only a runner in command position
 * counts (start of the method, or after a pipe, `;`, `&`, `$(` or a backtick),
 * so the word `npx` in prose never fires. Anything carrying an `@` past a scope
 * (`pkg@1.2.3`, `@s/pkg@latest`, `pkg@$(...)`), a path, a URL or a git spec is
 * pinned or otherwise named exactly, and does not fire either.
 */
export function unpinnedRunner(method: string): boolean {
  for (const m of method.matchAll(RUNNER)) {
    // Scan only to the next separator — slicing the whole remainder per match
    // made a long method of many runners quadratic (facts.json is repository content).
    SEGMENT.lastIndex = (m.index ?? 0) + m[0].length;
    const rest = SEGMENT.exec(method)?.[0] ?? '';
    const tokens = rest
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/^['"]|['"]$/g, ''));
    if (runnerPackages(tokens).some((p) => BARE_PACKAGE.test(p))) return true;
  }
  return false;
}

export const TRAPS: Trap[] = [
  {
    id: 'pg-live-tup-estimate',
    test: (m) => /n_(live|dead)_tup/.test(m) && !/count\s*\(/i.test(m),
    why: 'n_live_tup / n_dead_tup is the PostgreSQL query planner\'s row-count ESTIMATE (from ANALYZE statistics), not an exact count. Pair it with count(*) or drop the claim to an estimate.'
  },
  {
    id: 'explain-without-analyze',
    test: (m) => /\bEXPLAIN\b/i.test(m) && !/\bANALYZE\b/i.test(m),
    why: 'EXPLAIN without ANALYZE reports the planner\'s COST ESTIMATE, not a measured execution time or row count.'
  },
  {
    id: 'reltuples-estimate',
    test: (m) => /reltuples/i.test(m),
    why: 'pg_class.reltuples is a planner statistic refreshed by ANALYZE/VACUUM, not an exact row count.'
  },
  {
    id: 'docker-stats-snapshot',
    test: (m) => /docker\s+stats/i.test(m) && /--no-stream/i.test(m),
    why: 'docker stats --no-stream is a single instantaneous sample, not an average or a trend.'
  },
  {
    id: 'npx-unpinned-package',
    test: unpinnedRunner,
    severity: 'warn',
    why: 'npx / npm exec / bunx / pnpm dlx with no version specifier may run an already-cached copy of the package instead of the registry\'s current one, and the output does not say which version ran. Pin it (pkg@1.2.3, or pkg@latest to force a registry lookup) when the claim is about the published artifact.'
  }
];

/**
 * The first built-in trap `method` exhibits, or null. Project-declared `extra`
 * patterns (facts.json's `traps` array) are checked as PLAIN SUBSTRINGS, never
 * as regexes — facts.json is repository content, so an arbitrary regex from it
 * would be executing untrusted input, the exact thing this registry exists to
 * avoid doing with a model.
 */
export function matchTrap(
  method: string,
  extra: string[] = []
): { id: string; why: string; severity: 'fail' | 'warn' } | null {
  // A FAIL from any source wins over a WARN: a suspicion trap matched first must
  // never downgrade a certain one, built-in or project-declared.
  let warn: { id: string; why: string; severity: 'warn' } | null = null;
  for (const t of TRAPS) {
    if (!t.test(method)) continue;
    if ((t.severity ?? 'fail') === 'fail') return { id: t.id, why: t.why, severity: 'fail' };
    warn ??= { id: t.id, why: t.why, severity: 'warn' };
  }
  for (const pattern of extra) {
    if (pattern && method.includes(pattern)) {
      return {
        id: `project:${pattern}`,
        why: `matches this project's declared trap pattern in casp/facts.json`,
        severity: 'fail'
      };
    }
  }
  return warn;
}
