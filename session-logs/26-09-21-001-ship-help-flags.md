# 26-09-21-001 — `casp ship --help` names `--log` and `--prompt`

Documentation session. No behaviour change.

`ship.ts` has read two flags since the close loop shipped in 0.4 — `--log <session-id>`
(the log to wire into the shipped prompt, default `state.last_session_id`) and
`--prompt <path>` (the prompt file to flip, default the sessions-dir entry matching the
slug). Neither appeared in `casp ship --help`; `help.ts` listed `casp ship <slug>` and one
example. Both are now in `usage`, `flags` and `examples`.

## Why the default for `--log` deserves its own words in the help

Measured on a scratch cockpit scaffolded by `casp init` 0.18.0, in the order an operator
closes a session:

```
casp ship <slug>                # last_session_id still 'pending'
  → exit 1 · no session-log id to wire into the shipped prompt
casp ship <slug>                # last_session_id = the PREVIOUS session's log
  → exit 0 · session_log wired to the previous session's log
casp check
  → PASS  every shipped prompt has a session_log pointer
```

The second case is the one to know: `close` bumps `last_session_id` and `ship` reads it,
so `ship` before `close` wires the wrong log, and the pointer rule only checks that the
file exists. The flag's help text now says the default is stale at close time and to name
the log. `ship` and `close` do not move `current_phase`, `next_phase` or `next_prompt`;
`close` exits 1 while `next_prompt` still points at the prompt just shipped
(`CASP-PROMPT-003`) and 0 once the pointers have moved — also measured, unchanged, and
documented where the closing sequence is written rather than here.

## Verification

```
npm test        → build + 256 tests, 0 fail
node dist/cli.js ship --help
  casp ship <slug> [--log <session-id>] [--prompt <path>]
  --log <session-id>   Session log to wire (default: state.last_session_id — stale at close time, so name it)
  --prompt <path>      Prompt file to flip (default: the sessions dir entry matching the slug)
```

Not published. `CHANGELOG.md` carries an Unreleased entry.
