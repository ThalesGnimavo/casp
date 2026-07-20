# 26-07-20-001 — Regularize the 0.10.0 cockpit drift + queue `facts-layer`

## What changed (state surface only, no code)

Two things, in one state-surface session:

### 1 — The 0.10.0 drift, regularized

Found on 2026-07-20: `package.json` and `CHANGELOG.md` were at **0.10.0** (shipped 2026-07-19,
published to npm), but the cockpit still said `current_phase: 0.9.0-doctor-version` —
`phases_shipped` stopped at 0.9.0, no session log covered the release, `now.md` was frozen at
0.7.0, and the roadmap scoreboard had no 0.10.0 row. `casp check` was green the whole time: no
rule links `package.json` or the CHANGELOG to `phases_shipped`. Structurally valid, semantically
behind — the exact drift class the queued `facts-layer` phase exists to catch (its first
declared fact will be `released-version`, source `package.json`).

Regularized, evidence-first (CHANGELOG entry + real diff of `f682356`, nothing invented):

- Retrospective log written: `session-logs/26-07-19-001-0-10-0-audit-watermark.md`.
- `phases_shipped` += `0.10.0-audit-watermark` ; `current_phase` → `0.10.0-audit-watermark`.
- `casp/now.md` rewritten (was three versions stale) ; roadmap scoreboard + shipped table
  gained the 0.8.0 / 0.9.0 / 0.10.0 rows they were missing ; the parked "site sync to 0.6.0"
  row updated (the site now advertises through 0.10.0).

### 2 — `facts-layer` queued

- `docs/plan/sessions/PHASE-FACTS-LAYER.md` committed (`status: queued`), sequenced after
  `check-shipped-log` and before `upgrade-command`: opt-in `casp/facts.json` + six
  `CASP-FACT-001..006` rules (source hash, TTL, method provenance, static traps registry) —
  prove a claim's **freshness**, never its truth. Zero LLM; the `casp lint` red line holds.
- Rationale for the sequencing: it answers a demonstrated real-world incident (2026-07-20, a
  production cockpit — five costly stale claims invisible to `casp check` because none was a
  state drift), while `upgrade-command` is ergonomics. Invert if disagreed.
- `next_prompt` unchanged: `PHASE-CHECK-SHIPPED-LOG.md` stays the next product slice.

## Verification

- 92/92 tests green (`npm test`).
- `state.json` parses; `node dist/cli.js check` exit 0 before push.
