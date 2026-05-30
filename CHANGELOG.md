# Changelog

## 0.1.0 — 2026-05-30

Initial release.

- `cockpit init` — scaffolds a `cockpit/` directory with `state.json`, `now.md`, `roadmap.md`, `README.md`, and the three canonical templates (`session-prompt.md`, `session-log.md`, `audit-brief.md`).
- `cockpit check` — validator with 7 categories. Exits 1 on FAIL. ANSI output. `--quiet` flag for CI.
- `cockpit status` — one-screen snapshot. `--plain` flag strips ANSI.
- `cockpit new prompt --slug X` — copies the session-prompt template to `docs/plan/sessions/`.
- `cockpit new log --slug X` — copies the session-log template to `session-logs/`.
- Claude Code skills bundle (`skills/cockpit/`, `skills/next/`) — drop into `~/.claude/skills/` for instant `/cockpit` and `/next` slash commands.
