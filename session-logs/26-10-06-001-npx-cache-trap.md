---
phase: npx-cache-trap
---

# 26-10-06-001 — npx-cache-trap: a recorded method that measures the wrong binary

Folded into 0.19.0, which was built but not yet published (no new version number).
Prompt: `docs/plan/sessions/PHASE-NPX-CACHE-TRAP.md`. Arbitration: solo (recorded 2026-09-10).

## The defect

`npx <pkg>` with no version specifier may run an already-cached copy of the package rather
than the registry's current `latest`, and its output does not say which version ran.
Replaying a rule-count fact exactly as recorded, on 2026-09-10:

```
npx --yes @justethales/casp rules | grep -c '^  CASP-'         → 31
npx --yes @justethales/casp@0.18.0 rules | grep -c '^  CASP-'  → 35
npm view @justethales/casp version                             → 0.18.0
```

The fact was inside its TTL and every assertion passed; the method named one binary and
measured another.

## The change

- `src/traps.ts`: built-in trap `npx-unpinned-package`. It fires when `npx`, `npm exec`,
  `npm x`, `bunx`, `pnpm dlx` or `yarn dlx`, in command position (start of the method, or
  after `|`, `;`, `&`, `$(` or a backtick), runs a package named without a version or tag.
  The package is read from `-p` / `--package` when given, otherwise from the first
  positional token (after an optional `--`); flags that take a value skip it. Pinned specs
  (`pkg@1.2.3`, `@s/pkg@latest`, `pkg@$(...)`), paths, URLs, git specs and `npx -c` without
  `-p` do not fire, and neither does the word `npx` in prose. It is a string test only:
  nothing is executed.
- **Per-trap severity.** The prompt assumed every trap was already a WARN. They were not:
  `src/check.ts` emitted every trap hit as a FAIL. `Trap` gains an optional `severity`
  (default `fail`). The existing estimate traps and project-declared traps keep FAIL,
  because a hit there is certainly an estimate read as a measurement. The new trap is
  `warn`, because a cached copy may still be the current version: it is a suspicion,
  and the facts layer never blocks a push on suspicion. The WARN carries its own
  remediation text.
- `src/rules.ts`: `CASP-FACT-006` `verifies` text names both severities.
- `docs/rules.md`: new "Measurement traps (`CASP-FACT-006`)" section with the measured
  numbers above. `CHANGELOG.md`: one entry under 0.19.0.

## Tests

262 → 279 (`npm test`, all pass). New in `test/facts.test.mjs`: 14 unpinned forms fire;
18 pinned forms, prose mentions and non-runner commands stay silent; a WARN trap never
downgrades a FAIL trap (built-in or project-declared); a 180 KB method of 20 000 runners
scans in under a second; an end-to-end fact with the original unpinned method yields a
`warn` finding and `casp check` exits 0.

## Audit

Read-only audit before commit: GO-WITH-FIXES. Fixed in session: `matchTrap` returned the
first hit, so the WARN trap could mask a project-declared FAIL trap — a FAIL now always
wins; the scan sliced the whole remainder per runner match (quadratic, 17.6 s on a 180 KB
crafted method) — it now scans one sticky segment; `--loglevel` and `--node-options` now
consume their value. Documented, not changed: `npx <local-bin>` warns; prose that begins
with `npx` warns; a WARN trap lists the fact under `casp fact stale`, like a TTL WARN.
Deferred: `bun x`, `pnpx`, `env`/`sudo`/`time` prefixes, runners inside `sh -c` quotes.

## Gate

`casp check` = 0 on this repository. Replayed against the casp.sh cockpit, whose methods
are already pinned: 29 PASS, 0 WARN, 0 FAIL — no false positive on a real facts file.

## Decisions taken in session

- Per-trap severity instead of downgrading every trap to WARN: downgrading would loosen
  the gate for certain estimates that have always failed. Reverting means removing the
  `severity` field.
- Folded into 0.19.0 rather than opening 0.20.0, since 0.19.0 never reached the registry.
- `yarn dlx` and `npm x` included: same semantics as the four forms the prompt lists.

## Not covered

- `npx <local-bin>` (for example `npx tsc`) fires too, because a string cannot tell a local
  binary from a published package. It is a WARN, and pinning silences it.

## Addendum — a pinned spec inside the package's own tree

Observed after publishing: inside this repository, `npx --yes @justethales/casp@0.19.0
version` printed `0.18.2`, while `@0.18.1` printed `0.18.1`, and both print their own
version from any other directory. npm treats a spec satisfied by the current project
(same name, same version) as already present and runs the `casp` binary found on `PATH` —
here an older global install. Pinning therefore holds everywhere except inside the
package's own source tree at the pinned version; replay such a method from a neutral
directory. No code change: a string test cannot see the working directory.
