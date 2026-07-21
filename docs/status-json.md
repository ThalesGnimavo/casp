# `casp status --json` — machine-readable snapshot schema

`casp status --json` emits the project's continuity snapshot as structured JSON:
current phase, next phase/prompt, last commit/session, shipped/queued counts, and
an **embedded validator verdict** computed in-process (the same `checkOne` the
`check` and `next` verbs run).

Unlike `casp check --json`, **`status --json` never gates**: on a valid cockpit it
**always exits `0`**, even when the embedded verdict is `drift`. Reporting is not
gating — gating is `check`'s and `next`'s job. (It still exits `1` if there is no
`casp/state.json` at all, if it is not valid JSON, or if it exists and cannot be
**read** — those are "cannot produce a snapshot" errors, not drift.)

Unreadable content *elsewhere* in the repository — a mode-`000` prompt, a
directory squatting a `*.md` path — is drift, not a snapshot error: it is
reported through the embedded verdict as a `CASP-IO-001` FAIL, and `status --json`
still exits `0`. If the snapshot cannot be assembled for any other reason, the
document still emits with `check.verdict: null` and an `error` field, and the
exit is still `0` — stdout is never empty.

Consumers: the structured session handoff between sessions, multi-project status
roll-ups, dashboards — anything that wants the state without scraping ANSI text.

## Stability contract

- `schema_version` identifies the shape of this document. It bumps **only on a
  breaking change** (a field removed, renamed, or retyped). New fields may be
  added without a bump — parse leniently.
- The embedded `check` block mirrors `check --json`'s verdict vocabulary
  (`clean` / `drift`) and its `pass` / `warn` / `fail` counts. For the full
  finding list, run `casp check --json` — `status --json` carries the verdict
  and the tallies, not every finding.
- Process exit code is `0` for any valid cockpit (drift included).

## Document shape (v1)

```json
{
  "schema_version": 1,
  "casp_version": "0.6.0",
  "project": { "name": "@justethales/casp", "version": "0.6.0" },
  "git": {
    "head": "3fb665e",
    "branch": "main",
    "dirty_files": 0,
    "ahead": 0
  },
  "state": {
    "current_phase": "0.6.0-install-hook",
    "next_phase": "next-presession-gate",
    "next_prompt": "docs/plan/sessions/PHASE-NEXT-PRESESSION-GATE.md",
    "next_prompt_status": "queued",
    "next_prompt_exists": true,
    "last_session_id": "26-06-17-001-install-hook",
    "last_commit": "af47374",
    "phases_shipped_count": 12,
    "phases_queued_count": 5
  },
  "check": {
    "verdict": "clean",
    "pass": 15,
    "warn": 0,
    "fail": 0
  },
  "queue": [
    "docs/plan/sessions/PHASE-NEXT-PRESESSION-GATE.md",
    "docs/plan/sessions/PHASE-STATUS-JSON.md"
  ]
}
```

## Fields

- **`project.version`** — `null` when the repo has no `package.json` (a non-Node
  project CASP still manages).
- **`git.head` / `git.branch`** — `null` outside a git repo or with `--no-git`.
- **`git.ahead`** — commits ahead of the upstream; `null` when there is no
  upstream or git is unavailable.
- **`state.next_prompt_status`** — the `status:` frontmatter of the next-prompt
  file (`queued` / `shipped` / …), or `null` when the file is missing.
- **`check`** — the in-process validator verdict. `--no-git` propagates to it,
  skipping the git-dependent checks.
- **`queue`** *(added 0.13.0, additive — the schema stays v1)* — the resolved
  `next_after` chain as repo-relative prompt paths, **head first**, so an agent
  can plan more than one session ahead. `null` when the chain is not adopted
  (no queued prompt declares a `next_after`) or not coherent — a dangling
  reference, a cycle, a fork or an orphan means the order has no single answer,
  and `status` reports no order rather than a guessed one. The chain's integrity
  is `casp check`'s business (`CASP-PROMPT-007` … `010`); `status` still exits
  `0` either way.

## Roadmap note — `status --all`

A fleet roll-up (`status --json` across a path list, one array) is the natural
next consumer of this schema. It is **not built yet**; the per-cockpit shape above
is the unit it would aggregate, exactly as `check --all` aggregates `check`.
