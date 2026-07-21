---
status: shipped
session_id: 26-07-21-002-upgrade-command
session_log: session-logs/26-07-21-002-upgrade-command.md
drafted_at: 2026-07-17
next_after: 26-07-15-001-0-9-0-doctor-version
---

# Session — casp upgrade : refresh a cockpit's scaffolds without eating its state

> **Status : QUEUED.** Drafted 2026-07-17 while dogfooding CASP across a downstream
> project's sub-repos. A repo scaffolded at 0.7.0 could not adopt 0.9.0's scaffolds:
> `init` refuses on an existing `casp/`, and `init --force` overwrites *everything*
> — including the hand-written `state.json` / `now.md` / `roadmap.md`. There is no
> non-destructive refresh path. It is a no-op **today** only because 0.7.0→0.9.0
> happened to change zero scaffold bytes; the first time a template or a required
> state key changes, every existing cockpit is stranded with no command to migrate.
>
> **Goal.** Ship `casp upgrade`: refresh the version-controlled scaffold files
> (`templates/**`, `README.md`) to the installed CLI's canonical copies, additively
> migrate `state.json` (new optional keys only, never touch values), stamp the
> cockpit's CASP version, and print a per-file diff — all deterministic, local-only,
> never touching `now.md` / `roadmap.md` content.
>
> **Why now.** Without it, CASP can improve its own scaffolds and schema but cannot
> deliver those improvements to any repo already using it — the protocol's own
> continuity story has no continuity across versions. `doctor` can see the drift
> only once the cockpit records which version scaffolded it.

**Project root.** `/Users/juste/ZeroSuite/casp-sh/casp-core`
**Branch.** `main` (single branch, push at end).
**Session log target.** `session-logs/YY-MM-DD-NNN-upgrade-command.md`.
**Expected size.** 2-3 h. **Yes** schema change (one additive optional key). No migration. No UI.

---

## CONTEXT — the three weaknesses this closes (source-grounded, 2026-07-17)

1. **No `upgrade` verb.** `src/init.ts::runInit` refuses when `casp/` exists
   (`existsSync(target) && !force → exit 0`), and `--force` calls
   `copyDir(TEMPLATES, target, force=true)`, which overwrites *every* file the
   package ships under `templates/` — including `state.json`, `now.md`,
   `roadmap.md`. So the only refresh path destroys the operator's data. Verified
   live: a downstream cockpit scaffolded at 0.7.0 had no way to reach 0.9.0's
   scaffolds short of manual copying.

2. **The cockpit records no CASP version.** `schemas/state.schema.json` has no
   `version` key and `templates/state.json` scaffolds none — confirmed by grep.
   Consequence: nothing can answer "which CASP scaffolded this cockpit?", so
   `upgrade` has no from-version to drive a migration and `doctor` cannot warn that
   a cockpit is stale. This is the enabling gap — fix it first.

3. **`--force` has no granularity.** It is the sole refresh mechanism and it is
   all-or-nothing across data + scaffolds. Even a caller who only wants the new
   `README.md` loses their state. `upgrade` is the surgical alternative; `--force`
   stays the deliberate nuke.

These are one slice: a version stamp (2) is the prerequisite for a safe `upgrade`
(1), which is the granular counterpart to `--force` (3).

---

## REFERENCE FILES (read these before writing)

1. **`src/init.ts`** — `copyDir` (the recursive scaffold writer, already skips
   `.DS_Store` and existing files unless `force`) and `interpolate` (`{{TODAY}}`).
   `upgrade` reuses both; the new logic is *which* files it is allowed to touch.
2. **`src/doctor.ts`** — the read-only PASS/WARN/FAIL surface to extend with a
   cockpit-staleness WARN once the version stamp exists. Mirror its exit-0-always,
   never-gate contract.
3. **`src/shared.ts`** — `pkgVersion()` (the installed CLI version to stamp and
   compare against), `loadState` / `saveState` (additive state edit), `TEMPLATES`
   resolution pattern, `todayISO`.
4. **`schemas/state.schema.json`** + **`templates/state.json`** — the additive
   `version` key lands here in lockstep. `docs/check-json.md` / `check-result`
   schema are untouched (this adds no `check` finding).
5. **`src/cli.ts`** — command dispatch (add the `case 'upgrade'`) and the
   `--help` routing.
6. **`src/help.ts`** — the single naming registry; `upgrade` must be added here or
   the coverage test that asserts every verb has a help block will fail.
7. **`CHANGELOG.md`** + **`README.md`** command deck — updated in lockstep, the
   standing convention for every verb.

---

## SCOPE (must-have → should-have → defer)

### MUST HAVE — ship these or don't push

1. **Additive `version` key in `state.json`** — optional `string`, the CASP
   version that last scaffolded or upgraded the cockpit. Add to
   `schemas/state.schema.json` (optional, NOT in `required`) and
   `templates/state.json` (so fresh `init` stamps `pkgVersion()`). `init` writes it;
   its absence is legal (pre-0.10 cockpits) and must never turn `check` red — assert
   a repo with no `version` key still PASSes. `schema_version` of `check --json`
   stays `1`; no `check` finding is added.

2. **`casp upgrade`** — `src/upgrade.ts`, dispatched from `cli.ts`.
   - Refreshes ONLY the version-controlled scaffolds: `templates/**` and
     `README.md`. An explicit allowlist, never a blanket `copyDir` over `casp/`.
   - **Never touches** `state.json` values, `now.md`, or `roadmap.md` content. The
     only `state.json` write is additive: set/refresh `version` to `pkgVersion()`,
     and add any *new optional* keys the current schema defines with their default,
     leaving every existing value byte-identical (round-trip the parsed object via
     `saveState`, don't template over it).
   - Idempotent: on a cockpit already at the installed version with identical
     scaffolds, it writes nothing and says so.
   - Prints a per-file verdict (`refresh` / `same` / `skip (data file)`), and a
     one-line `state.json version: X → Y`. `--dry-run` prints the plan and writes
     nothing.
   - Refuses cleanly (exit 1, clear message) if there is no `casp/` to upgrade —
     point the user at `init`.

3. **Tests** (mirror the doctor/version test style; keep every prior test green):
   - `upgrade` on a stale cockpit refreshes `README.md`/templates, stamps `version`,
     and leaves `state.json` values + `now.md` + `roadmap.md` byte-identical.
   - Idempotent re-run writes nothing.
   - `--dry-run` writes nothing.
   - A cockpit with no `version` key still PASSes `check` (backward-compat).
   - `init` now stamps `version`; a fresh `init → check` stays green.
   - No `casp/` → exit 1 with the init pointer.

### SHOULD HAVE

4. **`doctor` staleness WARN** — once the version stamp exists, `doctor` compares
   `state.version` against `pkgVersion()` and emits a WARN (never FAIL, never gates)
   when the cockpit is older, pointing at `casp upgrade`. Silent when equal or when
   `version` is absent on a pre-stamp cockpit (a WARN there would nag every
   not-yet-upgraded repo on day one — instead say "unstamped; run upgrade to adopt
   version tracking" at most once, or stay silent; decide in-session and test it).

### DEFER (name, do not build)

- **State *schema* migration beyond additive keys** (renames, required-key
  additions). Out of scope: today's schema evolves additively and `upgrade` only
  needs additive handling. A breaking schema change is a separate, versioned
  migration concern — note it in the session log, don't design it here.
- **`upgrade --check` / CI "is this cockpit stale?" gate.** `doctor`'s WARN covers
  the human path; a gating variant is demand-gated tail material.
- Auto-running `upgrade` inside `init`/`check` — upgrade stays explicit and
  operator-invoked, same boundary as `install-hook`.

---

## CONSTITUTION CHECK (why this is on-brand, not scope creep)

Judged against the four non-negotiables (`CLAUDE.md` §2), `upgrade` is GREENLIGHT —
the same tier as `ship` / `close` / `init`, tooling ergonomics layered on the five
protocol verbs, adding no protocol concept:

- **Gate, not harness.** `upgrade` mutates the state/scaffold files an operator
  already edits by hand; it orchestrates nothing, schedules nothing, runs no agent.
- **Deterministic forever, no LLM.** Pure file IO + a `pkgVersion()` compare. Nothing
  probabilistic touches `check` or `upgrade`.
- **Local-only, zero telemetry.** No network, no account.
- **Anti-roadmap held.** No PM surface, no code review, no LLM in the gate, no harness
  UI. The frozen protocol layer is untouched; this is ergonomics.

`upgrade` in fact *serves* the wedge: the protocol's continuity story is undermined if
CASP can improve its own scaffolds/schema but cannot deliver them to a repo already on
CASP. This closes that gap deterministically.

---

## BOUNDARIES (the CASP invariants this must not break)

- **Deterministic, local-only, LLM-free, no network.** `upgrade` is file IO +
  `pkgVersion()`, nothing more.
- **`check` stays the only gate.** `upgrade` never gates; `doctor`'s new WARN never
  gates (exit 0 always, like the rest of doctor).
- **No untrusted value reaches a shell.** `upgrade` touches the filesystem only; if
  it ever needs git, route through `gitArgs()`.
- **Data is sacred.** The whole point is that a version bump never costs the
  operator a keystroke of `state.json` / `now.md` / `roadmap.md`. If any test
  observes a data-file byte change, the feature is wrong.
- **Rule-coverage invariant.** `upgrade` adds no `check` finding, so the
  every-finding-maps-to-a-rule test is unaffected; keep it that way.

---

## Close ritual

`node dist/cli.js check` before push. Update `CHANGELOG.md` (minor bump — new verb,
additive schema key), the `README.md` command deck, `casp/roadmap.md` (move this
slug queued→shipped via `casp ship`), and `casp/state.json` (`casp close`). A
read-only audit pass before the release commit is the standing convention for a new
verb.
