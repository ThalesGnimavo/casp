---
status: shipped
session_id: pending
session_log: session-logs/26-06-17-003-casp-help.md
drafted_at: 2026-06-17
next_after: 26-06-17-002-0-6-0-bundle
---

# Session — casp-help : `casp help` + per-command help

> **Status: QUEUED.** Tooling ergonomics (no protocol change, no LLM, no
> telemetry). CEO-proposed 2026-06-17. Fixes a papercut and adds command
> discoverability.
>
> **Goal.** `casp help` is first-class (exit 0); `casp help <command>` and
> `casp <command> --help` print a focused per-command block.

**Project root.** `/Users/juste/ZeroSuite/casp-sh/casp-core`
**Expected size.** Half a session. No schema change. Minor version bump (new command).

## CONTEXT — what exists today
- `casp`, `casp -h`, `casp --help` print the global help block (exit 0).
- **`casp help` → "unknown command: help" + exit 1** (papercut — most natural thing a user types).
- `casp <command> --help` prints the *generic* block, not command-specific. No per-command help exists.

## MUST HAVE
1. `casp help` → alias for the top-level help, **exit 0**.
2. `casp help <command>` AND `casp <command> --help` → a focused per-command block:
   one-line "why it exists", usage, every flag, 1-2 real examples. Cover every verb
   (init / status / check / next / new / ship / close / install-hook / verify /
   state / help).
3. Top-level help gains a short **"how the loop works"** section:
   `init → status → (work) → check → ship/close → push` — the mental model,
   ~4-5 lines, no prose wall.
4. `casp help <bogus>` → graceful ("no such command", list valid ones, exit 1).
5. README help section + CHANGELOG + version bump.
6. Tests: `casp help` exit 0; `casp help check` is check-specific; `casp check --help`
   matches it; `casp help bogus` exits 1.

## DO NOT
- Do NOT bake the full positioning/pitch into the binary — keep "what is CASP" to
  one tight paragraph + a pointer to casp.sh. The binary ships a frozen snapshot;
  the site stays current. CLI help is usage-focused, not marketing.
- Do NOT add an LLM, telemetry, or any network call.
- Keep command names / PASS-WARN-FAIL output / install line verbatim English.

## AT END
Canonical close loop: technical-only session log (public repo — see CLAUDE.md §3),
ship this prompt, state bump, `casp check` green, push (justethales dance). Draft
the successor prompt.
