# 26-06-10-002 — 0.3.0: false-green fix + state-bump recognition

## What shipped
- **No more false green when a claimed directory is missing.** A claim that
  cannot be verified (missing `session-logs/`, missing migrations dir, missing
  shipped-history dirs) now FAILs with a `cannot verify <claim>` finding instead
  of silently passing. Verdict-changing: a repo that reported green may now
  correctly report drift.
- **State-bump commit recognized as PASS.** `last_commit` reports PASS when it is
  the parent of HEAD and HEAD touches only the state surface (`casp/`,
  `docs/plan/sessions/`, `session-logs/`) — the canonical close-loop commit.

## Tests
- Missing-dir claims FAIL; state-bump commit PASSes. Suite green.
