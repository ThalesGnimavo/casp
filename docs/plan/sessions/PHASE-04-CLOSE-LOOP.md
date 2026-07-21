---
status: shipped
session_id: 26-06-15-001-0-4-close-loop
session_log: session-logs/26-06-15-001-0-4-close-loop.md
drafted_at: 2026-06-15
next_after: 26-06-10-003-field-fixes-and-zerosuite-rollout
---

# Session — 0.4-close-loop : `ship` / `close` / optional-migrations / `check --all`

> **Status : QUEUED.** Resequenced ahead of the validated `install-hook` queue by
> CEO decision (2026-06-15), off the `upgradecaspideas.md` discussion. These are
> the highest daily-pain wins and they carry zero boundary risk — all deterministic
> state mutation, no LLM, no orchestration, no new state schema.
>
> **Goal.** Two new verbs (`casp ship`, `casp close`) that automate the manual
> close loop, migration checks that go silent on non-code projects, and
> `casp check --all` to gate every cockpit under a root in one report.
>
> **Why now.** The close loop is hand-edited ~6 times on a busy day and that hand
> mutation is exactly what a deterministic verb should own. Optional-migrations
> unlocks "CASP for any project" at the validator level. `--all` serves the fleet pitch.

**Project root.** `/Users/juste/ZeroSuite/casp-sh/casp-core`
**Branch.** `main` (single branch, push at end).
**Session log target.** `session-logs/26-06-15-NNN-0.4-close-loop.md`.
**Expected size.** Half-day. Schema change: none required (migrations keys already optional). No migration. No UI.

---

## CONTEXT — what changed since the queue was drafted

- **0.3.2 is live on npm.** Version is read at runtime via `pkgVersion()` (`src/shared.ts`) — never hardcode it in a new verb's output.
- **Migration checks are already absent-means-skip at the *applied* level.** `check.ts` #6 only FAILs when `migrations_applied` is non-empty and the dir is missing. The residual non-code noise is two things only: the hardcoded `state.migrations_dir || 'drizzle'` fallback, and `init` scaffolding `migrations_dir: "drizzle"` into fresh state. Optional-migrations is a *narrowing*, not a rewrite — do not re-architect check #6.
- **The two-commit close loop is already encoded in `check.ts`.** #4 PASSes when `last_commit` is the parent of HEAD and HEAD touches only the state surface (`casp/`, `docs/plan/sessions/`, `session-logs/`); #8 WARNs on an uncommitted state surface. `casp close` must produce state that lands on those PASS paths — it sets `last_commit` to the implementation commit (current HEAD), it does **not** invent a future SHA.
- **One-file-per-verb convention.** `src/{init,status,check,next,new}.ts`, each exporting `run<Verb>(args: string[])`, dispatched from `src/cli.ts`. Mirror it: `src/ship.ts`, `src/close.ts`.
- **`configurable-paths` (PHASE-CONFIGURABLE-PATHS) is queued AFTER this** and introduces `sessions_dir` / `logs_dir` resolution. Do **not** pre-build that here. If you touch path handling for `--all`, keep the per-root path computation local so configurable-paths can later swap in the shared resolver without fighting this code.

---

## REFERENCE FILES (read these before writing)

1. **`src/check.ts`** — the verb to refactor for `--all` (see SCOPE 4); also the close-loop and migration logic these verbs must stay consistent with.
2. **`src/new.ts`** — frontmatter + template I/O shape to mirror for `ship` (which edits prompt frontmatter).
3. **`src/shared.ts`** — `loadState`, `readFrontmatter`, `git`, `todayISO`, the `State` interface. Reuse, do not duplicate.
4. **`src/cli.ts`** — dispatch switch + `HELP` block. New verbs register here.
5. **`casp/state.json`** — the live state these verbs mutate; the canonical shape.

---

## SCOPE (must-have → should-have → defer)

### MUST HAVE — ship these or don't push

1. **`src/ship.ts` — `casp ship <slug>`.** Operates on `docs/plan/sessions/<slug>.md` (resolve the slug to the prompt file; accept either bare slug or `PHASE-...`):
   - Flip its frontmatter `status: queued|in-progress → shipped`.
   - Set `session_log:` to `session-logs/<last_session_id>.md` (take the id from `--log <id>` or fall back to `state.last_session_id`).
   - Move the slug from `state.phases_queued[]` to `state.phases_shipped[]` (no-op if already shipped; never duplicate — #5 FAILs on dupes).
   - Refuse with a clear message if the prompt is already `shipped`, the file is missing, or the slug isn't in `phases_queued`. Idempotent on re-run of an already-shipped slug.
   - **Does not** touch git.

2. **`src/close.ts` — `casp close`.** Guided deterministic session close:
   - Auto-detect: `last_commit` ← `git rev-parse --short HEAD`; `last_session_id` ← newest file in `session-logs/` by name (the `YY-MM-DD-NNN-...` sort), stripped of `.md`. Echo both and prompt to confirm/override (TTY); honor `--commit <sha>` / `--log <id>` / `--yes` for non-interactive use.
   - Bump `updated_at` ← `todayISO()`, plus the confirmed `last_commit` / `last_session_id`.
   - Then run the check logic and print its report.
   - **Hard constraint: `close` never runs `git commit`, `git add`, or `git push`.** It mutates `casp/state.json` and runs `check`; the operator owns the commit. The moment it commits, it is a harness, not a state verb — that breaks the constitution. Say so in a comment at the top of the file.

3. **Optional-migrations — narrow the migration surface to truly opt-in.**
   - `src/init.ts`: stop scaffolding `migrations_dir: "drizzle"` into fresh `state.json` and stop writing a default `migrations_applied`. Absent keys = no migration concept.
   - `src/check.ts` #6: drop the `|| 'drizzle'` fallback. If `migrations_applied` is non-empty but `migrations_dir` is absent → FAIL with a fix hint ("set migrations_dir, or empty migrations_applied"). If both absent → skip silently (no PASS, no WARN, no FAIL — migrations simply do not exist for this project).
   - `templates/state.json`: document `migrations_dir` / `migrations_applied` as optional in `notes`; do not include them by default.

4. **`src/check.ts` refactor + `casp check --all`.**
   - Extract a pure `checkOne(root: string, opts): Finding[]` that does every check against a given root and **returns** findings — no `exit()`, no `console.log` inside it. The current internal `exit()` early-returns (missing/invalid state) become terminal `Finding`s.
   - `runCheck` becomes the shell: parse flags, call `checkOne(process.cwd())`, print (human or `--json`), `exit(fail>0?1:0)`. Single-root output and exit code must be **byte-identical** to today — this is the regression risk.
   - `casp check --all [root]`: find every `casp/state.json` under `root` (default cwd), run `checkOne` on each containing dir, print a per-cockpit section + an aggregate header (`N cockpits · X PASS · Y WARN · Z FAIL`), exit 1 if **any** cockpit has a FAIL. Skip `node_modules`/`.git` when walking.

5. **Cross-cutting:** register `ship`, `close`, and `--all` in `src/cli.ts` dispatch + `HELP`; update README command list + help; CHANGELOG entry under 0.4.

### SHOULD HAVE — same session if time permits

6. **`--all --json`** — array of per-cockpit JSON reports under the existing stable schema (bump `schema_version` only if the per-cockpit shape changes, which it should not).
7. Tests for `ship` (queued→shipped, dupe guard, missing file, already-shipped no-op) and `close` (auto-detect, `--yes`, never-commits assertion).

### DEFER

- **`project_kind` enum + template phrasing variants** — explicitly cut from 0.4 (over-engineered; optional-migrations alone covers the non-code case). Do not add it.
- **Named multi-track state** — refused; multi-track is solved by one cockpit per track + `check --all`. Do not add `tracks` to state.
- **`init --interactive`, `status --json` / `next --json`, GitHub Action** — separate later cuts (`status-json` is its own queued phase).
- **Homepage / presentation "five verbs" copy** — adding `ship`/`close` makes that count wrong; reconcile in a separate docs pass, not here.

---

## BUILD (in this order)

1. Read `check.ts`, `new.ts`, `shared.ts`, `cli.ts` end-to-end.
2. **Refactor `check.ts` → `checkOne` + shell** first; confirm single-root output/exit is unchanged (diff against a known repo). This de-risks everything downstream.
3. **Optional-migrations** narrowing in `check.ts` + `init.ts` + `templates/state.json`.
4. **`src/ship.ts`**, then **`src/close.ts`**; wire both into `cli.ts` + `HELP`.
5. **`casp check --all`** on top of `checkOne`.
6. README + CHANGELOG.
7. `pnpm check` + `pnpm build` inline. Both green.

---

## VERIFY

- **`ship`.** On a queued slug → frontmatter `status: shipped`, `session_log` wired, slug moved to `phases_shipped`. Re-run → idempotent, no dupe. Missing slug / already-shipped → clean refusal, non-zero exit.
- **`close`.** In a TTY → echoes detected HEAD + newest log, confirms, bumps state, runs check. With `--yes --commit X --log Y` → no prompt. Grep the diff: no `git commit`/`add`/`push` ever issued by `close`.
- **Optional-migrations.** Repo with no migration keys → check #6 emits nothing (no PASS line). `migrations_applied` set, `migrations_dir` absent → FAIL with hint. Existing drizzle-style repo with both keys → unchanged behavior.
- **`check --all`.** Two nested cockpits, one clean one drifted → aggregate exits 1, both sections printed. Single-root `casp check` output and exit code byte-identical to 0.3.2.
- **No regression** on `init`, `status`, `next`, `new`, `check` (single-root), `check --json`, `check --quiet`, `check --no-git`.
- **`npx @justethales/casp check`** (run from source: `node dist/cli.js check`) → 0 FAIL before push.

---

## DO NOT

- **Do not let `close` (or `ship`) commit, stage, or push.** State verbs mutate files; the operator owns git. This is the line between gate and harness.
- **Do not put any LLM / probabilistic step in any of these verbs.** They are pure file + git-read mutation.
- **Do not add `project_kind`, `tracks`, or any new required state key.** Optional-migrations is subtraction; `--all` is iteration. Zero schema growth.
- **Do not change the single-root `check` output, finding ids, or `--json` schema_version** during the refactor. Behavior-preserving extraction only.
- **Do not pre-build `sessions_dir`/`logs_dir` resolution** — that's PHASE-CONFIGURABLE-PATHS, queued after this.

---

## AT END OF SESSION

1. `pnpm check` + `pnpm build` green.
2. Migration applied: N/A.
3. `git add` only this session's files (no `-A`).
4. Commit message:
   ```
   feat(0.4-close-loop): ship/close verbs, optional migrations, check --all
   ```
5. **Post-implementation audit** — REQUIRED (multi-file refactor of the core gate + two new verbs). Use `casp/templates/audit-brief.md`; focus on the `checkOne` extraction (output/exit parity), the `close` never-commits invariant, and the migration-narrowing edge cases. Apply findings inline.
6. Write **`session-logs/26-06-15-NNN-0.4-close-loop.md`**: `node dist/cli.js new log --slug 0.4-close-loop`, then fill.
7. **`casp ship 0.4-close-loop`** to flip this prompt, then **draft the next prompt** — re-point `state.next_prompt` at `docs/plan/sessions/PHASE-INSTALL-HOOK.md` (the queue resumes there) and confirm its `status: queued`.
8. Bump `casp/state.json` (`phases_shipped`, `phases_queued`, `current_phase`, `next_phase`, `last_commit`, `last_session_id`, `updated_at`) + `casp/now.md` + `casp/roadmap.md`, then a second state-bump commit. **`node dist/cli.js check`** → 0 FAIL.
9. `gh auth switch -u justethales` → `git push` → `gh auth switch -u Juste-Gnimavo`.
10. **Do not `npm publish`** — that is a separate CEO-gated act.

---

## EXPECTED OUTPUT

- **New files:** `src/ship.ts`, `src/close.ts`, the session log, the resumed next-prompt pointer.
- **Updated:** `src/check.ts`, `src/init.ts`, `src/cli.ts`, `templates/state.json`, `README`, `CHANGELOG`, `casp/state.json` + `casp/now.md` + `casp/roadmap.md`.
- **Commit count:** 2 (implementation, then state-bump).
- **Migration count:** 0.
- **Session log:** one written.

---

*Self-contained. A fresh agent reads this prompt + the four reference files, refactors `check` behavior-preservingly first, ships every MUST, defers the rest with explicit rationale, writes the log, ships this prompt, re-points `next_prompt` at the resumed queue, commits + pushes after `casp check` is green. No regression on prior phases. No git operations inside any verb. No LLM anywhere near the gate.*
