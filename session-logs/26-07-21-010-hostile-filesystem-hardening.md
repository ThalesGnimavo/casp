---
phase: hostile-filesystem-hardening
---

# 26-07-21-010 — a gate that crashes is not a verdict

Filesystem hardening in unpublished code. Folded into the 0.14.0 CHANGELOG entry
rather than a 0.14.1, since 0.14.0 was never published. No LLM, no network — this
slice is error handling.

## The defect

`docs/threat-model.md` promised:

> **Malformed input.** Invalid JSON, missing frontmatter, and unexpected types
> degrade to findings (FAIL/WARN), not crashes.

That held for content that is malformed. It did not hold for a file the process
cannot **read**. `existsSync` answers *is there a name here*, never *can this
process open it* — so the read one line later threw straight through every
caller:

```ts
// src/shared.ts, before
export function readFrontmatter(filePath: string) {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf8');   // ← outside the try
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  try { return parseYaml(m[1]); } catch { return null; }   // ← the try starts here
}
```

The `try` wrapped the YAML parse only.

## Reproduction

Measured against the built 0.14.0 binary (`91c822b`) on a fixture with a single
`chmod 000` prompt, then against the fixed binary on the same tree:

```sh
mkdir hostile && cd hostile && git init -q
casp init && git add -A && git commit -qm init
chmod 000 docs/plan/sessions/PHASE-1-FIRST-SLICE.md
```

| Command | 0.14.0 before | after |
|---|---|---|
| `casp check` | stack trace, stdout **empty**, exit 1 | full report, `CASP-IO-001` FAIL, exit 1 |
| `casp check --json` | stdout **empty**, exit 1 | valid v1 report carrying the finding, exit 1 |
| `casp status --json` | stdout **empty**, exit 1 | valid report, exit **0** |
| `casp next` | stack trace, exit 1 | one-line refusal, no stdout, exit 1 |
| `casp status` (human) | 411 bytes then stack trace, exit 1 | full snapshot, exit 0 |
| `casp doctor` | exit 0 | exit 0 (unchanged) |

Every row the queued prompt listed reproduced. The human `casp status` row was
not in the prompt and was found while measuring: it printed its first two
sections and then died mid-report.

`status --json` is the serious one. `docs/status-json.md` documents that verb as
never gating — *"Process exit code is `0` for any valid cockpit (drift
included)"*. A consumer got a non-zero exit and an empty stdout from a contract
saying neither can happen, and no way to distinguish "the cockpit is broken"
from "casp is broken". Same class as the 0.13.0 false `queue`: a machine
contract that silently does not hold.

**Methodology note.** The first measurement pass was wrong and was thrown away.
It ran `node $CLI $cmd` with an unquoted variable under zsh, which does not
word-split — `check --json` arrived as a single argument, hit the unknown-command
path, and produced exactly the "empty stdout, exit 1" the real bug also produces.
The table above was re-measured with each argument passed separately, against a
git worktree of `91c822b` built from source, so the before column is the real
binary and not an artifact of the harness.

## What shipped

**One door, not scattered `try`/`catch`.** Every read of repository content goes
through `src/shared.ts`: `readTextFile`, `readBytes`, `readDirEntries`,
`pathKind` / `isDir`, `readFrontmatter`, `readStateFile`. Each returns a
discriminated result — content, or a reason (`unreadable` / `is-directory` /
`vanished`) carrying the path and the OS errno verbatim. Patching each call site
would have worked exactly once; the helper is what stops the next reader
reintroducing it.

`readFrontmatter`'s signature changed from `Record<string, unknown> | null` to a
result type. That was deliberate rather than a compatibility wrapper: a wrapper
returning `null` on an unreadable file would let every existing caller silently
conflate *cannot open* with *no frontmatter* — the exact distinction the old
return value threw away. Changing the type forced all eight call sites to decide.

**Two new rules, area `IO`.** `CASP-IO-001` — repository content the gate needs
is readable. `CASP-IO-002` — the validation run completed (the backstop; a
finding here is a CASP bug, not a repository problem). Both **FAIL**: an
unverifiable claim is not a passing claim. The gate may say *I could not check
this*; it may not say *clean*. Each finding names the path and the reason —
`prompt is unreadable (EACCES) · docs/plan/sessions/PHASE-1-FIRST-SLICE.md` —
because neither alone is actionable.

**The `--json` guarantee.** `checkOneSafe` wraps `checkOne` so a report is
emitted even if the validator itself fails, and every consumer (`check`,
`check --all`, `next`, `status`, `verify`, `fact check`) goes through it.
`schema_version` stays **1**, no field renamed or retyped. `src/cli.ts` gained a
top-level handler that prints one line and exits 1 — a backstop, explicitly not
the fix, and it fails closed. Swallowing into exit 0 would convert a loud crash
into a silent pass, which is strictly worse than the bug.

**Read sites converted:** `check.ts` (state.json, next_prompt, the logs and
sessions walks, both migrations scans), `chain.ts`, `next.ts`, `status.ts`,
`facts.ts` (`loadFacts`, `used_in` marker reads), `ship.ts`, `close.ts`,
`new.ts`, `install-hook.ts` (`isCaspHook` now fails closed — an unreadable hook
is not ours, so `install` will not clobber it and `--remove` will not delete it),
`doctor.ts` (its local defensive `isDir` deleted in favour of the shared one).

## The one deliberate behaviour change

A directory named `*.md` inside `sessions_dir` or `logs_dir` was *silently
skipped* by an `isFile()` guard. It is now a `CASP-IO-001` FAIL.

A document CASP enumerated and could not read is precisely how a broken state
surface reads as clean — the same false-green pattern already refused for a
missing migrations directory and for unbacked `phases_shipped` entries. In
`sessions_dir` there is no downstream rule that would catch the consequence: the
prompt simply vanishes from validation.

Blast radius: a repository containing a directory whose name ends in `.md`
inside its state surface was green and is now red. That is the intent. One
existing test in `test/check.test.mjs` asserted the old exit 0 and was updated to
the new contract (it still asserts the rest of the report renders and
`shipped_log.declared` stays PASS — the point is that the run completes).

## What did not change

`fileHash`, `loadState` and `loadStateWithHash` were rebuilt on the new door but
keep their exact prior semantics, including `loadState` returning null for a
`state.json` whose entire content is `null`. A genuinely **missing** file is not
an IO failure: `existsSync` answers honestly and `CASP-PROMPT-001` already covers
it, so ordinary drift is not reclassified. There is a regression test pinning
that.

Template reads inside the npm package itself (`init.ts`, `upgrade.ts`,
`new.ts`'s scaffold copies) were left on plain `readFileSync`. They read files
shipped with the package, not repository content; if those are unreadable the
install is broken, and the top-level backstop covers them with a one-line
diagnostic. Stated here rather than silently skipped.

## The audit caught a regression this fix introduced

The commissioned review ran before push and returned **NO-GO** on one item. It
was right, and it was a defect created by this session, not found in the old
code:

**A FIFO named `*.md` in the sessions or logs directory hung `casp check`
forever.** The old prompt walk filtered with `.filter(f => statSync(f).isFile())`.
Converting the walk to the new door deleted that filter, so a non-regular file
went straight to `readFileSync` — and `readFileSync` on a pipe with no writer
does not fail, it **blocks in `open(2)`**. No `try`/`catch` catches a hang.

That is strictly worse than the stack trace it replaced. A crash at least
produces an exit code; a hang produces no verdict *and* no exit, so a pre-push
hook wedges the developer's terminal and CI runs out to its own timeout. Fixed
by inspecting before opening: `regularFileFailure()` runs a `stat` inside
`readTextFile` / `readBytes`, and anything that is not a regular file becomes a
`CASP-IO-001` finding. The remaining `stat`→`open` window is a race rather than
a systematic hang, which is the best available without `O_NONBLOCK` plumbing
that Node does not expose to `readFileSync`; it is noted in the code.

Three further fixes from the same review:

- **One condition was reported twice, under one id.** `next_prompt` normally
  lives inside `sessions_dir`, so an unreadable prompt was recorded by the
  next_prompt block *and* by the sessions walk — two findings sharing
  `io.<rel>`. A consumer keying by id silently drops one, the human report
  printed the same file and remediation twice, and the drift count read 2 for a
  single defect. Findings are now deduplicated by path, first (most specific)
  caller winning. Pinned by a test asserting id uniqueness.
- **`vanished` was a silent skip, and that was a false green.** I had exempted
  it on the reasoning that a file which is gone carries no claim. Wrong for the
  logs walk specifically: that walk builds the set of declared phases, so a log
  disappearing mid-walk empties the set, collapses the adoption window, and
  silences the whole `CASP-SESSION-003` category — turning a genuine FAIL into
  no output at all. Rare, race-dependent, and exactly the class this phase
  exists to remove. `vanished` is no longer exempt in either walk.
- **`status --json` was only half protected.** `checkOneSafe` guarded the
  embedded verdict, but the git probes, project metadata and chain analysis run
  *before* the single `console.log` — a throw there reproduced the original
  defect (empty stdout, exit 1) one function over. The assembly is now wrapped
  and always emits a valid v1 document with `check.verdict: null` and an `error`
  field, exit 0.

Two documented machine contracts were stale after the change and are updated:
`docs/check-json.md` promised `id: "state.file"` as the only pre-validation
finding (an unreadable cockpit now yields `io.casp/state.json`), and
`docs/status-json.md` enumerated only missing/invalid as the exit-1 cases.

The audit also correctly called the "byte-identical output" test **vacuous** —
it ran the new binary twice, which tests determinism, not non-regression. The
real comparison was done out of band against a worktree build of the parent
commit (identical, both formats). The test is renamed to what it actually
asserts rather than left claiming more than it does.

## Tests

193 total (179 → 193). `test/hostile-fs.test.mjs` is new: 14 tests, one per
reproduced case, asserting observable behaviour — exit codes, stdout that
`JSON.parse`s, and **the absence of a stack trace on stderr**. The two FIFO
tests would time out rather than fail if the stat-before-open guard were
removed, which is the point.

They skip cleanly when `process.getuid?.() === 0`, since `chmod 000` does not
deny root and a CI container running as root would otherwise fail confusingly.

**The genuine TOCTOU is not tested, and that is stated in the test file rather
than faked.** Winning the race between `existsSync` and `open` from outside the
process needs either a sleep (flaky) or a stub of `node:fs` inside the spawned
CLI (which would stop testing the built binary, the thing every other test here
asserts against). What is covered: the race's errno enters through the same door
as everything else, `classifyFsError` maps `ENOENT` to `vanished`, and there is
no unguarded read left for it to throw from.

## Verification

- Every reproduction re-run against the built binary: no stack trace, correct
  exit codes, `--json` parses in both `check` and `status`.
- `npm test` — 193/193 green, 0 skipped.
- A `*.md` FIFO fixture: `casp check` returns in under a second with one
  `CASP-IO-001` FAIL and exit 1, where it previously never returned.
- `casp check` on this repository: human report and `--json` report **byte-for-byte
  identical** to the pre-session binary on the same tree, both exit 0. Diffed
  against a worktree build of `91c822b` rather than asserted.
- `casp rules` lists both new codes; `casp explain CASP-IO-001` / `CASP-IO-002`
  resolve.
- `casp doctor` exits 0 in every fixture.

## Docs

`docs/threat-model.md` gains an **Unreadable input** clause next to the existing
malformed-input one, stating the fail-closed posture and the `--json` guarantee.
`docs/rules.md` and the README catalogue list `CASP-IO-001`/`002`.
