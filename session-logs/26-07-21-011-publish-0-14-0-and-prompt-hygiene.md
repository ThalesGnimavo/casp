---
phase: publish-0-14-0-and-prompt-hygiene
---

# 26-07-21-011 — 0.14.0 published, and the state surface says what it means

Release session, plus two documentation defects in the state surface itself.
No source file changed; 193 tests stay green and the published tarball is the
tree audited at `4996b86`.

## 0.14.0 is on npm

`@justethales/casp@0.14.0` is `latest`. It carries, in one entry:

- the facts layer (`casp/facts.json`, `CASP-FACT-001` … `006`, the static trap
  registry, `casp fact list|check|verify|stale`);
- compare-and-swap on every `state.json` write;
- the consent gate on `casp fact verify` — the confirmation now precedes the
  execution rather than gating only the write;
- hostile-filesystem hardening (`CASP-IO-001` / `002`, one read door in
  `src/shared.ts`, `stat` before `open`).

Verified after publish by installing the published tarball into an empty
directory rather than trusting the local build: the binary reports `0.14.0`, and
`casp rules` resolves all eight new codes.

**0.13.0 is deliberately not published, and will not be.** The code tagged
`0.13.0` in the changelog contained the aliased-fork defect: `status --json`
emitted a `queue` asserting an order the frontmatter did not support — a false
machine-readable claim, the worst failure class this project has. The fix landed
in `03a92b0` and is folded into the 0.14.0 entry. Publishing a version known to
emit a false claim, for the sake of contiguous version numbers, is not a trade
this project makes. npm version sequences are allowed to have holes.

## Defect 1 — four shipped prompts claimed `session_id: pending`

`PHASE-04-CLOSE-LOOP`, `PHASE-CASP-HELP`, `PHASE-CONFIGURABLE-PATHS` and
`PHASE-FACTS-LAYER` all carried `status: shipped` with a resolving
`session_log:` pointer and `session_id: pending`.

`casp check` passed throughout, and correctly: `CASP-PROMPT-005` requires a
shipped prompt to carry a `session_log` pointer, and each did. Nothing in the
rule set reads `session_id` on a prompt. So this is a documentation defect, not
drift — but it is a documentation defect *in the state surface*, which is the
one place the protocol asks to be literally true. A field reading `pending` next
to a field naming the log that closed it is a contradiction a reader has to
resolve by guessing which one lies.

Backfilled from each prompt's own `session_log` stem — no new information was
invented, the value was already on the line above.

Not turned into a rule. `session_id` on a prompt is redundant with
`session_log`, and a rule enforcing agreement between two fields where one is
derivable from the other is a rule against a field that should arguably not
exist. Left as a possible simplification, not queued.

## Defect 2 — `PHASE-FACTS-LAYER.md` was written in French

This is a public repository and a published package. Every other prompt in
`docs/plan/sessions/` is in English, as is every document in `docs/`, the
README, and the changelog. `PHASE-FACTS-LAYER.md` — the design spec for the
release that just shipped, and therefore the file a reader arriving from the
0.14.0 changelog is most likely to open — was the single French document in the
tree.

Translated in full, structure preserved: the same sections, the same tables, the
same severities, code blocks byte-identical except for two prose strings inside
the JSON example (`5000 unités incluses`, `console du fournisseur`). No claim
was softened, no scope changed, and the historical framing is intact — it still
reads as a spec drafted against 0.10.0 and refreshed at the close of
`26-07-21-007`.

One line added, not translated: the status banner said `QUEUED` while the
frontmatter says `shipped`. It now says so, and names the release. The banner
was stale in French too.

Scanned the rest of the public tree for the same residue (`docs/`, `README.md`,
`CHANGELOG.md`, `session-logs/`, `templates/`, `skills/`) — nothing else.

## Verification

- 193 tests, 0 failures — unchanged, no source file was touched.
- `casp check` on this repository: 15 PASS, 0 WARN, 0 FAIL before the state bump.
- Published tarball installed from npm into a clean directory and exercised.

## Not queued

`next_phase` and `next_prompt` stay `null`. The one remaining entry in
`phases_queued` is `demand-gated-tail`, a holding placeholder whose own prompt
says it must not be executed as a session: each item inside it needs its own
prompt and its own explicit trigger. Nothing here changes that.
