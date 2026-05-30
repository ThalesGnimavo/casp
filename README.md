# Cockpit

> **A 200-line discipline for AI-coding sessions.** Machine-verifiable session state + drift validator + canonical templates. Works with Claude Code, Cursor, or anything that drives a repo with a session loop.

Built by [Thales (Juste Gnimavo)](https://thalesandhisaictoclaude.com) — solo CEO running six production products with one AI engineer. The cockpit is the operating system that keeps those sessions coherent across days, weeks, and feature gaps.

[Read the full story](https://thalesandhisaictoclaude.com) — the blog post that introduced this pattern explains the WHY. This README explains the HOW.

---

## Why this exists

You finish a Claude Code session at 11pm. You ship a feature. You think you closed the cockpit cleanly.

You open a fresh session at 9am. The agent reads your project's docs. It tells you "I see you shipped X yesterday — should I start Y?" You say yes.

Halfway through Y, the agent realizes Y was already shipped two days ago. The cockpit pointed at the wrong next thing. You just burned 90 minutes on a duplicate.

**That's drift.** It's the single most common failure mode of long-running AI coding workflows. Not bad code. Not security holes. Just the slow accumulation of "the cockpit says X but the code does Y" errors that eventually make the next session start with 30 minutes of re-orientation.

The cockpit fixes drift by :

1. **Centralizing session state** in one `state.json` file (machine-readable).
2. **Validating that state** against the filesystem and git on every push (`npx cockpit check`).
3. **Surfacing the state** in one screen for any fresh session (`npx cockpit status`).
4. **Templating the artifacts** every session produces (prompt + log + audit brief).

That's it. No tracking pixels, no SaaS, no required login. MIT license. 200 lines of TypeScript you can read in 10 minutes.

---

## Install

### Quick start (no install)

```bash
npx @thales/cockpit init       # scaffold cockpit/ in current directory
npx @thales/cockpit status     # one-screen snapshot
npx @thales/cockpit check      # validate state.json against the world
```

Works in any directory. Requires Node ≥ 20.

### Global install (CLI everywhere)

```bash
npm install -g @thales/cockpit
cockpit init
cockpit status
cockpit check
```

### Project install (committed to package.json)

```bash
npm install --save-dev @thales/cockpit
```

Add to `package.json` scripts :

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

```bash
cp -r node_modules/@thales/cockpit/skills/cockpit ~/.claude/skills/
cp -r node_modules/@thales/cockpit/skills/next ~/.claude/skills/
```

Now type `/cockpit` or `/next` in any Claude Code session. The skills wrap the CLI with the right pre-flight, fallback paths, and execution posture.

---

## Quickstart

```bash
cd my-project
npx cockpit init
```

That creates :

```
cockpit/
├── state.json          # machine-readable session state
├── now.md              # what's the current focus (human-readable)
├── roadmap.md          # Next 3 to ship + phase scoreboard
├── README.md           # the protocol for your project
└── templates/
    ├── session-prompt.md
    ├── session-log.md
    └── audit-brief.md
```

Edit `cockpit/now.md` and `cockpit/roadmap.md` to describe your project. Edit `cockpit/state.json` to set the initial `current_phase` / `next_phase` / `next_prompt`.

Draft your first session prompt :

```bash
npx cockpit new prompt --slug phase-1-first-slice
# edit docs/plan/sessions/PHASE-1-FIRST-SLICE.md
```

At session start, the agent runs :

```bash
npx cockpit status
```

…which prints the snapshot and tells the agent which prompt file to open.

At session close, the agent runs (in order) :

```bash
npx cockpit new log --slug what-shipped       # write the log
# (edit the log, the prompt's frontmatter, now.md, roadmap.md, state.json)
npx cockpit check                              # 0 FAIL before push
git add . && git commit && git push
```

That's the loop.

---

## What the validator catches

```
$ npx cockpit check

cockpit:check · 22 PASS · 2 WARN · 1 FAIL
──────────────────────────────────────────────────────────────────────
  PASS  state.json has 'next_prompt'
  PASS  next_prompt file exists · docs/plan/sessions/PHASE-1-AUTH.md
  FAIL  next_prompt is already SHIPPED · docs/plan/sessions/PHASE-1-AUTH.md has status: shipped — cockpit was not bumped after that session
        → either (a) update state.json.next_prompt to the real next slice, or (b) re-execute the shipped prompt explicitly
  ...
  WARN  last_commit is in history but not at HEAD · state=abc1234 HEAD=def5678
        → bump state.last_commit to def5678
  ...

✗ 1 drift detected. Fix before push.
```

Eight check categories. The full list is in [cockpit/README.md](templates/README.md) after init. The high-value ones :

- `state.json.next_prompt` points at a missing file or a `shipped` prompt.
- `state.json.last_session_id` doesn't map to a session-log file.
- `state.json.last_commit` not in `git log`.
- `state.json.phases_shipped[]` has duplicates.
- `state.json.migrations_applied[]` doesn't match the migrations directory.
- A session prompt has `status: shipped` but no `session_log:` pointer.
- Uncommitted changes in cockpit-area files.

Each failure prints a `→ fix` hint.

---

## Philosophy

Three opinions baked into the cockpit. Take them or fork it.

### 1. **Templates are gates, not guidance.**

Every session produces three artifacts : the session prompt (drafted at the end of the *previous* session), the session log (written at the end of *this* session), and the audit brief (used to spawn the post-implementation auditor). All three have an implicit shape that prior projects had to discover by mirroring earlier files. The cockpit's templates make that shape explicit. When you draft a new prompt, run `cockpit new prompt --slug X` — don't copy-paste a prior one.

### 2. **Validate state, not intent.**

The validator checks metadata : "does `state.json.next_prompt` point at a queued prompt, and does that prompt's frontmatter say `queued`?". It cannot check intent — whether your `now.md` paragraph accurately describes what was built. That's a humans-and-honest-self-review job. The post-implementation audit catches code-vs-spec drift ; nothing catches description-vs-reality drift. Acknowledge this and don't try to over-engineer it.

### 3. **`cockpit check` is mandatory before push, no exceptions.**

The 200 ms cost of the validator is negligible. The cost of drift surfacing at session-start the next day is real (10–30 minutes of confusion). Make the validator a `pre-push` gate (manually, via a hook, or via your team's discipline). The day you skip it is the day you ship a state.json that lies about what was done.

---

## What this is NOT

- **Not a task tracker.** Use Linear, Jira, GitHub Issues. The cockpit is about *which session ships next*, not *which issues are open*.
- **Not a project management tool.** No timelines, no story points, no burndown charts.
- **Not a CI tool.** It runs locally. You can wire it into CI as a pre-push check, but it doesn't replace your test runner.
- **Not opinionated about your code.** It cares about session state. Your code can be Rust, Python, TypeScript, Go, anything.

---

## Project structure conventions

The cockpit assumes :

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

If you use different paths, you can adjust them in `cockpit/state.json`'s `migrations_dir` field (for migration paths) and edit the templates. The validator paths are currently hardcoded ; configurability is a v0.2 thing if there's demand.

---

## FAQ

**Q : Does this require Claude Code?**
No. The CLI works standalone. The skills bundle (`skills/cockpit`, `skills/next`) is opt-in for Claude Code users who want the slash commands.

**Q : Does this work for Cursor / Aider / Continue?**
Yes. The CLI is just a CLI. Any agent that can run shell commands and read files can use it. The slash-command skills are Claude Code-specific, but the underlying discipline transfers.

**Q : What about Python / Rust / Go projects?**
The CLI is Node-only (TypeScript via `tsx`). You can install via `npx` without committing Node as a project dependency. If you want a binary distribution, file an issue — it's a 1-day port.

**Q : Can I customize the templates?**
Yes. After `cockpit init`, the templates live in your project at `cockpit/templates/`. Edit them freely. The CLI's `cockpit new` commands copy from your project's templates if they exist.

**Q : What if my project doesn't have phases?**
The cockpit uses "phase" as a generic word for "unit of work that ships together." You can map it to "epic," "milestone," "sprint," or "release" — same machinery.

**Q : Is the cockpit data sent anywhere?**
No. Zero network calls. Zero telemetry. The cockpit reads your filesystem and your `git`. Nothing leaves your machine.

**Q : Where do I report bugs / feature requests?**
https://github.com/justethales/cockpit-skill/issues

---

## License

MIT. Use it, fork it, ship it.

If the cockpit saves you 30 minutes a week, that's enough payback. If you want to say thanks : star the GitHub repo, share the blog post, or [say hi on X](https://x.com/JusteThales).

---

*Cockpit is a small thing. Most of the value is in the discipline it forces, not in the 200 lines of TypeScript. Read the [blog post](https://thalesandhisaictoclaude.com) for the full story behind the pattern.*
