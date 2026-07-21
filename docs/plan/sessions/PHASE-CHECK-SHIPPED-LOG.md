---
status: shipped
session_id: 26-07-21-001-check-shipped-log
session_log: session-logs/26-07-21-001-check-shipped-log.md
drafted_at: 2026-06-10
next_after: 26-07-18-001-queue-upgrade-command
---

# Session — check-shipped-log : new drift category — phases_shipped ↔ session logs

> **Status : QUEUED.** Validated Tier-1 #4 — the one accepted rails candidate
> (3 of 7 held the bar). PROTOCOL bucket: new deterministic, metadata-only,
> git-verifiable drift category.
>
> **Goal.** Every `phases_shipped[]` entry must map to at least one session-log
> file (deterministic mapping via the log filename/frontmatter convention —
> settle the exact rule BEFORE coding and document it in the README).

**Project root.** `/Users/juste/ZeroSuite/casp-sh/casp-core`
**Expected size.** 1-2 h. No schema change (read-only over existing artifacts).

## MUST HAVE

1. Define the deterministic mapping (proposal: a log whose frontmatter or H1 references the phase id, OR a `phase:` key in the log template — pick the one that needs NO heuristic; if none exists without a template change, the template change is part of this slice and must be flagged as protocol).
2. Implement as check category 10; severity FAIL; `→ fix` hint.
3. Tests: shipped phase with no log → FAIL; retroactively-adopted repo pattern documented (how to backfill or annotate pre-CASP phases without lying).
4. README category list + CHANGELOG.

## DO NOT
- No fuzzy matching, no "looks like" — if the mapping needs a guess, stop and redesign.
