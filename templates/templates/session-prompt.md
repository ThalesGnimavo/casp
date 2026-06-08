---
status: queued
session_id: pending
session_log: pending
drafted_at: YYYY-MM-DD
next_after: <previous-session-id-or-prompt-slug>
parent_prompt: docs/plan/sessions/<parent>.md   # delete this line if this is not a sub-slice
---

# Session — <Phase id> : <Concise title>

> **Status : QUEUED.** Drafted at the close of session `<NNN>` (commit `<short-sha>`). One-paragraph "why now" — what just shipped, what stays queued, what unblocks first.
>
> **Goal.** One sentence — what a fresh agent ships if they execute this prompt cleanly.
>
> **Why now.** One sentence — what changes if this slice doesn't ship next.

**Project root.** `<absolute-path>`
**Branch.** `main` (single branch, push at end).
**Session log target.** `session-logs/YY-MM-DD-NNN-<slug>.md`.
**Expected size.** `<1 h | 2-3 h | half-day>`. `<No | X>` schema change. `<No | X>` migration. `<No | X>` UI mount.

---

## CONTEXT — what changed since the parent prompt was drafted

Three to six bullets, strict diff against the parent's assumptions, with commit refs.

- **<What shipped>** (session NNN, commit `<sha>`). One-sentence summary + the constraint it imposes on this session.
- **<Reusable surface>**. Where the analogue lives (file path) + what's safe to copy vs extend.
- **<Standing convention>** this session must honor.

---

## REFERENCE FILES (read these before writing)

Paths only, no excerpts.

1. **`<closest analogue>`** — what shape to mirror.
2. **`<schema block>`** — the table / module this session touches.
3. **`<helper>`** — the signature that must not drift.
4. **`<gate>`** — auth / hooks / middleware that wraps the new surface.

---

## SCOPE (must-have → should-have → defer)

### MUST HAVE — ship these or don't push

1. **`<file>`** — what it does, the verbs / fields / shape, the failure modes.
2. **`<file>`** — same.
3. **<Cross-cutting invariant>** — list explicitly so the audit checklist is ready.

### SHOULD HAVE — same session if time permits

4. **<extra surface / smoke target / helper extraction>** with a one-line rationale.

### DEFER if time runs short

- **<Sub-slice>** — lives in Section `<id>`. Reason.

---

## BUILD (in this order)

1. Read the reference files end-to-end first.
2. **`<file>`** — write in the order above. Smoke manually.
3. **`<file>`** — same.
4. **`pnpm check`** + **`pnpm build`** (or the equivalent) inline. Both green.

---

## VERIFY

Concrete smoke checks — each one a verb + expected envelope.

- **<Invariant 1>.** `<concrete test>` → `<expected envelope>`.
- **<Invariant 2>.** Same shape.
- **<No regression>.** List the surfaces this session must not break.
- **`npx casp check`** 0 FAIL before push.

---

## DO NOT

Anti-patterns + scope creep guards.

- **Do not <anti-pattern>.** Reason.
- **Do not <scope creep>.** Reason — lives in `<id>`.
- **Do not skip <safety>.** Reason.

---

## AT END OF SESSION

1. Tests / build / typecheck green.
2. Migration applied (or N/A).
3. `git add` only this session's files (no `-A`).
4. Commit message :
   ```
   feat(<phase>): <one-line — what shipped>
   ```
5. **Post-implementation audit** (REQUIRED for : multi-tenancy on a new entity / schema / auth / billing / voice ; SKIP for pure UI / doc-only / trivial). Use `casp/templates/audit-brief.md`. Apply findings inline.
6. Write **`session-logs/YY-MM-DD-NNN-<slug>.md`** : `npx casp new log --slug <slug>`, then fill.
7. **Draft next session's prompt** : `npx casp new prompt --slug <next-slug>`, then fill.
8. **`npx casp check`** — must exit 0 FAIL. Fix any drift inline.
9. `git push`.

---

## EXPECTED OUTPUT

- **New files :** `<path>` + the next-session prompt.
- **Updated :** `<path>` + `casp/state.json` + `casp/now.md` + `casp/roadmap.md`.
- **Commit count :** `<N>`.
- **Migration count :** `<N>`.
- **Session log :** one written.

---

*Self-contained. A fresh agent reads this prompt + the reference files + the closest analogue, ships every MUST first, the SHOULDs if time, defers the rest with explicit rationale, writes the log, drafts the next prompt, commits + pushes after `npx casp check` is green. No regression on prior phases.*
