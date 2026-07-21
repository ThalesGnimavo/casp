/**
 * Prompt-chain integrity — the queue as an ordered plan, checked.
 *
 * The nine `CASP-PROMPT-*` / `CASP-SESSION-*` rules validate the HEAD of the
 * queue (`state.next_prompt`) and the integrity of what has already SHIPPED.
 * Nothing validated the ordering of what has not run yet: the `next_after:` key
 * the canonical prompt template ships was a convention with no rule behind it,
 * so a queue could be silently unexecutable while `casp check` stayed green.
 *
 * This module is the resolver + graph walk behind that category. It is pure:
 * it reads files and returns an analysis, never prints, never exits, never
 * shells out. No LLM, no network — three comparisons over files on disk.
 *
 * THE DESIGN CONSTRAINT, NON-NEGOTIABLE: this can never redden a repo that has
 * not opted in. `next_after` is a DECLARATION, like `phase:` in a session log —
 * optional, and meaningful only when present. The template ships a literal
 * placeholder, so an unedited value, an empty one, or `null` is not a claim and
 * produces nothing. A repo where no queued prompt declares a real predecessor
 * gets no finding at all: silence, not a nag (the treatment CASP-SESSION-003
 * gives a repo where no log declares a phase).
 *
 * FILENAMES ARE NEVER FUZZY-MATCHED. Every identity below is an EXACT string
 * produced by a documented, deterministic normalization — never an edit
 * distance, never a prefix guess. If the mapping would need a guess, the
 * reference does not resolve. CASP-SESSION-003 refused exactly this; refusing
 * it twice is the point of having a precedent.
 */

import { basename, join, relative } from 'node:path';
import {
  pathKind,
  readDirEntries,
  readFrontmatter,
  type ResolvedDirs,
  type State
} from './shared.js';

/** A prompt file participating in (or resolvable by) the chain. */
export interface ChainPrompt {
  /** Repo-relative path — what every message prints. */
  rel: string;
  /** Frontmatter status, '' when absent. */
  status: string;
  /** The raw `next_after` value, or null when it is not a declaration. */
  nextAfter: string | null;
  /**
   * Exact identity strings this prompt can be referenced by, most specific
   * first: the filename stem, its lowercase form, then its slug. The order is
   * the precedence used when two prompts would claim the same identity.
   */
  identities: string[];
}

export interface ChainAnalysis {
  /** True once at least one QUEUED prompt carries a real `next_after`. */
  adopted: boolean;
  /** Queued prompts whose `next_after` is not a declaration (placeholder / null / empty). */
  skipped: number;
  /** Queued prompts declaring a predecessor. */
  declaring: number;
  /** Declarations that resolve to nothing at all. */
  dangling: Array<{ rel: string; value: string }>;
  /** Cycles among queued prompts, each as the ring of repo-relative paths. */
  cycles: string[][];
  /**
   * Predecessors claimed by more than one queued prompt. `target` is the
   * canonical name of the shared slice; each claim carries the spelling that
   * prompt actually used, because two claims can differ textually and still be
   * the same target.
   */
  forks: Array<{ target: string; claims: Array<{ rel: string; value: string }> }>;
  /** Declaring queued prompts no chain from `next_prompt` reaches. */
  orphans: string[];
  /**
   * The resolved queue order, head first, when the chain is coherent
   * (no dangling, no cycle, no fork, no orphan). null otherwise.
   */
  order: string[] | null;
}

/**
 * Values that are explicitly NOT a declaration. `<...>` catches the template's
 * literal `next_after: <previous-session-id-or-prompt-slug>` and any other
 * angle-bracket placeholder the scaffolds use; the bare words are the
 * placeholders the same template uses for `session_id` / `session_log`, which
 * operators reasonably carry over.
 */
const NON_DECLARATIONS = new Set(['null', 'none', 'pending', 'tbd', '-', 'n/a']);

function isDeclaration(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const v = raw.trim();
  if (!v) return false;
  if (/^<.*>$/.test(v)) return false; // unedited template placeholder
  return !NON_DECLARATIONS.has(v.toLowerCase());
}

/**
 * The exact identities a prompt file can be referenced by. Three forms, each a
 * pure function of the filename stem:
 *
 *   PHASE-CHECK-SHIPPED-LOG.md  →  'PHASE-CHECK-SHIPPED-LOG'
 *                                  'phase-check-shipped-log'
 *                                  'check-shipped-log'
 *
 * The third form is the prompt's SLUG — what the template means by
 * "prompt-slug", and what `casp new prompt --slug <slug>` produced the file
 * from. Case folding and stripping the scaffold's own `PHASE-` prefix are
 * normalizations, not guesses: they are total, deterministic, and reversible in
 * intent. Nothing else is stripped.
 *
 * Returned MOST SPECIFIC FIRST, because two prompts can legitimately claim the
 * same identity — `A.md` and `PHASE-A.md` both answer to `a`. The order here is
 * the tie-break: an exact stem always beats a slug, so the winner is a property
 * of the filenames and never of `readdir` order.
 */
function promptIdentities(stem: string): string[] {
  const lower = stem.toLowerCase();
  const slug = lower.replace(/^phase-/, '');
  const ids = [stem, lower, slug].filter(Boolean);
  return [...new Set(ids)];
}

/** Read every prompt in the sessions directory, with its identities. */
function readPrompts(root: string, sessionsAbs: string): ChainPrompt[] {
  const dir = readDirEntries(sessionsAbs);
  if (!dir.ok) return [];
  const prompts: ChainPrompt[] = [];
  for (const entry of dir.entries) {
    if (!entry.endsWith('.md')) continue;
    const abs = join(sessionsAbs, entry);
    // A prompt that cannot be read (a directory named `*.md`, mode 000) declares
    // nothing and resolves nothing. check.ts already emits CASP-IO-001 for it —
    // the chain simply has no edge to draw, and must not invent a dangling one.
    const read = readFrontmatter(abs);
    if (!read.ok) continue;
    const fm = read.fm;
    const raw = fm?.next_after;
    prompts.push({
      rel: relative(root, abs),
      status: String(fm?.status ?? ''),
      nextAfter: isDeclaration(raw) ? raw.trim() : null,
      identities: promptIdentities(basename(entry, '.md'))
    });
  }
  return prompts;
}

/**
 * What an identity resolves TO. `node` is the queued prompt an edge points at,
 * or null for a terminal (a shipped prompt, a session log, a phase id).
 *
 * `key` is the CANONICAL name of the target, and it is the load-bearing field:
 * a single slice answers to several identities, so two prompts can declare the
 * same predecessor in different spellings — `PHASE-A` and `phase-a`. Keying
 * anything on the raw `next_after` string would miss that they are one target.
 */
interface Resolved {
  node: ChainPrompt | null;
  key: string;
}

/**
 * Every identity a `next_after` may legitimately resolve to, mapped to the
 * slice it names. The evidence is exactly what the rest of the validator
 * already reads:
 *
 *   - a PROMPT identity (the three exact forms above), from sessions_dir;
 *   - a SESSION ID that maps to a session log — the CASP-SESSION-001 resolver,
 *     `<logs_dir>/<id>.md`, matched on the full id, never on a fragment of it;
 *   - a PHASE id declared by state (phases_shipped / phases_queued /
 *     current_phase / next_phase) — the slice vocabulary state already speaks.
 */
function buildResolver(
  prompts: ChainPrompt[],
  state: State,
  dirs: ResolvedDirs
): Map<string, Resolved> {
  const resolver = new Map<string, Resolved>();

  // Phase ids and session logs are terminals. Each is its own canonical key —
  // it answers to exactly one spelling, so there is nothing to alias. They are
  // recorded first so the prompt tiers below can overwrite them.
  const terminal = (v: string): void => {
    resolver.set(v, { node: null, key: v });
  };
  for (const key of ['current_phase', 'next_phase'] as const) {
    const v = state[key];
    if (typeof v === 'string' && v.trim()) terminal(v.trim());
  }
  for (const key of ['phases_shipped', 'phases_queued'] as const) {
    const arr = state[key];
    if (!Array.isArray(arr)) continue;
    for (const p of arr) if (typeof p === 'string' && p.trim()) terminal(p.trim());
  }
  // No logs dir (or an unlistable one) — CASP-SESSION-002 / CASP-IO-001 report
  // that; here it is simply no evidence.
  const logs = readDirEntries(dirs.logsAbs);
  for (const entry of logs.ok ? logs.entries : []) {
    if (!entry.endsWith('.md')) continue;
    if (pathKind(join(dirs.logsAbs, entry)) !== 'file') continue;
    terminal(basename(entry, '.md'));
  }

  // Prompts are inserted by identity TIER, least specific first, so a more
  // specific claim always overwrites a less specific one and the resolver is a
  // pure function of the filenames — not of the order `readdir` happened to
  // return them in. Within a tier, ties are broken by path so the result is
  // stable on every filesystem.
  const ordered = [...prompts].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const maxTier = Math.max(0, ...ordered.map((p) => p.identities.length));
  for (let tier = maxTier - 1; tier >= 0; tier--) {
    for (const p of ordered) {
      const id = p.identities[tier];
      if (id === undefined) continue;
      const queued = p.status === 'queued' || p.status === 'in-progress';
      // Every identity of a prompt shares ONE canonical key — its path. That is
      // what makes `PHASE-A` and `phase-a` recognisable as the same predecessor.
      resolver.set(id, { node: queued ? p : null, key: p.rel });
    }
  }
  return resolver;
}

/**
 * Analyze the queue's `next_after` chain. Returns null when the sessions
 * directory holds no prompt at all (nothing to analyze); an un-adopted repo
 * returns an analysis with `adopted: false` and empty findings, which the
 * caller renders as silence.
 *
 * Only QUEUED prompts are subjects. A shipped prompt's `next_after` is history
 * and is never re-litigated — it is still a resolution TARGET, so the chain can
 * legitimately terminate on the slice that shipped before it.
 */
export function analyzeChain(
  root: string,
  state: State,
  dirs: ResolvedDirs
): ChainAnalysis | null {
  const prompts = readPrompts(root, dirs.sessionsAbs);
  if (prompts.length === 0) return null;

  const queued = prompts.filter((p) => p.status === 'queued' || p.status === 'in-progress');
  const declaring = queued.filter((p) => p.nextAfter !== null);

  const analysis: ChainAnalysis = {
    adopted: declaring.length > 0,
    skipped: queued.length - declaring.length,
    declaring: declaring.length,
    dangling: [],
    cycles: [],
    forks: [],
    orphans: [],
    order: null
  };
  if (!analysis.adopted) return analysis;

  const resolver = buildResolver(prompts, state, dirs);

  /* 1. Dangling — a declaration that resolves to nothing. ------------------ */

  // `predecessor` maps a declaring queued prompt to the queued prompt it runs
  // after (null when it terminates on a shipped slice, a log, or a phase id).
  const predecessor = new Map<string, ChainPrompt | null>();
  // The canonical key of what each declaring prompt runs after — the identity
  // its several spellings collapse to. Fork detection keys on this, never on
  // the raw string.
  const target = new Map<string, string>();
  for (const p of declaring) {
    const value = p.nextAfter as string;
    const hit = resolver.get(value);
    if (!hit) {
      analysis.dangling.push({ rel: p.rel, value });
      continue;
    }
    predecessor.set(p.rel, hit.node);
    target.set(p.rel, hit.key);
  }

  /* 2. Cycles — a ring no linear execution can satisfy. ------------------- */

  const byRel = new Map(prompts.map((p) => [p.rel, p]));
  const mark = new Map<string, 'visiting' | 'done'>();
  const seenCycle = new Set<string>();
  for (const p of declaring) {
    if (mark.get(p.rel) === 'done') continue;
    const path: string[] = [];
    let cursor: string | undefined = p.rel;
    while (cursor && mark.get(cursor) !== 'done') {
      if (mark.get(cursor) === 'visiting') {
        // Closed a ring — report it from its entry point, deduplicated so a
        // two-node cycle is one finding, not one per node.
        const ring = path.slice(path.indexOf(cursor));
        const key = [...ring].sort().join('|');
        if (!seenCycle.has(key)) {
          seenCycle.add(key);
          analysis.cycles.push(ring);
        }
        break;
      }
      mark.set(cursor, 'visiting');
      path.push(cursor);
      cursor = predecessor.get(cursor)?.rel;
    }
    for (const rel of path) mark.set(rel, 'done');
  }

  /* 3. Forks — two queued prompts claiming the same predecessor. ---------- */

  // Keyed on the RESOLVED target, not on the spelling: `next_after: PHASE-A`
  // and `next_after: phase-a` name one slice, so they are one fork. Keying on
  // the raw string missed exactly that, and a missed fork let `coherent` go
  // true — which made `status --json`'s `queue` publish a linear order that the
  // frontmatter did not support.
  const claims = new Map<string, Array<{ rel: string; value: string }>>();
  for (const p of declaring) {
    const key = target.get(p.rel);
    if (key === undefined) continue; // dangling — already reported
    const list = claims.get(key) ?? [];
    list.push({ rel: p.rel, value: p.nextAfter as string });
    claims.set(key, list);
  }
  for (const [key, list] of claims) {
    if (list.length > 1) {
      analysis.forks.push({
        target: key,
        claims: [...list].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
      });
    }
  }
  analysis.forks.sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : 0));

  /* 4. Reachability — a declaring prompt no chain from the head reaches. --- */

  // The chain is expressed BACKWARDS (each prompt names its predecessor), so
  // walking forward means following the successor map from the head.
  const successors = new Map<string, string[]>();
  for (const [rel, pred] of predecessor) {
    if (!pred) continue;
    const list = successors.get(pred.rel) ?? [];
    list.push(rel);
    successors.set(pred.rel, list);
  }

  const headRel =
    typeof state.next_prompt === 'string' && state.next_prompt.trim()
      ? relative(root, join(root, state.next_prompt.trim()))
      : null;

  // No usable head → no chain for anything to be unreachable FROM. Staying
  // silent here matters: when next_prompt is missing or already shipped,
  // CASP-PROMPT-001/003 already FAIL, and burying that one actionable finding
  // under an orphan warning per queued prompt would make the report worse.
  //
  // "Usable" means the head is a prompt that can still RUN, not merely a file
  // that exists. Testing existence alone covered only half the sentence above:
  // `byRel` holds every prompt including shipped ones, so a next_prompt pointing
  // at an already-shipped slice — the single most common drift, the one
  // CASP-PROMPT-003 exists to catch — passed the guard, walked from a head with
  // no successors, and reported every queued prompt unreachable. One WARN per
  // queued prompt on top of the one FAIL that mattered.
  const headPrompt = headRel !== null ? byRel.get(headRel) : undefined;
  const hasHead =
    headPrompt !== undefined &&
    (headPrompt.status === 'queued' || headPrompt.status === 'in-progress');
  const reachable = new Set<string>();
  const order: string[] = [];
  if (hasHead) {
    const walk = (rel: string): void => {
      if (reachable.has(rel)) return; // a cycle cannot spin the walk
      reachable.add(rel);
      order.push(rel);
      for (const next of (successors.get(rel) ?? []).sort()) walk(next);
    };
    walk(headRel as string);

    // A prompt inside a ring is unreachable BECAUSE of the ring, which is
    // already reported as a FAIL. Adding a WARN per ring member restates one
    // defect N times — the same noise the missing-head guard above refuses.
    const inCycle = new Set(analysis.cycles.flat());
    for (const p of declaring) {
      if (analysis.dangling.some((d) => d.rel === p.rel)) continue;
      if (inCycle.has(p.rel)) continue;
      if (!reachable.has(p.rel)) analysis.orphans.push(p.rel);
    }
    analysis.orphans.sort();
  }

  const coherent =
    analysis.dangling.length === 0 &&
    analysis.cycles.length === 0 &&
    analysis.forks.length === 0 &&
    analysis.orphans.length === 0;
  // A coherent chain is linear by construction (no fork, no cycle), so the walk
  // order IS the execution order, head first.
  if (coherent && order.length > 0) analysis.order = order;

  return analysis;
}
