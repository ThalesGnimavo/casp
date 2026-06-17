# Changelog

## 0.6.0 — 2026-06-17

> **Behavior change — `casp next` now gates on drift.** `casp next` runs the validator before printing and **refuses to emit the next prompt when the state has drifted** (exit 1, drift summary on stderr, nothing on stdout). This is intentional: it closes the *start* boundary the same way `install-hook` closes the *push* boundary. If you script `casp next` and rely on it always printing, add `--no-check` to restore the old behavior. Both boundaries are now gated — you can neither start nor finish a session on a lying state.

- **New — `casp next` pre-session gate.** Before printing the next prompt, `casp next` runs the same in-process validator as `casp check` (`checkOne` — it never shells out to itself) and refuses on any FAIL: drift summary to stderr, stdout stays empty, exit 1. The missing-file and already-shipped cases keep their existing sharper messages; the gate catches the rest (stale `last_commit`, unverifiable claims, …). `--no-check` is the explicit escape hatch (you own the drift); `--no-git` skips the git-dependent checks. `next` stays a printer — it never runs anything after printing (anti-roadmap). Four new tests: clean prints, drift refuses with empty stdout, `--no-check` bypasses, missing-prompt keeps its specific guard.

- **New — `casp verify <commit>` + `casp state diff`.** Two read-only inspection verbs that make "git log is your compliance trail" actionable. `casp verify <commit>` materializes a commit in a throwaway detached worktree, runs the exact same validator there, propagates the verdict, and ALWAYS removes the worktree (the exit code is computed inside the try and applied after the finally, since `process.exit()` skips finally blocks — exiting mid-try would leak the worktree). `casp state diff [A] [B]` reports a field-level diff of `casp/state.json` between two commits (default `HEAD~1` → `HEAD`), with element-level deltas for array fields like `phases_shipped`; human output, or `--json`. Both never mutate the worktree, index, or history. Five new tests: state diff array/field deltas + no-op, verify clean (exit 0, no leaked worktree), verify a historically drifted commit (exit 1, still cleans up), verify a non-commit (exit 1).

- **New — `casp status --json`.** A machine-readable continuity snapshot: current/next phase, next prompt + its status, last commit/session, shipped/queued counts, git head/branch/ahead, and an **embedded validator verdict** computed in-process (the same `checkOne` `check` runs). Stable schema documented in [docs/status-json.md](docs/status-json.md) with the same stability promise as check-json. Crucially, `status --json` **never gates** — a valid cockpit always exits `0`, even when the embedded verdict is `drift` (reporting is not gating; that is `check`'s and `next`'s job). The structured session handoff, and the unit a future `status --all` fleet roll-up would aggregate (sketched, not built). Three new tests: shape + clean verdict, drift embedded but exit 0, human output intact.

- **New — `casp install-hook`.** One verb writes an executable `.git/hooks/pre-push` that runs `casp check --quiet`, turning "check before every push" from discipline into mechanism. This is the install-hook tier-1 item: a hands-off self-verifying loop auto-commits and pushes — it will not run `casp check` by hand — so wiring the deterministic state gate into `pre-push` is what makes CASP fire *inside* the autonomous loop instead of being a step the agent skips. The harness self-verifies that the *code* works; `casp check` on every push self-verifies that the *recorded state* still matches git, the one check the loop structurally can't do for itself.
- **Safe by construction.** The hook carries a `CASP-MANAGED-HOOK` marker. Installing refuses to clobber a pre-existing foreign `pre-push` hook unless `--force`; re-installing over CASP's own hook is idempotent (refresh, exit 0). `casp install-hook --remove` uninstalls only a hook CASP wrote, and refuses a foreign one. The hook resolution prefers `npx --no-install @justethales/casp` (the locally-installed package, no network) and falls back to a `casp` on PATH — probing with `--version` first so "package not resolvable" never gets mistaken for the check's own drift verdict.
- **Boundaries held.** Explicit opt-in only — `casp init` never installs the hook. CASP never writes `core.hooksPath` or any git config; when `core.hooksPath` is set (git ignores `.git/hooks` then), the verb refuses with a clear message rather than writing a silently-dead hook. Worktrees and `.git`-as-a-file resolve correctly (the path comes from `git rev-parse --git-path`).
- Eight new regression tests (42 total): hook installed + executable + marked; idempotent re-install; the installed hook run directly **blocks a drifted push (exit 1)** and **passes a clean one (exit 0)** via the documented `casp`-on-PATH fallback; foreign-hook refusal + `--force` override; `--remove` removes ours and refuses a stranger; `core.hooksPath` set → refuse without touching the config; linked-worktree resolution to the common hooks dir; outside a git repo → exit 1.

## 0.5.0 — 2026-06-16

- **New — configurable `sessions_dir` / `logs_dir`.** Two OPTIONAL `state.json` keys let a project point the validator at its real layout instead of adopting CASP's. Prompts still default to `docs/plan/sessions` and logs to `session-logs`; set either key and the *entire* protocol honors it — `casp check` (every claim, the shipped-history dirs, the state-bump surface, the uncommitted-changes pathspec), `casp new prompt|log`, `casp ship` (the wired `session_log` pointer), and `casp close` (newest-log detection). All messages print the **resolved** path, never the hardcoded default. Backward-compatible: a repo that sets neither key behaves exactly as before (every prior test stays green). Minor bump for new schema keys. Motivated by onboarding **a downstream project**, whose existing layout the hardcoded paths forced it to abandon.
- **Single resolver, one source of truth.** The three state-surface directories (sessions, logs, migrations) now resolve in one place (`resolveDirs` in `shared.ts`) — composed per-root so `check --all` honors each cockpit's own layout. `migrations_dir` keeps its existing no-default, opt-in semantics (a project with no migration concept reports none).
- **Out of scope, documented.** A single rolling next-prompt FILE (one `NEXT-SESSION-PROMPT.md` rather than a directory of per-session prompts) is **not** modeled — `next_prompt` already points at any file today, and `sessions_dir` governs the directory `check` scans and `new`/`ship` write into, not a single-file lifecycle. Modeling a rolling file is a different concept and was deliberately not built.
- Four new regression tests (34 total): custom-layout clean repo passes; a claim against a missing CUSTOM dir FAILs with the resolved name; shipped-history FAILs name the configured dirs; `new`/`ship`/`close` all write into the configured layout.

## 0.4.2 — 2026-06-16

- **Fix — `casp check --all <absolute path>` no longer doubles the path.** The optional root argument was `join`ed onto the current directory unconditionally, so an absolute root (`casp check --all /Users/me/projects`) became `<cwd>/Users/me/projects` and reported "no casp/ cockpit found." It now `resolve()`s the argument — an absolute root is used as-is; a relative root still resolves against the cwd; the no-arg (cwd) form is unchanged. Found within minutes of dogfooding `check --all` across the workspace for the fleet-gate launch. One new regression test (30 total).

## 0.4.1 — 2026-06-15

- **Fix — a fresh `casp init` is now green under `casp check` out of the box.** `init` scaffolded a `state.json` whose `next_prompt` pointed at `docs/plan/sessions/PHASE-1-FIRST-SLICE.md`, but never created that file — so the very first `casp check` a new user runs (step 5 of `init`'s own printed instructions) FAILed with "next_prompt points at a missing file." `init` now also scaffolds the `docs/plan/sessions/` and `session-logs/` directories and writes that first session prompt (from the canonical template, status `queued`). A brand-new repo now goes `init → status → check` with **0 FAIL**. Idempotent — an existing prompt is never overwritten. Found by onboarding a real project (a downstream project).

## 0.4.0 — 2026-06-15

- **New — `casp ship <slug>`.** The mechanical half of closing a session, automated: flips the phase's prompt to `status: shipped`, wires its `session_log` pointer, and moves the slug from `phases_queued` to `phases_shipped`. Resolves the slug against `docs/plan/sessions/*.md` by normalized name (so `0.4-close-loop` matches `PHASE-04-CLOSE-LOOP.md`), or takes `--prompt <path>`. Idempotent on re-run; refuses an unknown slug or a `pending` session-log id. **Touches no git** — the operator owns the commit.
- **New — `casp close`.** The guided deterministic close: auto-detects `last_commit` (HEAD) and `last_session_id` (newest session log), lets you confirm or override them (`--yes` / `--commit` / `--log` for non-interactive use), bumps `updated_at`, then runs `check` and exits with its verdict. `last_commit` is set to the current HEAD so the operator's own state-bump commit lands as the canonical close-loop PASS. **Never runs git** — no add, commit, or push. A state verb, not a harness.
- **New — `casp check --all [root]`.** Validates every `casp/` cockpit under a root in one report (per-cockpit verdict + aggregate), exits 1 if any cockpit drifts. `--all --json` emits a per-cockpit array under the existing schema. The fleet gate for "many agents, many repos." Internally, per-root validation was extracted into a pure `checkOne(root)` — single-root output and exit code are unchanged.
- **Change — migrations are now fully opt-in.** A project with no `migrations_dir` and no `migrations_applied` gets **no migration finding at all** (not even a PASS), so non-code cockpits (content, launch ops, research) carry zero migration noise. `casp init` no longer scaffolds `migrations_dir: "drizzle"`. A non-empty `migrations_applied` with no `migrations_dir` set is drift (FAIL): a claim with nothing to verify against. Existing repos that declare `migrations_dir` are unaffected.
- Ten new regression tests (27 total) covering ship, close (including the never-commits invariant), optional-migration silence, and `--all` aggregation.

## 0.3.2 — 2026-06-11

- **Docs only.** No code or CLI behavior change. Existing installs at 0.3.1 keep working unchanged.
- **The public roadmap is now the validated one.** Order by leverage: `install-hook` first (the gate stops being optional), then the pre-session gate on `casp next`, configurable paths, `status --json`, `verify <commit>` + `state diff`, and a demand-gated tail (binaries, narrow rollback, CI installer, webhook notifier). **`casp lint` is cut** — an LLM verb inside the CASP binary, even advisory, would undercut the deterministic claim; prose-vs-reality checking belongs in the agent reading `casp/`.

## 0.3.1 — 2026-06-10

- **Fix — Alembic (Python) migrations are now recognized.** The `migrations.match` check only counted `.sql` files, so a Python shop (`backend/alembic/versions/`) got a guaranteed false FAIL: every applied revision reported as missing from disk. The filter now accepts `.sql` and `.py`, ignoring dunder entries (`__init__.py`, `__pycache__`). Found within minutes of running 0.3.0 against a production FastAPI/Alembic repo (a production repo).
- **Fix — multi-log `session_log` values are supported (YAML list or comma-separated).** A phase shipped across several sessions legitimately lists all its logs in one frontmatter value (`session_log: [session-logs/a.md, session-logs/b.md]`). The validator treated the whole value as a single path and FAILed. Each entry is now resolved independently (repo-relative), and a FAIL names only the entries that are actually missing.
- Two new regression tests (17 total).

## 0.3.0 — 2026-06-10

- **Fix (verdict-changing) — no more false green when a claimed directory is missing.** A check that cannot find what it needs no longer silently skips: when `state.json` makes a claim that requires a directory and that directory is absent, `casp check` now **FAILs** with a `cannot verify <claim>` finding. Three claims are enforced: a real `last_session_id` requires `session-logs/` (`last_session.logs_dir`), a non-empty `migrations_applied` requires the migrations directory (`migrations.dir` — the canonical drift example itself was a false green when the dir was missing), and a non-empty `phases_shipped` requires both `docs/plan/sessions/` and `session-logs/` (`shipped_history.*`). Fresh-init placeholders and empty arrays are not claims and do not FAIL. **Repos that previously reported green may now correctly report drift — re-run `casp check` everywhere after upgrading.** Minor version bump for exactly that reason.
- **Fix — the canonical close loop no longer ends in a permanent WARN.** `last_commit` now reports **PASS** when it is the parent of HEAD and the HEAD commit touches only the state surface (`casp/`, `docs/plan/sessions/`, `session-logs/`) — the state-bump commit the protocol itself prescribes. Any other commit past `last_commit` stays WARN. `casp check` on CASP's own repo is now fully green (13 PASS · 0 WARN · 0 FAIL), previously a permanent explainable WARN.
- **Change — `last_session_id: "pending"` is now a WARN, not a FAIL.** Consistent with `last_commit: "pending"`: a fresh-init placeholder is not a verifiable claim. A fresh parked cockpit checks clean.
- **Hardening (from the two-auditor review).** An empty-string `last_session_id` now FAILs (`last_session.id_empty`) instead of silently skipping the check; every claim-backed path must be a real **directory** — a file squatting `session-logs/`, `docs/plan/sessions/` or the migrations dir reports a clean FAIL instead of crashing `readdirSync` (which also broke the `--json` always-valid guarantee).
- Nine new regression tests (15 total) covering the false-green class, placeholder semantics, state-bump recognition, and the file-squatting crash paths.


## 0.2.4 — 2026-06-10

- **New — `casp check --json`.** Machine-readable validator report: every check category as structured PASS/WARN/FAIL findings (stable `id`, `label`, `detail`, `fix`), plus `verdict`, `exit_code` and a `summary` block. The schema is documented in `docs/check-json.md` and versioned (`schema_version: 1`, bumps only on breaking changes). Strictly additive: the default human-readable output is unchanged, and the exit-code contract is identical — `--json` changes the *format* of the report, never the verdict. Even a missing or unparsable `casp/state.json` emits well-formed JSON (single `state.file` FAIL finding), so consumers never need a non-JSON fallback. Covered by four new tests in `npm test`.
- **Internal — version helper moved to `shared.ts`** (`pkgVersion()`), so both the CLI banner and the JSON report read the version from `package.json` at runtime. No behavior change.
- **Fix — `casp init` no longer scaffolds `.DS_Store`.** A Finder junk file sitting in a local clone's `templates/` was copied into the user's `casp/` directory (found by dogfooding `casp init` on the CASP repo itself; published npm installs were unaffected since `npm pack` strips `.DS_Store`).
- **CASP now manages itself.** The repo carries its own `casp/` cockpit (`state.json`, `now.md`, `roadmap.md`), session prompts and session logs — `casp check` runs green on the CASP repo before every push. Recursive validation: the tool that gates state drift is itself gated.

## 0.2.3 — 2026-06-10

- **Docs only.** No code or CLI behavior change. Existing installs at 0.2.2 keep working unchanged.
- **Repositioned the README and `package.json` description for the autonomous-model era.** The headline now leads with the deterministic, model-agnostic wedge — *the model holds the context; CASP proves the state is true, against git* — and frames CASP as the **complement** to long-running autonomous coding models (Claude Code today, any model next), not a competitor to their in-session memory. The prior "runs the whole roadmap / never loses the thread" line collided with how the new model generation now markets itself.

## 0.2.2 — 2026-06-09

- **Fix — `casp check` no longer FAILs a legitimately parked project.** `next_phase` and `next_prompt` may now be `null` (a project with no queued next slice — launch hold, roadmap complete, frozen). The keys must still be present, but an explicit `null` reports as PASS ("parked — no queued next slice") instead of a drift FAIL. Previously a parked `state.json` (e.g. a project in launch-mode hold) produced two false FAILs and blocked the push.
- **Fix — `casp --version` derives from `package.json` at runtime.** The version is no longer a hardcoded constant in `src/cli.ts` (which had silently desynced: the CLI reported `0.2.0` while npm shipped `0.2.1`). This is the same class of bug fixed by hand in 0.1.2 and regressed in 0.2.0; reading `package.json` removes the manual step for good.
- Exit-code contract still covered by `npm test` (clean → 0, drift → 1); both fixes verified green.

## 0.2.1 — 2026-06-09

- **Docs only.** No code or CLI behavior change. Existing installs at 0.2.0 keep working unchanged.
- **Repositioned the README and `package.json` description.** The headline now leads with the outcome — *your AI agent runs the whole project roadmap across sessions, writes its own next-session prompt, logs every session, and can't lose the thread* — with drift-detection kept as the trust guarantee rather than the pitch. The old "refuses to let your state lie" tagline was a previous agent's framing that buried the actual value.

## 0.2.0 — 2026-06-08

- **BREAKING — renamed Cockpit → CASP (Coding-Agent State Protocol).** The name "Cockpit" collided head-on with Red Hat Cockpit (cockpit-project.org); CASP relaunches the tool as a *protocol*, positioned the way MCP positioned itself.
- **npm package renamed `@justethales/cockpit` → `@justethales/casp`.** Install is now `npm i -g @justethales/casp` (the bare name `casp` is blocked by npm's name-similarity policy, so the package stays scoped; the CLI command is still `casp`). The old package is frozen; existing installs must reinstall under the new name.
- **CLI binary renamed `cockpit` → `casp`.** All verbs keep their names: `casp init | status | check | next | new prompt | new log`.
- **Slash-command `/cockpit` → `/casp`** (read-only status). `/next` is unchanged. The skills bundle directory moved `skills/cockpit/` → `skills/casp/`.
- **Scaffolded directory renamed `cockpit/` → `casp/`.** `casp init` now writes `casp/state.json`, `casp/now.md`, `casp/roadmap.md`, `casp/README.md`. Projects on the old layout should `git mv cockpit casp` once.
- **New verb `casp next`** — prints the next session's prompt straight from `state.next_prompt` (the CLI analogue of `/next`), pipe-friendly and non-zero when there is no actionable prompt.
- **`casp check` exit-code contract is now tested** (`npm test`): clean state → exit 0, drifted state → exit 1. The CI status check is real, not decorative.
- Repository moved to `github.com/ThalesGnimavo/casp`; homepage is `https://casp.sh`. Positioning, README and `package.json` description now lead with drift-detection / state-validation ("validates state against git — doesn't just store it"), not "memory".

## 0.1.2 — 2026-06-04

- **Docs only.** No code or CLI behavior change. Existing installs at 0.1.1 keep working unchanged.
- Repository migrated from `github.com/justethales/cockpit-skill` to `github.com/ThalesGnimavo/cockpit-skill` (GitHub username rename). All README badges, links, `package.json` repository/homepage/bugs, and source-file references updated.
- npm package name unchanged: still `@justethales/cockpit`. `npm i @justethales/cockpit` continues to work for all users.
- Fixed stale `VERSION = '0.1.0'` constant in `src/cli.ts` so `cockpit --version` now reports the correct release.
- Fixed dead `@thales/cockpit` reference still present in `templates/README.md` (the 0.1.1 cleanup missed this one).
- X/Twitter handle in README updated to `@ThalesGnimavo`.

## 0.1.1 — 2026-05-31

- **Docs only.** No code changes.
- README rewritten for clarity + npm/Google discoverability: stronger H1, badges, npm-friendly elevator pitch, agent compatibility matrix (Claude Code, Cursor, Aider, Continue), CLI reference table, citation block, public roadmap.
- `package.json` description rewritten and `keywords` expanded.
- Dropped the inflated "200-line discipline" claim from description and README — the validator alone is ~500 lines.
- Fixed the dead `@thales/cockpit` install commands left in the README. Everything now points at `@justethales/cockpit`.
- Bumped CHANGELOG to reflect that `check` ships 9 categories (the 0.1.0 entry said 7).

## 0.1.0 — 2026-05-30

Initial release.

- `cockpit init` — scaffolds a `cockpit/` directory with `state.json`, `now.md`, `roadmap.md`, `README.md`, and the three canonical templates (`session-prompt.md`, `session-log.md`, `audit-brief.md`).
- `cockpit check` — validator with 7 categories. Exits 1 on FAIL. ANSI output. `--quiet` flag for CI.
- `cockpit status` — one-screen snapshot. `--plain` flag strips ANSI.
- `cockpit new prompt --slug X` — copies the session-prompt template to `docs/plan/sessions/`.
- `cockpit new log --slug X` — copies the session-log template to `session-logs/`.
- Claude Code skills bundle (`skills/cockpit/`, `skills/next/`) — drop into `~/.claude/skills/` for instant `/cockpit` and `/next` slash commands.
