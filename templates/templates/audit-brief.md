# Audit brief — canonical Explore sub-agent template

> Use this template to spawn the post-implementation audit agent. Copy the body below into the `prompt` parameter of an `Agent` call with `subagent_type: "Explore"`. Fill the `<...>` placeholders with the session's actual surface.
>
> Why this template exists : generic "review this" prompts produce generic feedback. The structured `Context / Files / Checklist / Output` shape forces the audit to be specific to THIS session's risk class.

---

You are a senior reviewer auditing a freshly-written `<one-line description of the surface — multi-tenancy on a new entity / schema migration / auth path / billing flow>` for `<project name>` at `<absolute project root>`. Read-only. Do NOT edit. Produce a structured verdict + per-item PASS/WARN/FAIL with `file:line` refs + a "Top 5 to fix" list + a "deferred / nice-to-haves" list.

## Context

This session shipped `<one paragraph — what landed, what's intentionally out-of-scope, the parent prompt path>`.

Parent prompt with the spec : `<docs/plan/sessions/<id>.md>`. Read it first — it states the rules the new files must obey.

## Files to audit (read whole file, not excerpts)

1. **`<path>`** (NEW | MODIFIED) — one-line summary of what each verb does.
2. **`<path>`** (NEW | MODIFIED) — same shape.

For context (read once for shape) :
- `<schema block>` — the new tables / columns.
- `<helper>` — the signature that must not drift.
- `<auth / hooks>` — the gate behavior the new routes inherit.
- `<closest analogue>` — what shape the new files should mirror.

## Audit checklist

For each item, write PASS / WARN / FAIL + `file:line` + one-sentence justification. The checklist below is the canonical baseline — REMOVE sections that don't apply, ADD sections specific to the session's risk class (race conditions, SQL parser corner cases, TTL semantics, reverse-proxy assumptions, idempotency, header trust, S3 / DB orphan risks, MIME / extension validation, fire-and-forget task safety, error response contracts, i18n parity, dead code, doc/spec conformance).

### A. Multi-tenancy (if the session touched a per-user entity)

1. Every read query filters `WHERE userId = locals.user.id` or its equivalent.
2. **404-not-403 leak protection on cross-user fetch.** Cross-user response is byte-identical to a truly-nonexistent row.
3. **404-not-403 on write surfaces.** Non-owner PATCH / DELETE returns 404, not 403.
4. Shared rows do not appear in the per-user list.

### B. Input validation

5. Every body schema ends with `.strict()` (or equivalent). Unknown keys reject.
6. PATCH requires at least one field. Empty body returns 400.
7. String fields are capped to the schema column's size.
8. Query params are whitelisted. Numeric params coerced + capped. Datetime params validated.

### C. Audit log discipline

9. No content body in any audit payload.
10. No message body, no S3 URL, no prompt content in `payload_json`.
11. PATCH audit includes which `fields` changed and the entity id — nothing else from the request.
12. DELETE audit captures count metadata from a pre-delete COUNT.
13. CREATE audit logs ids only — no payload content for freshly-empty rows.

### D. Cascade / orphan behavior

14. DELETE cascades via the FK (no manual child-row delete in the route).
15. Pre-delete COUNT is correct (counts the rows about to be cascaded, not the rows AFTER delete).

### E. Pagination cursor honesty

16. `nextCursor` is `null` when the result fits in one page.
17. Cursor is the sort-key of the LAST returned row.
18. Select fetches `limit + 1` rows to detect overflow without an extra query.

### F. Out-of-scope guards

19. No LLM-client / SSE / streaming import unless the session is the streaming session.
20. No writes to tables this session was not allowed to touch.
21. No external-effect code (email send, payment charge, file upload) unless the session ships that integration.

### G. Regression surface

22. No existing files modified except the explicit surface this session shipped.
23. Tests + build + typecheck green.
24. `npx cockpit check` ran 0 FAIL.

## Output format

```
## Verdict
<GO | GO-WITH-FIXES | NO-GO>

## Detail
A1. <PASS|WARN|FAIL> file:line — justification
A2. ...
...
G24. ...

## Top 5 to fix
1. <issue> — file:line — proposed fix
...

## Deferred / nice-to-haves
- ...
```

Keep the report under 600 words. Skip generic boilerplate. If everything is PASS, the verdict is GO and the "Top 5" can be empty.

---

## Tips for the spawning session

- **Brief the agent as a senior reviewer, not a generic "review this."** The structure above IS the brief.
- **Spawn in foreground** when you need the verdict before pushing.
- **Apply findings inline.** Don't ship "GO-WITH-FIXES" and defer the fixes ; they ride the same commit family as the implementation.
- **Document deferred items in the session log** under `## Deferred / risks`.
- **Re-run tests + `npx cockpit check`** after fixes.
