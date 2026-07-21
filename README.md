# CASP — the Coding-Agent State Protocol

> **The model holds the context. CASP proves the state is true — against git.** The new models run your whole roadmap for hours, even days, without losing the thread — which is exactly why state drift matters *more*, not less: the more an agent does between your checkpoints, the more its recorded state can quietly stop matching git. Point any coding agent at a CASP repo and it executes phase after phase across sessions, branches and a team — writing its **own next-session prompt**, logging every session — and `casp check` **blocks the push the moment the state drifts from git**. Everyone *stores* context; CASP **proves** it. It is the **deterministic floor of the self-verification loop** — the one check in "verify your work" that isn't the model checking itself. The complement to long-running, autonomous models — with **Claude Code** today, and every model that ships next. MIT, zero telemetry, no SaaS.

[![npm version](https://img.shields.io/npm/v/@justethales/casp.svg)](https://www.npmjs.com/package/@justethales/casp)
[![npm downloads](https://img.shields.io/npm/dm/@justethales/casp.svg)](https://www.npmjs.com/package/@justethales/casp)
[![license](https://img.shields.io/npm/l/@justethales/casp.svg)](https://github.com/ThalesGnimavo/casp/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/ThalesGnimavo/casp?style=social)](https://github.com/ThalesGnimavo/casp)

```bash
npm i -g @justethales/casp        # or: npx @justethales/casp <command>
casp init            # scaffold the casp/ layer in any repo
casp status          # one-screen "where am I"
casp check           # validate the state against git — exits 1 on drift
```

**C**oding-Agent · **S**tate · **P**rotocol. Works with **Claude Code**, **Cursor**, **Aider**, **Continue**, or any agent that can run a CLI. Node ≥ 20. No account, no telemetry, nothing leaves your machine.

Built by [Thales (Juste Gnimavo)](https://thalesandhisaictoclaude.com) — a solo CEO running seven production products with Claude as the only engineer. CASP is the layer that keeps months of AI-driven sessions from collapsing into drift.

> Pre-flight check + black box for AI coding sessions.

---

## 01 · The thread you keep losing

You come back to a project after a week — or you juggle five at once. The agent reads a state file that no longer matches reality, **confidently starts work that already shipped**, and you burn an afternoon undoing it.

Boards, cards and spreadsheets don't save you: reconstructing context is manual, and the agent can't read any of it. The state needs to be machine-readable, git-native — and **provably true**.

```jsonc
// casp/state.json  ● DRIFTED
{
  "phase":       "13 — camera streaming",
  "next_prompt": "phases/14-camera.md",   // already shipped in v13.4
  "last_commit": "a1f3c9",                // not in git history
  "migrations":  ["0001"…"0007"]          // git stops at 0006
}
```

A stale state file makes your agent confidently wrong. **CASP gives every project one thread that survives across sessions — and can't drift silently.**

---

## 02 · The wedge — everyone *stores* context, CASP *validates* it

The adjacent space — Mem0, Letta, Zep, the new git-native "memory" projects — all **store** what happened. Almost none **verify** that the stored state still matches git reality.

That verification is **`casp check`** — and it's mandatory before every push. It catches:

- **next-prompt drift** — your `next_prompt` points at a file that's already shipped, or doesn't exist. CASP refuses to start the wrong session.
- **git ground-truth** — `last_commit` not in history, migrations list out of sync, uncommitted state — checked against git itself, not a guess.
- **push, blocked** — no fuzzy similarity scores. A hard, repeatable pass/fail gate that stops the push while the state is lying. `casp check` **exits non-zero on drift**, so it works as a real CI status check, not a decorative log.

---

## 03 · Beside your existing stack

CASP replaces nothing in your workflow. It fills the one gap nothing else covers — the **validated present tense** of a project, in a form your agent can read and act on.

| Layer | Tool | What it holds | The gap |
|---|---|---|---|
| **Intent** | Jira · Linear | What you *plan* to do | Drifts from reality, lives in the cloud, your agent can't reliably read it. |
| **Validated present** | **CASP** | Where the project **stands** now — and the **exact next move**, proven against git | *(this is the gap nothing else fills)* |
| **History & verification** | git · PR · CI | What changed · is it reviewed · does it build | A perfect record of the past — silent about what comes next. |

Git, PRs and CI don't know what ships next. CASP does.

---

## 04 · Three files. One thread.

No database. No service. No vector store. Three plain files an agent can read on the first line of any session, scaffolded by `casp init` into `casp/`:

| File | Role | What it holds |
|---|---|---|
| `state.json` | source of truth | Machine-readable, per project: current phase, next phase, the exact next-prompt to execute, phases shipped, migrations applied, last commit, last session id. |
| `now.md` | for humans | The one-screen "where am I right now." Open it, get the thread back in five seconds — no archaeology. |
| `roadmap.md` | what ships next | The Next-3 to ship plus a phase scoreboard. The agent always knows the order of work. |

**Templates are gates, not guidance.** Canonical `session-prompt`, `session-log` and `audit-brief` templates mean every session — human or agent — produces the same-shaped artifacts. Structure is enforced, not suggested. Draft them with `casp new prompt|log` — don't copy-paste a prior one.

---

## 05 · Built for big roadmaps

A real product isn't one feature. It's dozens of phases across API, web client and mobile, shipped over weeks by rotating sessions and agents. CASP keeps a single validated order across all of it — so any agent knows which phase is next, and **never re-ships a shipped one**.

```
roadmap.md — phase scoreboard            13 shipped ▰▰▰▰▱▱ 22 total

  10  api     Realtime sync engine        shipped
  11  mobile  Push notifications          shipped
  12  mobile  Offline-first cache         shipped
  13  web     Team permissions            shipped
  14  web     Analytics dashboard ◂ NEXT  active
  15  api     Per-seat billing            queued
  16  mobile  Biometric login             queued
```

One ordered thread across forty phases — web *and* mobile.

---

## 06 · State, not memory

CASP is **not** an AI memory layer. Memory tools remember **who you are**. CASP tracks **where your project stands** — and proves it. Different artifact, different operation, different failure it prevents.

| | **CASP** | Memory layers · Mem0 / Letta / git-native "soul" |
|---|---|---|
| What it holds | **Project execution state** | User facts & preferences |
| Core operation | **Validates against git** | Stores & recalls |
| On conflict | **Deterministic check vs ground-truth** | Fuzzy similarity guess |
| When it runs | **Synchronous gate — blocks the push** | Async / eventual recall |
| Leaves your machine | **Never · zero telemetry** | Varies / cloud |

---

## 07 · The command deck

Trivially typed — one syllable, no homographs, the same in English, French or Spanish.

| Command | What it does |
|---|---|
| `casp init` | Scaffold the continuity layer (`casp/`) into any repo. Idempotent — re-running never overwrites existing files. |
| `casp upgrade` | Refresh an existing cockpit's **scaffolds** (`casp/README.md`, `casp/templates/**`) to the installed CLI and stamp its `casp_version`. **Never writes `now.md` or `roadmap.md`, and never templates over `state.json`** — the only state write is the additive version stamp; every other value stays byte-identical. `casp/README.md` **is** a scaffold and is replaced (the output line says so) — keep local notes in `now.md`. Never deletes, never writes through a symlink, idempotent, never gates. `--dry-run` prints the plan and writes nothing. The non-destructive counterpart to `init --force`, which overwrites everything. |
| `casp status` | One-screen snapshot: phase, next, what's shipped, last 10 commits. `--plain` strips ANSI. |
| `casp check` | The drift validator. Validates `state.json` against the filesystem and git. **Exits 1 on drift.** `--quiet` only prints on FAIL (CI-friendly); `--no-git` skips git-dependent checks; `--json` emits a machine-readable report with a stable schema ([docs/check-json.md](https://github.com/ThalesGnimavo/casp/blob/main/docs/check-json.md)) — same checks, same exit code; `--all [root]` validates every cockpit under a root in one report. |
| `casp next` | Print the next session's prompt straight from `state.next_prompt` — pipe-friendly, exits non-zero when there's no actionable prompt. **Gates on drift:** runs the validator first and refuses to print on a drifted state (`--no-check` to start anyway, `--no-git` to skip git checks). The start boundary, symmetric with `install-hook`'s push boundary. |
| `casp ship <slug>` | Mark a phase shipped: flip its prompt to `status: shipped`, wire the `session_log` pointer, move the slug from `phases_queued` to `phases_shipped`. Pure state mutation — never touches git. |
| `casp close` | Bump `last_commit` / `last_session_id` from HEAD and the newest session log (confirm or override), then run `check`. Never commits — the operator owns the commit. |
| `casp new prompt --slug X` | Generate a gated session-prompt from the canonical template into `docs/plan/sessions/` (or your configured `sessions_dir`). |
| `casp new log --slug X` | Open a session-log in the shape every session shares, into `session-logs/` (or your configured `logs_dir`). |
| `casp install-hook` | Write `.git/hooks/pre-push` so `casp check --quiet` runs on every push — the gate stops depending on discipline. Refuses to clobber a foreign hook (`--force` to override); `--remove` uninstalls a hook CASP wrote. Explicit opt-in — `casp init` never installs it, and it never touches `core.hooksPath`. |
| `casp verify <commit>` | Run the validator against a historical commit in a throwaway worktree — proves whether that commit's recorded state was in sync. Exits with that verdict; never mutates the worktree, index or history. |
| `casp state diff [A] [B]` | Field-level diff of `casp/state.json` between two commits (default `HEAD~1` → `HEAD`), with element-level deltas for array fields. `--json` for data. |
| `casp audit status` / `bump` | The deep-audit watermark: separates the cheap per-merge gate (`check`, every session) from the expensive batch pass (adversarial sub-agent audit + full e2e + security review, on demand). `status` shows the unaudited range `last_deep_audit..HEAD` (`--json` for data); `bump [<sha>]` records HEAD as deep-audited. A **production-cutover gate, never a merge gate** — `check` doesn't block on it. Driven by the `/audit-batch` skill. |
| `casp rules` | List the verification rules `check` enforces — the stable `CASP-<AREA>-<NNN>` codes that appear on every finding. `--json` for data. |
| `casp explain <CODE>` | Print one rule's full definition: what it verifies, the evidence it inspects, and how to remediate. Accepts a code (`CASP-GIT-001`) or an internal finding id. |
| `casp doctor` | Read-only environment diagnostic for onboarding: Node, git, `casp/state.json`, the cockpit's CASP version, the resolved sessions/logs dirs, the pre-push hook and `core.hooksPath`. `PASS`/`WARN`/`FAIL` per line (`--json` for data). **Never gates** — always exits 0; it maps what to fix, `check` is the gate. |
| `casp version` | Print the version (same as `-V`). `--json` emits `{ name, version, node, schema_version }` — the machine handoff, where `schema_version` is the `check --json` report schema. |
| `casp help [command]` | The top-level overview, or one command's focused help (usage, every flag, real examples). `casp <command> --help` is equivalent. `casp help` exits 0 — the most natural thing a user types is first-class. |

---

## 08 · In your editor

CASP ships Claude Code slash-commands so the state lives where you already work. Drop them in once:

```bash
cp -r node_modules/@justethales/casp/skills/casp ~/.claude/skills/
cp -r node_modules/@justethales/casp/skills/next ~/.claude/skills/
```

| Command | What it does |
|---|---|
| `/casp` | Read-only status — the agent reads the current thread before it writes a single line. |
| `/next` | Auto-start the next session straight from `state.next_prompt`. No copy-paste, no guessing. |

Works with **Claude Code** · **Cursor** · **Aider** · **Continue** — anything that reads files. The CLI is the contract; the slash-commands are an optional convenience.

---

## 09 · For engineering orgs

One agent doing the wrong thing costs an afternoon. A hundred agents doing it across a hundred repos costs a quarter. CASP is the deterministic guardrail you drop into the automation loop — the same shape in every project.

- **A required CI status check.** `casp check` sits in the same slot as lint and tests. A state that lies can't merge — drift is blocked at the org level, not left to anyone's discipline.
- **A guardrail for agent fleets.** Autonomous agents multiply mistakes. CASP hands every one of them the same validated thread to read and the same hard gate before it pushes. Automation without the duplicate-work tax.
- **An audit trail, for free.** Every state transition is a git commit. A complete, diffable, revertable record of how each project moved — `git log` *is* your compliance trail.
- **Passes infosec by design.** Local-only, zero telemetry, no cloud, no account. Nothing to vet, nothing to exfiltrate. The security review is one line: it never leaves the machine.

```yaml
# .github/workflows/ci.yml
jobs:
  state-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }   # casp checks against full git history
      - run: npx @justethales/casp check        # ✗ fails the build the moment state drifts
```

One protocol, every repo. **The same validated shape, org-wide.**

---

## 10 · The contract

A protocol earns adoption by being predictable. These don't bend.

1. **Validate state, not intent.** CASP checks what your repo *is*, never what you meant to do. Facts against git, every time.
2. **Templates are gates.** Canonical artifacts are enforced, not suggested. Every session comes out the same shape.
3. **`check` before every push.** The validator is not optional. A lying state never reaches your remote.
4. **Nothing leaves your machine.** Deterministic, git-native, local-only. Zero telemetry. No cloud, no account, no bill.

---

## Quickstart

```bash
npm i -g @justethales/casp
cd my-project
casp init                 # scaffold the layer
casp status               # where am I right now
casp check                # prove the state is true (exits 1 on drift)
```

`casp init` creates:

```
casp/
├── state.json          # machine-readable session state (the validator reads this)
├── now.md              # current focus (human-readable, one paragraph)
├── roadmap.md          # Next-3 to ship + phase scoreboard
├── README.md           # the protocol, in your repo
└── templates/
    ├── session-prompt.md
    ├── session-log.md
    └── audit-brief.md
```

Edit `casp/now.md`, `casp/roadmap.md` and `casp/state.json` to describe your project, draft your first session prompt with `casp new prompt --slug phase-1-first-slice`, and run `casp check` before every push. That is the whole loop.

When a newer CASP ships a better scaffold, run `casp upgrade` (`--dry-run` first if you want to see the plan). It refreshes `casp/README.md` and `casp/templates/**` only, and stamps `state.casp_version`; `now.md`, `roadmap.md` and every existing `state.json` value are left byte-identical. `casp doctor` tells you when the cockpit is behind.

---

## What the validator catches

```
$ npx @justethales/casp check

casp:check · 22 PASS · 2 WARN · 1 FAIL
──────────────────────────────────────────────────────────────────────
  FAIL  CASP-PROMPT-003 next_prompt is already SHIPPED · docs/plan/sessions/PHASE-1-AUTH.md has status: shipped
        → either update state.json.next_prompt to the real next slice, or re-execute it explicitly
  WARN  CASP-GIT-001 last_commit is in history but not at HEAD · state=abc1234 HEAD=def5678
        → bump state.last_commit to def5678
  ...

✗ 1 drift detected. Push blocked — fix before push.
```

Every finding carries a **stable rule code** (`CASP-<AREA>-<NNN>`) and a one-line `→ fix` hint, so the agent can resolve without re-reading docs — or run `casp explain <CODE>` for the full definition. The rules the validator enforces cover, among others:

- `CASP-PROMPT-001/003` — `next_prompt` points at a missing file, or one already `status: shipped`. *(The exact bug CASP was built to catch.)*
- `CASP-GIT-001` — `last_commit` not in `git log`, or inconsistent with HEAD.
- `CASP-SESSION-001` — `last_session_id` does not map to a session-log file.
- `CASP-SESSION-003` — a `phases_shipped[]` entry no session log declares. *(Opt-in by declaration: silent until a log declares a `phase:` that appears in `phases_shipped`, and pre-adoption history stays exempt.)*
- `CASP-STATE-003` — `phases_shipped[]` has duplicates.
- `CASP-MIGRATION-002` — `migrations_applied[]` does not match the migrations directory.
- `CASP-PROMPT-005` — a session prompt is `status: shipped` but its `session_log` is missing.
- `CASP-WORKTREE-001` — uncommitted changes in `casp/`, the sessions dir, or the logs dir.

See the full catalogue with `casp rules` or in [docs/rules.md](https://github.com/ThalesGnimavo/casp/blob/main/docs/rules.md). A claim the validator **cannot verify** — a missing backing directory for claimed migrations, shipped phases, or a session id — is a `FAIL`, never a silent green.

The exit-code contract — clean → exit 0, drift → exit 1 — is covered by `npm test`, so the CI gate stays real.

**What CASP proves — and what it doesn't.** A clean `casp check` proves the *recorded execution state* is consistent with *git evidence*. It deliberately says nothing about whether your code is correct, deployed, or bug-free — that's tests, review and CI. The precise scope is in [docs/what-casp-proves.md](https://github.com/ThalesGnimavo/casp/blob/main/docs/what-casp-proves.md); the security posture (repository content is untrusted input, git is invoked without a shell for any interpolated value) is in [docs/threat-model.md](https://github.com/ThalesGnimavo/casp/blob/main/docs/threat-model.md).

**Layout is yours.** Prompts default to `docs/plan/sessions` and logs to `session-logs`, but a project that already has its own structure sets `"sessions_dir"` and/or `"logs_dir"` in `state.json` — both optional — and the whole protocol (`check`, `new`, `ship`, `close`) validates against that real layout instead of forcing CASP's. CASP fits your repo; you don't refactor for CASP.

Need the report as data instead of text? `casp check --json` emits the same findings as structured PASS/WARN/FAIL with a stable, documented schema — for CI annotations, webhooks, and roll-ups. See [docs/check-json.md](https://github.com/ThalesGnimavo/casp/blob/main/docs/check-json.md).

---

## What this is NOT

- **Not a task tracker.** Use Linear, Jira, GitHub Issues. CASP is about *which session ships next*, not *which issues are open*.
- **Not an AI memory / RAG layer.** It validates project state against git; it doesn't store user facts or do similarity recall.
- **Not a CI tool.** It runs locally. You can wire `casp check` into CI as a pre-push gate, but it doesn't replace your test runner.
- **Not opinionated about your code.** Rust, Python, TypeScript, Go — CASP cares about session state, not your stack.
- **Not a replacement for `CLAUDE.md`.** That's your project's constitution (rules, conventions). CASP is the operating state on top of it.

---

## Roadmap

- **0.4** — `casp ship` + `casp close` (the close loop, automated), optional migrations (non-code projects carry no migration noise), and `casp check --all` for fleets. *Shipped.*
- **0.5** — Configurable paths (`sessions_dir` / `logs_dir` state keys) so a project validates against its real layout instead of adopting CASP's. *Shipped.* *(Resequenced ahead of `install-hook` — real users onboarding their existing repos came first.)*
- **0.6** — Both session boundaries become gates, plus inspection. `casp install-hook` writes `casp check --quiet` into your pre-push hook (the *push* boundary); `casp next` now refuses to start a session on a drifted state (the *start* boundary, `--no-check` escape hatch); `casp status --json` gives the structured session handoff; `casp verify <commit>` + `casp state diff` make "git log is your compliance trail" inspectable. *Shipped.*
- **0.7** — First-class `casp help` (exit 0) with a focused per-command block for every verb. *Shipped.*
- **0.8** — Stable **rule codes** (`CASP-<AREA>-<NNN>`) on every finding, with `casp rules` / `casp explain <CODE>`; published **JSON Schemas** for `state.json` and the `check --json` report; an injection-safe git path for untrusted state values; and precise "what CASP proves / does not prove" + threat-model docs. *Shipped.*
- **0.9** — DX + machine-handoff: `casp doctor` (a read-only environment diagnostic that never gates), `casp version --json` (the `{ name, version, node, schema_version }` handoff), and additive `expected` / `actual` fields on `check --json` findings (schema stays v1). *Shipped.*
- **0.10** — `casp audit status` / `casp audit bump`: the deep-audit watermark that separates the cheap per-merge gate from the expensive batch pass (adversarial review + full e2e + security). A production-cutover gate, never a merge gate. *Shipped.*
- **0.11** — `CASP-SESSION-003`: every `phases_shipped[]` entry must be declared by a session log (`phase:` frontmatter). The mapping is declared, never inferred from filenames; adoption is derived from the data, so a repo with pre-CASP history is never retroactively reddened and a repo that never opts in sees nothing. *Shipped.*
- **0.12** — `casp upgrade`: refresh an existing cockpit's scaffolds to a newer CASP without touching a byte of its data, plus a namespaced `casp_version` stamp in `state.json` and a `doctor` staleness WARN. The protocol's own continuity across releases. *Shipped.*
- **Demand-gated** — native binaries, a narrow `casp rollback` (state mutation only, never code), a CI status-check installer, a generic webhook notifier (user-owned outbound, off by default).

Cut from earlier drafts, deliberately: `casp lint` (an LLM verb inside the CASP binary — even advisory — would undercut the deterministic claim; prose-vs-reality checking belongs in your agent, which can read `casp/` today for free).

Vote on the roadmap with [GitHub issues / reactions](https://github.com/ThalesGnimavo/casp/issues).

---

## FAQ

**Does this require Claude Code?** No. The CLI works standalone with any agent that runs shell commands. The `/casp` and `/next` slash-commands are an optional bundle for Claude Code users.

**Is CASP an AI memory product?** No — that's the wedge. Memory tools (Mem0, Letta, Zep) *store and recall*. CASP *validates project execution state against git* and blocks the push on drift. Different artifact, different operation.

**Does it work for Cursor, Aider, Continue?** Yes. The CLI is just a CLI; any agent that runs shell commands and reads files can use it.

**What about Python, Rust, Go projects?** The CLI is Node-only (TypeScript via `tsx`). Use it via `npx` without committing Node as a project dependency. A binary distribution is on the roadmap.

**Is any data sent anywhere?** No. Zero network calls. Zero telemetry. CASP reads your filesystem and your `git`. Nothing leaves your machine.

**Why "CASP"?** **C**oding-**A**gent **S**tate **P**rotocol — the name says exactly what the artifact is. An earlier name for this tool collided with a well-known Red Hat project of the same name; CASP relaunches it as a *protocol*, the way MCP did for model context.

**Where do I report bugs or request features?** [github.com/ThalesGnimavo/casp/issues](https://github.com/ThalesGnimavo/casp/issues)

---

## License

MIT. Use it, fork it, ship it.

If CASP saves you 30 minutes a week, that's enough payback. If you want to say thanks: star the [GitHub repo](https://github.com/ThalesGnimavo/casp), or [say hi on X](https://x.com/ThalesGnimavo).

---

*CASP — the Coding-Agent State Protocol. The model holds the context; CASP proves the state is true — against git.*
