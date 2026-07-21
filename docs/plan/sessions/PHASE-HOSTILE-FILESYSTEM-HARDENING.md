---
status: queued
session_id: pending
session_log: pending
drafted_at: 2026-07-21
next_after: fact-verify-consent-gate
parent_prompt: null
---

# PHASE — Hostile filesystem hardening: a gate that crashes is not a verdict

> **Status : QUEUED.** Every defect below was **reproduced by execution** on
> 2026-07-21 against the built 0.14.0 binary, not inferred from reading the source.
> The commands and their exact observed output are in CONTEXT — re-run them first;
> if any no longer reproduces, say so in the log rather than fixing something that
> is already fixed.

---

## CONTEXT

### The rule this violates is the project's own

`docs/threat-model.md` states it plainly:

> **Malformed input.** Invalid JSON, missing frontmatter, and unexpected types
> degrade to findings (FAIL/WARN), not crashes.

That holds for *content* that is malformed. It does not hold for a file the
process cannot **read**. `readFrontmatter` in `src/shared.ts` is the origin:

```ts
export function readFrontmatter(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf8');     // ← line 113, OUTSIDE the try
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  try {
    return parseYaml(m[1]) as Record<string, unknown>;   // ← the try starts here
  } catch {
    return null;
  }
}
```

The `try` wraps the YAML parse only. `existsSync` returns true for a file that
exists and cannot be opened, so `readFileSync` throws straight through every
caller. `readFrontmatter` is called by `check.ts:237` and `next.ts:58` — the gate
and the session-start gate.

### Reproduction (run these first)

```sh
mkdir hostile && cd hostile && git init -q
casp init && git add -A && git commit -qm init
chmod 000 docs/plan/sessions/PHASE-1-FIRST-SLICE.md
```

Observed on 0.14.0:

| Command | Observed | Why it is wrong |
|---|---|---|
| `casp check` | raw `EACCES` stack trace, exit **1** | Fail-closed, so not a security hole — but a stack trace is not a finding, and the operator cannot tell a crash from drift |
| `casp check --json` | **stdout empty**, exit 1 | A consumer parsing the documented report gets *nothing*. Same class as the 0.13.0 false `queue`: a machine contract that silently does not hold |
| `casp status --json` | **stdout empty**, exit 1 | **Documented contract violated.** `docs/status-json.md`: *"always exits 0"* and *"Process exit code is 0 for any valid cockpit (drift included)"* |
| `casp next` | stack trace, exit 1 | Fail-closed and acceptable in spirit; still a stack trace |
| `casp doctor` | exit **0** | Correct — doctor never gates. Keep it that way |

The `status --json` row is the most serious: an agent handed a non-zero exit and
an empty stdout from a verb documented never to gate has no way to distinguish
"cockpit is broken" from "casp is broken".

### The class, not the instance

`readFrontmatter` is the one that reproduces today, but the same shape —
`readFileSync` / `readdirSync` on repository content, outside any `try` — appears
at least at:

- `src/install-hook.ts:61` — reads `.git/hooks/pre-push` to detect the marker
- `src/next.ts:94` — prints the prompt body after the gate passes
- `src/new.ts:73`, `src/new.ts:97` — template reads
- `src/init.ts:43`, `src/init.ts:89` — template reads
- `src/facts.ts:53` — `JSON.parse(readFileSync(...))`; confirm whether the read is
  inside the existing `try` or only the parse is

Enumerate them properly during the session; that list is a starting point, not a
finding of fact. The failure modes worth handling are `EACCES` (unreadable),
`EISDIR` (a directory where a file is expected), `ELOOP` (symlink cycle) and
`ENOENT` racing `existsSync` (the file is deleted between the check and the read —
a real TOCTOU on an autonomous agent's tree).

---

## SCOPE

### MUST

1. **Reading repository content never throws out of a verb.** Centralise it: one
   helper that returns a discriminated result (content, or a reason —
   `unreadable` / `is-directory` / `vanished`), used everywhere repo content is
   read. Do not scatter `try`/`catch` at each call site; a helper is what keeps
   the next reader from reintroducing this.

2. **Each unreadable input becomes a finding, with a code.** Reserve the next free
   code(s) in the `CASP-*` space and register them in `src/rules.ts` so
   `casp rules` / `casp explain` cover them (the rule-coverage test already
   enforces this for every emitted id). Recommended severity **FAIL** for a file
   the gate needed to read and could not — an unverifiable claim is not a passing
   claim — but argue it in the log if you disagree.
   **A finding must name the path and the reason**, e.g.
   `prompt is unreadable (EACCES) · docs/plan/sessions/PHASE-1-FIRST-SLICE.md`.

3. **`casp check --json` always emits a valid report.** If the run cannot complete,
   the report must still parse and carry the failure as a finding. `schema_version`
   stays **1**; no field renamed or retyped. Emitting nothing is not an option a
   documented machine contract permits.

4. **`casp status --json` honours its documented exit contract** — `0` for any
   valid cockpit, drift or unreadable input included. If the cockpit itself is
   absent or unparseable it may still exit 1, exactly as documented today.

5. **No stack trace from any verb on hostile filesystem input.** A top-level
   handler is acceptable as a backstop, but it is not the fix — the fix is that
   the read paths do not throw. If the backstop ever fires, it must print a
   one-line diagnostic and a stable exit code, never a Node trace.

6. **`casp doctor` still always exits 0.** It reports; it does not gate. Verify
   this does not regress while adding the new findings.

7. **Regression tests, one per reproduced case**, in the established style —
   assert observable behaviour, not internals:
   - unreadable prompt (`chmod 000`) → `check` FAILs with the new code, **no stack
     trace on stderr**, exit 1
   - same repo → `check --json` stdout **parses**, contains the finding,
     `schema_version === 1`
   - same repo → `status --json` stdout **parses** and exit is **0**
   - same repo → `doctor` exits 0
   - a **directory** named `*.md` in `sessions_dir` (EISDIR) → finding, not crash
     (there is an existing guard at `check.ts:381` — confirm it still holds and
     that the new path did not bypass it)
   - a file deleted between `existsSync` and the read → finding, not crash
     (simulate by pointing at a path inside a directory removed mid-test, or by
     stubbing; if it cannot be tested deterministically, say so rather than
     writing a flaky test)
   - **a repo with no hostile input produces byte-identical output to today** —
     this is the "cannot redden an existing repo" guard

   **Skip-if-root.** `chmod 000` does not deny root, so these tests must skip
   cleanly when `process.getuid?.() === 0` (CI containers often run as root)
   rather than fail confusingly.

### SHOULD

8. Fold in any real findings from the **facts-layer audit** (launched retroactively
   after 0.14.0 was pushed) if it has reported by the time this session runs.
   Its findings, if any, belong in 0.14.0 alongside this work — 0.14.0 is still
   unpublished.

### DEFER

- Sandboxing `casp fact verify`'s approved method. The consent gate landed in
  `26-07-21-009`; containment is a separate, larger decision and is recorded as a
  stated limit in `docs/threat-model.md`.
- Any new verb. This phase adds findings and a helper, nothing else.

---

## VERIFY

- Every reproduction in CONTEXT re-run against the built binary: **no stack
  trace**, correct exit codes, `--json` parses in both `check` and `status`.
- `npm test` fully green, including the 179 pre-existing tests.
- `casp check` on **this** repo unchanged — 0 FAIL, and the human report
  byte-for-byte identical to before the session for a repo with no hostile input.
- `check --json` `schema_version` still `1`.
- `casp rules` lists the new code(s); `casp explain <CODE>` resolves each.
- `casp doctor` exits 0 in every fixture.

---

## DO NOT

- **No LLM, no network.** Filesystem error handling; nothing here needs a model.
- Do not change what any existing rule means, or renumber existing codes.
- Do not bump `check --json` `schema_version`.
- Do not make `doctor` gate, and do not make `status` gate.
- Do not "fix" this with a bare top-level `try/catch` that swallows everything and
  exits 0 — that converts a loud crash into a silent pass, which is strictly worse
  than the bug. Fail closed, but fail *legibly*.
- Do not publish to npm. 0.13.0 and 0.14.0 are both unpublished (npm `latest` is
  0.12.1) and publishing is a separate, CEO-gated act.

---

## AT END OF SESSION

1. Tests green; `git add` only this session's files (no `-A`).
2. Patch bump within the unpublished 0.14.0 line **or** fold into the existing
   0.14.0 `CHANGELOG.md` entry — 0.14.0 was never published, so folding is
   preferred, exactly as `26-07-21-009` did.
3. **Run the commissioned audit BEFORE pushing, and wait for it.** Three
   consecutive releases (0.12.0, 0.13.0, 0.14.0) shipped a defect that a green
   build and a passing suite did not catch, and in two of those the author pushed
   ahead of the review. Do not repeat it.
4. Session log, next prompt drafted, state bump, `casp check` 0 FAIL,
   account-dance push.

---

*A gate exists to turn an unknown into a verdict. Anything that makes it exit
without one — a stack trace, an empty `--json`, a non-zero from a verb documented
never to gate — is the gate failing at its only job, and it fails hardest exactly
when the tree is weird, which is when you most needed the answer.*
