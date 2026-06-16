# 26-06-16-002 — 0.5.0: configurable `sessions_dir` / `logs_dir`

## What shipped
- Two OPTIONAL `state.json` keys, `sessions_dir` / `logs_dir`, let a project point
  the validator at its real layout instead of adopting CASP's. Set either and the
  entire protocol honors it — `casp check` (every claim, shipped-history dirs, the
  state-bump surface, the uncommitted-changes pathspec), `casp new prompt|log`,
  `casp ship` (the wired `session_log` pointer), `casp close` (newest-log
  detection). All messages print the resolved path.
- Single resolver `resolveDirs(root, state)` in `shared.ts` — one source of truth,
  composed per-root so `check --all` honors each cockpit's own layout.
- Backward-compatible: a repo that sets neither key behaves exactly as before.

## Tests
- Four new regression tests (34 total): custom-layout clean repo passes; a claim
  against a missing custom dir FAILs with the resolved name; shipped-history FAILs
  name the configured dirs; `new`/`ship`/`close` write into the configured layout.
