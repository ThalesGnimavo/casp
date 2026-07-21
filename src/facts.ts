/**
 * The facts layer — proving FRESHNESS, never truth.
 *
 * `casp check` proves state against git. It has never had an opinion about the
 * documents ORBITING the cockpit — a unit-economics note, a roadmap line, a
 * pricing table — because nothing in those is a state claim. The 2026-07-20
 * incident showed the cost of that gap: five false claims lived in exactly
 * those documents, and `casp check` stayed green throughout, correctly, because
 * none of them was drift. See docs/plan/sessions/PHASE-FACTS-LAYER.md.
 *
 * The reversal that makes this tractable without a model: CASP cannot prove a
 * claim is TRUE, but it can prove a claim has stopped being VERIFIED — the
 * source it was derived from changed (hash), the verification aged past its
 * declared shelf life (TTL), or no reproduction method was ever recorded. Three
 * comparisons, zero LLM — the same shape as `migrations_applied`.
 *
 * OPT-IN, same posture as CASP-SESSION-003 and CASP-PROMPT-007..010: a cockpit
 * with no `casp/facts.json` gets no CASP-FACT-* finding at all, not even a PASS.
 * This module is pure: it reads files and returns an analysis, never prints,
 * never exits, executes nothing (`method` is data here — only `casp fact
 * verify <id>` ever runs it, and only after an explicit confirmation).
 */

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileHash, todayISO } from './shared.js';
import { matchTrap } from './traps.js';

export interface FactEntry {
  id: string;
  value: string;
  source: string;
  source_hash?: string;
  method?: string;
  verified_at?: string;
  verified_commit?: string;
  ttl_days?: number;
  used_in?: string[];
}

export interface FactsFile {
  schema_version?: number;
  facts: FactEntry[];
  traps?: string[];
}

/** Parses casp/facts.json. null on missing file OR a shape that is not even
 *  minimally a facts file (no `facts` array) — check.ts turns the latter into
 *  a single FAIL rather than silent adoption of garbage. */
export function loadFacts(path: string): FactsFile | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !Array.isArray((parsed as FactsFile).facts)
    ) {
      return null;
    }
    return parsed as FactsFile;
  } catch {
    return null;
  }
}

// Same atomicity discipline as saveState (src/shared.ts): write to a sibling
// temp file, rename over the target. facts.json is not part of `state.json`'s
// own compare-and-swap — the multi-agent race the incident exhibited was
// against state.json specifically — but a crash mid-write should not be able
// to leave a truncated facts.json either.
export function saveFacts(path: string, file: FactsFile): void {
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(file, null, 2) + '\n');
    renameSync(tmp, path);
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best-effort cleanup — the original is what matters and it is untouched */
    }
    throw err;
  }
}

export type Severity = 'pass' | 'warn' | 'fail';

export interface FactUsedInCheck {
  path: string;
  ok: boolean;
  detail: string;
}

export interface FactCheck {
  id: string;
  source: { ok: boolean; isExternal: boolean; detail: string };
  /** null when hash comparison does not apply (external source, or the source
   *  itself is missing — CASP-FACT-001 already covers that case). */
  hash: { applicable: boolean; ok: boolean | null; detail: string };
  ttl: { severity: Severity; detail: string };
  usedIn: FactUsedInCheck[];
  method: { ok: boolean; detail: string };
  /** null when there is no method to check a trap against. */
  trap: { applicable: boolean; hit: boolean; trapId?: string; why?: string; detail: string };
}

export type FactsAnalysis =
  | { adopted: false }
  | { adopted: true; malformed: true }
  | { adopted: true; malformed: false; checks: FactCheck[] };

const MARKER = (id: string) => `<!-- casp:fact ${id} -->`;

function checkOneFact(root: string, fact: FactEntry, extraTraps: string[]): FactCheck {
  const isExternal = fact.source.startsWith('external:');
  const label = fact.source.slice('external:'.length).trim();
  const sourceAbs = join(root, fact.source);
  const sourceExists = !isExternal && existsSync(sourceAbs);

  const source: FactCheck['source'] = isExternal
    ? {
        ok: label.length > 0,
        isExternal: true,
        detail: label.length > 0 ? `${fact.source} (external, no hash possible)` : 'external: source has no label'
      }
    : {
        ok: sourceExists,
        isExternal: false,
        detail: sourceExists ? fact.source : `${fact.source} not found in the repository`
      };

  let hash: FactCheck['hash'];
  if (isExternal || !source.ok) {
    hash = { applicable: false, ok: null, detail: 'not applicable' };
  } else if (!fact.source_hash) {
    hash = {
      applicable: true,
      ok: false,
      detail: 'no source_hash recorded — freshness cannot be verified against this source'
    };
  } else {
    const current = fileHash(sourceAbs);
    const ok = current === fact.source_hash;
    hash = {
      applicable: true,
      ok,
      detail: ok
        ? 'source hash matches the value recorded at verification'
        : `source changed since verification (recorded ${fact.source_hash}, now ${current ?? 'unreadable'})`
    };
  }

  let ttl: FactCheck['ttl'];
  if (!fact.ttl_days) {
    ttl = { severity: 'fail', detail: 'ttl_days is not set — every fact must declare one' };
  } else if (!fact.verified_at || Number.isNaN(Date.parse(fact.verified_at))) {
    ttl = { severity: 'fail', detail: `verified_at is missing or not a valid date ('${fact.verified_at ?? ''}')` };
  } else {
    const ageMs = Date.parse(todayISO()) - Date.parse(fact.verified_at);
    const ageDays = Math.floor(ageMs / 86_400_000);
    if (ageDays > fact.ttl_days * 2) {
      ttl = {
        severity: 'fail',
        detail: `verified ${fact.verified_at}, ttl ${fact.ttl_days}d, now ${ageDays}d old — more than double the TTL`
      };
    } else if (ageDays > fact.ttl_days) {
      ttl = {
        severity: 'warn',
        detail: `verified ${fact.verified_at}, ttl ${fact.ttl_days}d, now ${ageDays}d old — past TTL`
      };
    } else {
      ttl = { severity: 'pass', detail: `verified ${fact.verified_at}, ttl ${fact.ttl_days}d, now ${ageDays}d old` };
    }
  }

  const usedIn: FactUsedInCheck[] = (fact.used_in ?? []).map((p) => {
    const abs = join(root, p);
    if (!existsSync(abs)) return { path: p, ok: false, detail: `${p} not found in the repository` };
    const content = readFileSync(abs, 'utf8');
    const ok = content.includes(MARKER(fact.id));
    return {
      path: p,
      ok,
      detail: ok ? `carries the marker` : `missing '${MARKER(fact.id)}' marker`
    };
  });

  const methodPresent = typeof fact.method === 'string' && fact.method.trim().length > 0;
  const method: FactCheck['method'] = {
    ok: methodPresent,
    detail: methodPresent ? 'method recorded' : 'no method recorded — value is not reproducible'
  };

  let trap: FactCheck['trap'];
  if (!methodPresent) {
    trap = { applicable: false, hit: false, detail: 'no method to check' };
  } else {
    const hit = matchTrap(fact.method as string, extraTraps);
    trap = hit
      ? { applicable: true, hit: true, trapId: hit.id, why: hit.why, detail: `${hit.id}: ${hit.why}` }
      : { applicable: true, hit: false, detail: 'no known trap pattern' };
  }

  return { id: fact.id, source, hash, ttl, usedIn, method, trap };
}

/** Project-declared trap strings (facts.json's own `traps` array) are folded
 *  into every per-fact trap check — see matchTrap's substring-only contract. */
export function analyzeFacts(root: string, factsPath: string): FactsAnalysis {
  const file = loadFacts(factsPath);
  if (file === null) {
    // Distinguish "no file" (silent, not adopted) from "file present but not
    // even minimally shaped" (adopted intent, malformed content → FAIL).
    return existsSync(factsPath) ? { adopted: true, malformed: true } : { adopted: false };
  }
  const extraTraps = Array.isArray(file.traps) ? file.traps : [];
  const checks = file.facts.map((fact) => checkOneFact(root, fact, extraTraps));
  return { adopted: true, malformed: false, checks };
}
