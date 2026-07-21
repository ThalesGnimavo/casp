---
phase: 0.12.1-upgrade-data-loss-fix
---

# 26-07-21-003 — 0.12.1 : two data-loss paths in `casp upgrade`, found after publish

**Session prompt :** none — an unplanned fix session following a post-publish review of `0.12.0`.
**Previous session end :** `6f7a5ad` (0.12.0 state bump).
**Delegation :** two read-only reviewer sub-agents over the 0.12.0 diff; both findings reproduced by execution before any code changed.
**State at session start :** 0.12.0 built, tested at 118, and **already published to npm**.

## What went wrong, first

`0.12.0` was published **before** its adversarial review returned. The review then
found two reproduced data-loss paths. The publish was a judgement error, not a
timing accident: an initial hand-check of the same code concluded the denylist was
"fail-closed, good direction" — true of the *collision* axis, and wrong about the
axis that matters — and rated the symlink gap "low severity" without attempting the
exploit. The reviewer attempted it and destroyed a file outside the cockpit on a
plain run.

Damage control, in order:

1. `npm deprecate @justethales/casp@0.12.0` with a message naming the defects and
   pointing at 0.12.1. Exposure window was roughly ten minutes on a package doing
   ~1.1k downloads/month.
2. Both exploits reproduced locally against the built binary, to confirm the report
   rather than take it on trust.
3. Fixed, tested, republished as 0.12.1 the same session.

## The two data-loss paths

### 1 — A symlinked parent directory let a write escape the cockpit

The symlink guard inspected only the final path component. Every parent is followed
by `mkdirSync` and `writeFileSync`, so a symlinked `casp/templates/` — or a
symlinked `casp/` itself, which is ordinary in a monorepo — meant `upgrade` wrote
into, and overwrote files in, a directory it was never pointed at. **No race was
required**; a plain run did it.

Fixed with a realpath containment check: the resolved parent of every write target
must sit inside the resolved cockpit, and a path that cannot be resolved **fails
closed**. The check walks up to the deepest existing ancestor, because on an `add`
the leaf legitimately does not exist yet.

### 2 — The refresh set was a denylist, so the default for an unknown file was overwrite

It named `state.json`, `now.md`, `roadmap.md` and refreshed everything else the
package ships. The collision direction was safe, which is what made it look right.
The dangerous direction is the other one: **any root-level template added in a
future release would silently replace whatever the operator had written at that
path**, with no warning line — the "(replaces your local edits)" annotation was
hardcoded to `README.md`. Correctness depended on a human remembering to extend a
list in the same commit that added a template.

Inverted to an allowlist — `README.md` plus everything under `casp/templates/`,
which is by definition scaffold. A shipped file this code has not heard of is
skipped, not written.

This was not hypothetical. The next queued phase introduces `casp/facts.json`,
operator data, at the cockpit root.

## Three more, same review

- **An unrecognised flag was ignored**, so `casp upgrade --dryrun` performed the
  real write the user was trying to preview. Now exits 2 having written nothing.
- **A `state.json` holding a bare scalar** (`42`) parses, is truthy, is not null —
  so it passed the guard and the property assignment threw under strict mode,
  after the scaffolds were written and before the stamp, printing a raw stack
  trace. Now reported as a broken cockpit and left alone.
- **`saveState` was a naked truncating write.** A crash or a full disk mid-write
  destroyed the state file it was updating. Now temp file plus `rename`, atomic
  within a filesystem. Pre-existing and shared, so this also hardens `ship`,
  `close` and `audit`.

## What the review confirmed as sound

Worth recording, because the architecture held up under a hostile read: the plan is
**content-derived** rather than version-derived, so a stamp ahead of or behind
reality never suppresses or repeats a refresh and a half-applied run self-corrects.
Per-file error containment covers every write including the `mkdirSync`. The state
write is a genuine read-modify-write — free-form keys, a large `notes` string, and
an operator's own `my_own_version` all survive byte-identical. The `version` →
`casp_version` namespacing was the right call for exactly that reason. The failures
were all at the boundary: which paths are in scope, and what the filesystem
underneath them actually is.

## Verify

- `npm test` — **121/121 pass** (117 after the fixes broke one stale test, 121 with
  four new ones).
- Both exploits re-run against the fixed binary, independently of the suite: the
  outside file stays byte-identical, nothing is created outside the cockpit, an
  unrecognised root-level file survives, `--dryrun` is refused.
- `casp check` exit 0.
- Registry state confirmed directly: `dist-tags.latest = 0.12.1`, `0.12.0`
  deprecated, `0.12.1` not deprecated.

## Deferred / risks

- **`O_NOFOLLOW` on the leaf write** was not added. The check→write TOCTOU remains
  theoretically open; low priority for a local CLI where the attacker would already
  need write access to the repo, and the parent-escape hole that mattered is closed.
- **`casp/README.md` is still an unrecoverable local-edit loss path** — by design
  and annotated, but with no backup and no confirmation. Worth a `.bak` or a
  `--force` requirement when it differs from the shipped canonical.
- **Refreshed non-README root files are not annotated** in the output. Moot under
  the allowlist today, since `README.md` is the only one.
- **The process lesson**: do not publish ahead of the review that was commissioned
  precisely because the code writes into other people's repositories.
