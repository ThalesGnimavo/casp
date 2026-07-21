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
  }
];

/**
 * The first built-in trap `method` exhibits, or null. Project-declared `extra`
 * patterns (facts.json's `traps` array) are checked as PLAIN SUBSTRINGS, never
 * as regexes — facts.json is repository content, so an arbitrary regex from it
 * would be executing untrusted input, the exact thing this registry exists to
 * avoid doing with a model.
 */
export function matchTrap(method: string, extra: string[] = []): { id: string; why: string } | null {
  for (const t of TRAPS) {
    if (t.test(method)) return { id: t.id, why: t.why };
  }
  for (const pattern of extra) {
    if (pattern && method.includes(pattern)) {
      return { id: `project:${pattern}`, why: `matches this project's declared trap pattern in casp/facts.json` };
    }
  }
  return null;
}
