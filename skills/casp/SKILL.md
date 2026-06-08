---
name: casp
description: |
  Quick state lookups for any CASP-managed project. Answers "where are we?",
  "what's next?", "did the last session close cleanly?". Reads the project's
  casp/ directory if present, falls back to git + package.json + README.
  Subcommands: where, roadmap, changelog, version, ship, stack, status, check, or
  no args = full snapshot.
---

# /casp — state lookups

You are a read-only status reporter. The user invoked `/casp` to get the "where am I" / "what's next" snapshot WITHOUT making you re-read the codebase. Do NOT explore beyond what the subcommand asks for.

## Pre-flight (run once, in parallel)

```bash
pwd
test -d casp && echo "casp:yes" || echo "casp:no"
git rev-parse --short HEAD 2>/dev/null
git rev-parse --abbrev-ref HEAD 2>/dev/null
git status --short
git log --oneline -10
test -f package.json && jq -r '.name + "@" + (.version // "unversioned")' package.json 2>/dev/null
```

## Path A — `casp/` directory present

Prefer the CLI : `npx @justethales/casp status` (or `pnpm casp:status` / `bun casp:status` if the project has wired it). The CLI output is the canonical snapshot — surface it verbatim, don't paraphrase.

If the CLI fails or isn't installed, fall back to reading the casp files directly :

- `cat casp/state.json | jq` — machine state.
- `casp/now.md` — current focus, next-actions-by-budget, don't-get-distracted.
- `casp/roadmap.md` Next-3 — what ships next.

## Path B — no casp/ directory

Degraded mode :
- `git log --oneline -10` — recent activity.
- `cat README.md | head -30` — what the project is.
- Suggest `npx @justethales/casp init` to scaffold.

## Subcommands

| Invocation | Returns |
|---|---|
| `/casp` | Full snapshot (state + next prompt preview + last 10 commits + current focus + Next-3). Same as `npx @justethales/casp status`. |
| `/casp where` | `casp/now.md` — current focus + 15-min next + don't-do list. |
| `/casp roadmap` | `casp/roadmap.md` Next-3 + in-flight + blocked. |
| `/casp changelog` | `git log --oneline -20` + `git log --since='7 days ago' --oneline` count. |
| `/casp version` | `pkg@version` + commit SHA + branch + unpushed count + dirty count + state.json migration count + current_phase. |
| `/casp ship` | Ship-readiness card : working tree, unpushed, blockers (from roadmap), in-flight, verdict line ("safe to push" / "FAIL : <reason>"). Run `npx @justethales/casp check` and fold in its verdict. |
| `/casp stack` | `package.json` runtime deps + scripts + 1-line architecture from `casp/architecture.md` if present. |
| `/casp status` | Synonym for `/casp` (no args). |
| `/casp check` | Run `npx @justethales/casp check` and surface the result (the drift validator — exits 1 on drift). |

## Rules

- **Read-only.** This skill never edits files. If the user wants to edit, suggest the appropriate tool.
- **Surface verbatim.** Don't paraphrase the CLI output. The CLI is the source of truth.
- **No explore.** Don't grep, don't search the codebase. The casp state gives the answer ; trust it.
- **No re-run.** If the user just ran `/casp` 30 seconds ago, the state hasn't meaningfully changed. Don't burn tokens.
- **Honor `pwd`.** Never reach for a sibling project's casp state.

## What `/casp` is NOT

- Not `/next` — casp reports, next acts.
- Not an editor — never bumps state.json or rewrites now.md.
- Not a planner — surfaces the existing plan, doesn't propose new ones.
