# Cockpit — state management for AI coding sessions

> **Stop losing 30 minutes to context drift every morning.** Cockpit is a small CLI that keeps Claude Code, Cursor, and Aider sessions coherent across days, weeks, and feature gaps. State validator, drift detector, canonical templates. MIT, zero telemetry, no SaaS.

[![npm version](https://img.shields.io/npm/v/@justethales/cockpit.svg)](https://www.npmjs.com/package/@justethales/cockpit)
[![npm downloads](https://img.shields.io/npm/dm/@justethales/cockpit.svg)](https://www.npmjs.com/package/@justethales/cockpit)
[![license](https://img.shields.io/npm/l/@justethales/cockpit.svg)](https://github.com/justethales/cockpit-skill/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/justethales/cockpit-skill?style=social)](https://github.com/justethales/cockpit-skill)

```bash
npx @justethales/cockpit init      # scaffold cockpit/ in any project
npx @justethales/cockpit status    # one-screen "where am I"
npx @justethales/cockpit check     # validate state before push
```

Works with **Claude Code**, **Cursor**, **Aider**, **Continue**, or any agent that can run a CLI. Node ≥ 20. No account, no telemetry, nothing leaves your machine.

Built by [Thales (Juste Gnimavo)](https://thalesandhisaictoclaude.com) — solo CEO running six production products (Déblo, sh0, FLIN, that downstream project, 0cron, 0diff) with Claude as the only engineer. The cockpit is the layer that keeps months of AI-driven sessions from collapsing into drift.

---

## The bug Cockpit was built to kill

You finish a Claude Code session at 11 pm. You ship a feature. You think you closed your project's state files cleanly.

You open a fresh session at 9 am. The agent reads your project. It says "I see you shipped X yesterday, should I start Y?" You say yes.

Halfway through Y, the agent realises Y was already shipped two days ago. The state file pointed at the wrong next thing. You just burned 90 minutes on duplicate work.

**That is drift.** It is the single most common failure mode of long-running AI coding workflows — not bad code, not security holes, just the slow accumulation of "the project state says X but git history says Y" errors. Every wrong session starts with 30 minutes of re-orientation. Multiply by 200 sessions a year.

Cockpit fixes drift in four moves:

1. **Centralises session state** in one `state.json` (machine-readable single source of truth).
2. **Validates that state** against the filesystem and `git` on every push: `npx cockpit check`.
3. **Surfaces the state** in one screen for any fresh session: `npx cockpit status`.
4. **Templates the artifacts** every session produces (session prompt, session log, audit brief).

That is the whole product. No tracking pixels, no SaaS, no required login. MIT.

---

## Install

### Quickest path: no install

```bash
npx @justethales/cockpit init       # scaffold cockpit/ in current directory
npx @justethales/cockpit status     # one-screen snapshot
npx @justethales/cockpit check      # validate state.json against the world
```

Works in any directory. Requires Node ≥ 20.

### Global install

```bash
npm install -g @justethales/cockpit
cockpit init
cockpit status
cockpit check
```

### Project install (committed to package.json)

```bash
npm install --save-dev @justethales/cockpit
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "cockpit:status": "cockpit status",
    "cockpit:check": "cockpit check"
  }
}
```

Then `pnpm cockpit:status` / `pnpm cockpit:check` from any session.

### Claude Code skills (slash commands)

Cockpit ships two ready-to-drop [Claude Code skills](https://docs.claude.com/en/docs/claude-code/skills): `/cockpit` (read-only KPI lookups) and `/next` (auto-start the next session from `state.next_prompt`).

```bash
cp -r node_modules/@justethales/cockpit/skills/cockpit ~/.claude/skills/
cp -r node_modules/@justethales/cockpit/skills/next   ~/.claude/skills/
```

Now type `/cockpit` or `/next` in any Claude Code session. The skills wrap the CLI with the right pre-flight, fallback paths, and execution posture.

---

## 60-second quickstart

```bash
cd my-project
npx @justethales/cockpit init
```

Creates:

```
cockpit/
├── state.json          # machine-readable session state
├── now.md              # current focus (human-readable, one paragraph)
├── roadmap.md          # Next-3 to ship + phase scoreboard
├── README.md           # the protocol for your project
└── templates/
    ├── session-prompt.md
    ├── session-log.md
    └── audit-brief.md
```

Edit `cockpit/now.md` and `cockpit/roadmap.md` to describe your project. Edit `cockpit/state.json` to set the initial `current_phase` / `next_phase` / `next_prompt`.

Draft your first session prompt:

```bash
npx @justethales/cockpit new prompt --slug phase-1-first-slice
# edit docs/plan/sessions/PHASE-1-FIRST-SLICE.md
```

**At session start**, the agent runs:

```bash
npx @justethales/cockpit status
```

…which prints the snapshot and tells the agent which prompt file to open.

**At session close**, the agent runs (in order):

```bash
npx @justethales/cockpit new log --slug what-shipped       # write the log
# (edit the log, the prompt's frontmatter, now.md, roadmap.md, state.json)
npx @justethales/cockpit check                              # must hit 0 FAIL before push
git add . && git commit && git push
```

That is the whole loop.

---

## CLI reference

| Command | What it does |
|---|---|
| `cockpit init` | Scaffold `cockpit/` in the current directory. Idempotent — re-running it never overwrites existing files. |
| `cockpit status` | One-screen snapshot: package + branch + HEAD + current/next phase + next-prompt preview + last 10 commits + `now.md` focus + Next-3 from `roadmap.md`. `--plain` strips ANSI. |
| `cockpit check` | Validates `state.json` against the filesystem and `git`. Exits 1 on any FAIL. `--quiet` only prints on FAIL (CI-friendly). `--no-git` skips git-dependent checks. |
| `cockpit new prompt --slug X` | Copies the session-prompt template to `docs/plan/sessions/PHASE-<X>.md`. |
| `cockpit new log --slug X` | Copies the session-log template to `session-logs/YY-MM-DD-NNN-<X>.md`. |
| `cockpit --version` | Prints the installed version. |

Four verbs. None does anything magical.

---

## What the validator catches

```
$ npx @justethales/cockpit check

cockpit:check · 22 PASS · 2 WARN · 1 FAIL
──────────────────────────────────────────────────────────────────────
  PASS  state.json has 'next_prompt'
  PASS  next_prompt file exists · docs/plan/sessions/PHASE-1-AUTH.md
  FAIL  next_prompt is already SHIPPED · docs/plan/sessions/PHASE-1-AUTH.md has status: shipped — cockpit was not bumped after that session
        → either (a) update state.json.next_prompt to the real next slice, or (b) re-execute the shipped prompt explicitly
  WARN  last_commit is in history but not at HEAD · state=abc1234 HEAD=def5678
        → bump state.last_commit to def5678
  ...

✗ 1 drift detected. Fix before push.
```

Nine check categories, each with a one-line `→ fix` hint so the agent can resolve without re-reading docs:

1. `state.json.next_prompt` points at a missing file.
2. `state.json.next_prompt` points at a prompt with `status: shipped`. *(The exact bug Cockpit was built to catch.)*
3. `state.json.last_session_id` does not map to a session-log file.
4. `state.json.last_commit` not in `git log`.
5. `state.json.phases_shipped[]` has duplicates.
6. `state.json.migrations_applied[]` does not match the migrations directory.
7. A session prompt has `status: shipped` but `session_log: pending`.
8. A shipped prompt's `session_log:` points at a missing file.
9. Uncommitted changes in `cockpit/`, `docs/plan/sessions/`, or `session-logs/`.

---

## Works with your agent

| Agent | Status | Notes |
|---|---|---|
| **Claude Code** | First-class | Ships `/cockpit` and `/next` slash-command skills. Drop into `~/.claude/skills/`. |
| **Cursor** | Works | The CLI is just a CLI. Cursor agents can call it via terminal tools. |
| **Aider** | Works | Run `cockpit status` / `cockpit check` as shell commands inside the chat. |
| **Continue** | Works | Same: shell-command tool wraps the CLI. |
| **Plain shell + your favourite model** | Works | Cockpit was designed before slash-commands existed. The CLI is the contract. |

The discipline transfers to anything that drives a repo in a session loop. The Claude Code skills bundle is the only agent-specific piece, and it is optional.

---

## Philosophy

Three opinions baked into Cockpit. Take them or fork it.

### 1. Templates are gates, not guidance.

Every session produces three artifacts: the session prompt (drafted at the end of the *previous* session), the session log (written at the end of *this* session), and the audit brief (for the post-implementation auditor). All three have an implicit shape that prior projects had to discover by mirroring earlier files. Cockpit's templates make the shape explicit. When you draft a new prompt, run `cockpit new prompt --slug X`. Do not copy-paste a prior one.

### 2. Validate state, not intent.

The validator checks metadata: "does `state.json.next_prompt` point at a queued prompt, and does that prompt's frontmatter say `queued`?". It cannot check intent — whether your `now.md` paragraph accurately describes what was built. That is a humans-and-honest-self-review job. The post-implementation audit catches code-vs-spec drift. Nothing catches description-vs-reality drift. Acknowledge this. Do not over-engineer it.

### 3. `cockpit check` is mandatory before push, no exceptions.

The ~200 ms cost of the validator is negligible. The cost of drift surfacing at session-start the next day is real (10–30 minutes of confusion). Make the validator a `pre-push` gate (manually, via a hook, or via team discipline). The day you skip it is the day you ship a `state.json` that lies about what was done.

---

## What this is NOT

- **Not a task tracker.** Use Linear, Jira, GitHub Issues. Cockpit is about *which session ships next*, not *which issues are open*.
- **Not a project management tool.** No timelines, no story points, no burndown charts.
- **Not a CI tool.** It runs locally. You can wire it into CI as a pre-push check, but it does not replace your test runner.
- **Not opinionated about your code.** Cockpit cares about session state. Your code can be Rust, Python, TypeScript, Go, anything.
- **Not a replacement for `CLAUDE.md`.** `CLAUDE.md` is your project's constitution (rules, conventions, do/don't). Cockpit is the operating state on top of it.

---

## Project structure conventions

Cockpit assumes:

```
your-project/
├── cockpit/                    # the cockpit
│   ├── state.json
│   ├── now.md
│   ├── roadmap.md
│   ├── README.md
│   └── templates/
├── docs/plan/sessions/         # session prompts
│   ├── PHASE-1-AUTH.md
│   ├── PHASE-2-PROFILE.md
│   └── ...
├── session-logs/               # session logs
│   ├── 26-05-30-001-phase-1-auth.md
│   ├── 26-05-30-002-phase-2-profile.md
│   └── ...
└── (your code)
```

Paths are currently hardcoded in the validator. Configurable paths are tracked for v0.2 if there is demand — open an issue if your project layout differs.

---

## Real-world example

Cockpit was extracted from the workflow that ships [ZeroSuite](https://thalesandhisaictoclaude.com) — six production products built solo with Claude as the only engineer:

- [Déblo](https://deblo.ai) — AI tutor for African students, FastAPI + SvelteKit + React Native.
- [sh0](https://sh0.dev) — voice-first commerce, Rust microservices.
- [FLIN](https://flin.dev) — compiler tooling.
- [that downstream project](https://a downstream project) — fee aggregator, FastAPI + SolidJS.
- [0cron](https://0cron.dev) — cron-as-a-service.
- [0diff](https://0diff.dev) — diff visualisation.

Each project has its own `cockpit/`. Every session ends with `pnpm cockpit:check` exiting 0. The validator has caught a real bug at least once a week — see the [introduction post](https://thalesandhisaictoclaude.com) for the story behind v0.1.

---

## FAQ

**Does this require Claude Code?**
No. The CLI works standalone with any agent that runs shell commands. The `/cockpit` and `/next` slash-command skills are an optional bundle for Claude Code users.

**Does this work for Cursor, Aider, Continue, or other AI coding agents?**
Yes. The CLI is just a CLI. Any agent that can run shell commands and read files can use it.

**What about Python, Rust, Go projects?**
The CLI is Node-only (TypeScript via `tsx`). You can use it via `npx` without committing Node as a project dependency. A binary distribution is a one-day port — file an issue if you want it.

**Can I customise the templates?**
Yes. After `cockpit init`, the templates live in your project at `cockpit/templates/`. Edit them freely. `cockpit new prompt|log` copies from your project's templates first, falling back to the bundled defaults.

**What if my project does not have phases?**
Cockpit uses "phase" as a generic word for "unit of work that ships together." Map it to epic, milestone, sprint, or release — same machinery.

**Is the cockpit data sent anywhere?**
No. Zero network calls. Zero telemetry. Cockpit reads your filesystem and your `git`. Nothing leaves your machine.

**Why "Cockpit"?**
Before every flight, pilots run a pre-flight checklist from the cockpit panel. Same idea: a small, dense, mandatory check before every push.

**Where do I report bugs or feature requests?**
[github.com/justethales/cockpit-skill/issues](https://github.com/justethales/cockpit-skill/issues)

**How do I cite this in a blog post or paper?**
`Gnimavo, J. (2026). Cockpit: state management for AI coding sessions. https://github.com/justethales/cockpit-skill`

---

## Roadmap

- **0.2** — Configurable paths (move `docs/plan/sessions/`, `session-logs/`, `drizzle/` per project).
- **0.3** — Native binaries for Python / Rust / Go shops that do not want Node.
- **0.4** — `cockpit rollback` for un-shipping a phase that turned out broken in production.
- **0.5** — Optional pre-push git hook installer (`cockpit install-hook`).
- **Long-term** — `cockpit lint` for prose-vs-reality checks via local LLM.

Vote on the roadmap with [GitHub issues / reactions](https://github.com/justethales/cockpit-skill/issues).

---

## License

MIT. Use it, fork it, ship it.

If Cockpit saves you 30 minutes a week, that is enough payback. If you want to say thanks: star the [GitHub repo](https://github.com/justethales/cockpit-skill), share the [blog post](https://thalesandhisaictoclaude.com), or [say hi on X](https://x.com/JusteThales).

---

*Cockpit is a small CLI. Most of the value is in the discipline it forces, not in the lines of code. Read the [blog post](https://thalesandhisaictoclaude.com) for the full story behind the pattern.*
