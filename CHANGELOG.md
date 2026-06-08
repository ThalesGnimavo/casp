# Changelog

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
