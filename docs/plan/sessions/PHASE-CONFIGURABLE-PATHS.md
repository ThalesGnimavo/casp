---
status: shipped
session_id: 26-06-16-002-configurable-paths
session_log: session-logs/26-06-16-002-configurable-paths.md
drafted_at: 2026-06-15
next_after: 26-06-15-002-init-fix
---

# Session — configurable-paths (PROTOCOL) + marketing/docs reconciliation

> **Status : QUEUED.** Resequenced ahead of `install-hook` by CEO decision
> (2026-06-15), motivated by onboarding **a downstream project** onto CASP: the hardcoded
> `docs/plan/sessions/` path forced that downstream project to *adopt* CASP's layout instead of CASP
> fitting that downstream project's existing one. With real users (early users) now on CASP,
> "CASP can honestly model my repo" outranks the install-hook convenience.
>
> **Two parts, independent — A can ship without B and vice-versa:**
> - **A — `sessions_dir` / `logs_dir` configurable** (casp-core code; the feature).
> - **B — marketing/docs reconciliation** (casp-website + private-docs): 0.4 added
>   `ship`/`close` (5 → 7 verbs) and 0.4.1 shipped, but the site and presentation
>   still say "five verbs" and version `0.2.1`. A tool that sells anti-drift must
>   not ship drifted marketing.

**Project roots.**
- casp-core: `/Users/juste/ZeroSuite/casp-sh/casp-core` (public npm — publish is CEO-gated)
- casp-website: `/Users/juste/ZeroSuite/casp-sh/casp-website` (**PRIVATE, auto-deploys to prod on push to main** — gate with `casp check`, push only with the CEO aware)
- private-docs: `/Users/juste/ZeroSuite/casp-sh/private-docs` (docs only, no deploy)

**Expected size.** Half-day+. Part A: schema change = two OPTIONAL keys, no migration. Part B: copy only, four languages.

---

## PART A — `sessions_dir` / `logs_dir` (casp-core)

### Motivation (the that downstream project evidence, do not skip)
`casp check` hardcodes `docs/plan/sessions/` and `session-logs/`. `next_prompt` is
already a free path (`join(root, next_prompt)`), but **`phases_shipped` non-empty
requires `docs/plan/sessions/` to exist** (check 3b), and check 7 only scans that
fixed dir. that downstream project keeps logs as `session-NNN-DATE.md` (in `session-logs/` — matches
the default) and a single rolling next-prompt file (`session-logs/NEXT-SESSION-PROMPT.md`),
**not** per-session prompt files in a dedicated dir. Onboarding it cleanly meant
creating `docs/plan/sessions/` in that downstream project. Configurable paths let such a project point
the validator at its real layout instead.

### MUST HAVE
1. **`src/shared.ts`** — extend `State` with optional `sessions_dir` / `logs_dir`; add ONE resolver (single place computes the three dirs — sessions, logs, migrations — from state with defaults `docs/plan/sessions`, `session-logs`).
2. **`src/check.ts`** — every check, the workdir-clean `git status` path list (check 8), check 3b, check 7, and every `cannot verify` / resolved-path message honor the resolver. Print the **resolved** path, not the default. (Mind the `checkOne(root)` signature from 0.4 — the resolver takes the loaded state, so it composes per-root for `--all`.)
3. **`src/new.ts` / `src/ship.ts` / `src/close.ts` / `src/status.ts`** — honor the keys where they assume `docs/plan/sessions` or `session-logs` (e.g. `new prompt` write dir, `ship`'s sessions-dir scan, `close`'s newest-log scan).
4. **`templates/state.json`** — document the keys in `notes` as OPTIONAL; do **not** add them by default (defaults stay implicit).
5. Tests: custom dirs → clean repo passes; claims against missing CUSTOM dirs FAIL; defaults unchanged (every existing test must stay green).
6. README protocol section + CHANGELOG. Version bump **0.5.0** (minor — new optional schema keys, backward-compatible).

### OPEN QUESTION for the session (decide + record)
that downstream project's single-rolling-prompt workflow (one `NEXT-SESSION-PROMPT.md`, not a dir of
prompts) is a different shape from CASP's per-session prompts. `sessions_dir` makes
the *dir location* configurable; it does not model a single rolling file. Decide:
in scope (unlikely — `next_prompt` already points at any file) or explicitly OUT,
documented. Do not over-build.

### DO NOT (Part A)
- Do not make the keys mandatory or scaffold them on `init`.
- Do not re-introduce a `'drizzle'`-style hardcoded fallback (0.4 removed it).

---

## PART B — marketing/docs reconciliation (casp-website + private-docs)

> **Read `private-docs/casp-positioning-autonomous-model-era.md` FIRST.** Honor the
> voice rules: never call CASP "memory" (no "remembers/recall/retains"); no
> superlatives, no "first/only/best"; keep evergreen copy **model-agnostic** (no
> model name in taglines). The wedge — *validate vs store, deterministic vs
> probabilistic* — must survive sharp in every language. Command names, flag names,
> PASS/WARN/FAIL, the npm install line, code blocks stay **verbatim English**.

### casp-website (PRIVATE — auto-deploys on push)
1. **`index.html` + `fr.html` + `es.html` + `de.html`** — "Five verbs" → the real set: `init`, `status`, `check`, `next`, `ship`, `close`, `new`. Add `ship`/`close` to the command-deck section; keep the "one-syllable, no homographs" framing (recommended: state "seven verbs", not the evasive "a handful"). Surface `casp check --all` in the For-Teams/CI section (the fleet gate). Full diacritics for FR/ES/DE.
2. **`roadmap.html`** (meta description line ~8 + lede line ~128 say "five verbs") — fix the count; update roadmap items to reflect **0.4 (ship/close, opt-in migrations, check --all) and 0.4.1 (init scaffolds first prompt) shipped**, and the resequence (configurable-paths now ahead of install-hook). If roadmap.html has FR/ES/DE variants, do all.
3. Translate **meaning**, not word-for-word. casp-website has its **own `casp/` cockpit** — bump it and run `casp check` (0 FAIL) before push. **Push auto-deploys to prod; only push with the CEO aware.**

### private-docs (docs only, no deploy)
4. **`CASP-PRESENTATION.md`** — version `@justethales/casp@0.2.1` → **`0.4.1`** (line ~10); §4 "Five verbs" → seven, add `ship`/`close` rows + `check --all`; §13 roadmap — **remove `casp lint`** (cut permanently), reflect 0.4/0.4.1 shipped, re-version the tail; fix the six-vs-seven products inconsistency; the tweet/talking-point lines that say "Five verbs" (line ~339).
5. **`homepage-content.md`** — the SOURCE of the homepage copy (per the workspace constitution). Update it to match the site changes (ideally update it first, then propagate to the four HTML files).
6. **`casp-optimized-roadmap.md`** — mark 0.4 / 0.4.1 shipped; note configurable-paths in flight (resequenced) and the validated tail.

### DO NOT (Part B)
- Do not push casp-website without `casp check` green AND the CEO aware it deploys to prod.
- Do not introduce superlatives or "memory" language; do not translate command names / terminal output; do not re-propose `casp lint`.

---

## BUILD ORDER

1. **Part A first** (the gated code artifact): resolver → all checks honor it → verbs honor it → tests → `pnpm`-equivalent (`npm test`) green → README + CHANGELOG → 0.5.0.
2. **Part B second** (copy): positioning doc → `homepage-content.md` → four HTML homepages → `roadmap.html` → `CASP-PRESENTATION.md` → `casp-optimized-roadmap.md`.

(They're independent — if time is short, ship A and its own close loop, leave B for a follow-up. Do not leave either repo half-committed.)

## VERIFY
- casp-core: all tests green; `node dist/cli.js check` 0 FAIL; custom-dir repo passes, missing-custom-dir FAILs.
- casp-website: `casp check` 0 FAIL in its own cockpit; grep the four homepages + roadmap.html → **no "five verbs" / "5 verbs" left**; FR/ES/DE diacritics correct; positioning canon intact (no "memory", no superlatives, model-agnostic).
- private-docs: no `0.2.1`, no `casp lint`, no stale six/seven count left in CASP-PRESENTATION.md.

## AT END — MULTI-REPO CLOSE (each repo closes its own loop)
- **casp-core (0.5.0):** impl commit → session log → `casp ship configurable-paths --log <id>` → re-point `next_prompt` to `PHASE-INSTALL-HOOK.md` (queue resumes) → state bump → `casp check` green → push (justethales dance). **npm publish 0.5.0 = separate CEO-gated act** (token rotated since 0.4.1 — ask the CEO).
- **casp-website:** commit copy changes → bump its cockpit → `casp check` green → push (justethales dance; **auto-deploys** — CEO aware).
- **private-docs:** commit docs (no deploy, no cockpit gate beyond cleanliness).
- `/notify-session` once at the end summarizing all three repos.

---

*Self-contained. Part A is the protocol feature motivated by the that downstream project onboarding;
Part B clears the marketing drift 0.4/0.4.1 introduced. Parts are independent and
each repo closes its own loop. No superlatives, no "memory" language, no `casp lint`,
no command-name translation. casp-website push deploys to prod — gate it and tell
the CEO.*
