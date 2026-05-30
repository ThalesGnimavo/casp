# YY-MM-DD-NNN — <Phase id> : <Concise title>

**Session prompt :** `docs/plan/sessions/<id>-<slug>.md`.
**Previous session end :** `<short-sha>` (one-line description of the last commit before this session).
**Delegation :** <Executed inline | Sub-agent <type> for X step>. Reason in one sentence.
**State at session start :** What the cockpit looked like, what was unblocked, why this slice was picked.

## Scope shipped this session

Organized by the prompt's MUST / SHOULD list. Each surface gets its own subsection.

### A — `<file>` (NEW | MODIFIED)

#### `<verb>` — <what it does>

- Input shape.
- Filter / scope clauses.
- Response shape.
- Audit / log keys (metadata-only — list what's IN and what's NEVER).

### B — `<file>` (NEW | MODIFIED)

Same shape.

## What did NOT ship this session — and why

Per the prompt's DEFER list :

- **<Sub-slice>** — lives in Section `<id>` next. Reason.

## Files touched

| File | Change |
|------|--------|
| `<path>` | NEW / MODIFIED — one-line description. |
| `session-logs/YY-MM-DD-NNN-<slug>.md` | This log. |
| `docs/plan/sessions/<this-prompt>.md` | Frontmatter `status:` queued → shipped. |
| `cockpit/state.json` | `last_commit` + `last_session_id` + `current_phase` + `next_phase` + `next_prompt` + `phases_shipped` bumped. |
| `cockpit/now.md` | Focus + Next-action rewritten. |
| `cockpit/roadmap.md` | Next-3 row updated, "Shipped this week" appended. |

No deletions. No renames.

## Verify

### Inline

- Tests / build / typecheck green.
- `npx cockpit check` — 0 FAIL, `<N>` warnings.

### Post-implementation audit (Explore sub-agent)

Verdict : **GO | GO-WITH-FIXES | NO-GO**.

Per-checklist results :

- **<Section>** — PASS / FAIL — one-line justification.
- …

### Observed divergence (documented, no code change)

If the prompt's spec didn't match reality, document here with the "why no code change" reason.

## Deferred / risks

- **<Risk 1>.** What's deferred, when it lands, what breaks if it never lands.

## Scope decisions made this session

- **<Decision>.** What was picked, what the alternative would have cost.

## Cockpit + housekeeping

- `cockpit/state.json` bumped — see "Files touched".
- `cockpit/now.md` rewritten — Focus = "<one-paragraph reality check>".
- `cockpit/roadmap.md` Next-3 + Phase scoreboard updated.
- `docs/plan/sessions/<this-prompt>.md` frontmatter flipped queued → shipped.
- `npx cockpit check` — green before push.

## End-of-session

- Tests + build + typecheck ran inline. All green.
- `npx cockpit check` ran — 0 FAIL.
- Post-implementation audit ran (or skipped because <reason>) — verdict noted above.
- Next-session prompt drafted at `docs/plan/sessions/<next>.md`.
- Commit + `git push` next.
