# 26-06-10-003 — 0.3.1: Alembic + multi-log field fixes

## What shipped
- **Alembic (Python) migrations recognized.** The migrations check now accepts
  `.sql` and `.py`, ignoring dunder entries — a Python migrations dir no longer
  reports a false FAIL.
- **Multi-log `session_log` values supported** (YAML list or comma-separated):
  each entry is resolved independently; a FAIL names only the missing entries.

## Tests
- Two new regression tests. Suite green.
