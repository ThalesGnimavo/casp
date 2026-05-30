---
name: cockpit
description: |
  Quick KPI lookups for any cockpit-managed project. Answers "where are we?",
  "what's next?", "did the last session close cleanly?". Reads the project's
  cockpit/ directory if present, falls back to git + package.json + README.
  Subcommands: where, roadmap, changelog, version, ship, stack, status, check, or
  no args = full snapshot.
---

# /cockpit — KPI lookups

You are a read-only status reporter. The user invoked `/cockpit` to get the "where am I" / "what's next" snapshot WITHOUT making you re-read the codebase. Do NOT explore beyond what the subcommand asks for.

## Pre-flight (run once, in parallel)

```bash
pwd
test -d cockpit && echo "cockpit:yes" || echo "cockpit:no"
git rev-parse --short HEAD 2>/dev/null
git rev-parse --abbrev-ref HEAD 2>/dev/null
git status --short
git log --oneline -10
test -f package.json && jq -r '.name + "@" + (.version // "unversioned")' package.json 2>/dev/null
```

## Path A — `cockpit/` directory present

Prefer the CLI : `npx cockpit status` (or `pnpm cockpit:status` / `bun cockpit:status` if the project has wired it). The CLI output is the canonical snapshot — surface it verbatim, don't paraphrase.

If the CLI fails or isn't installed, fall back to reading the cockpit files directly :

- `cat cockpit/state.json | jq` — machine state.
- `cockpit/now.md` — current focus, next-actions-by-budget, don't-get-distracted.
- `cockpit/roadmap.md` Next-3 — what ships next.

## Path B — no cockpit/ directory

Degraded mode :
- `git log --oneline -10` — recent activity.
- `cat README.md | head -30` — what the project is.
- Suggest `npx cockpit init` to scaffold.

## Subcommands

| Invocation | Returns |
|---|---|
| `/cockpit` | Full snapshot (state + next prompt preview + last 10 commits + current focus + Next-3). Same as `npx cockpit status`. |
| `/cockpit where` | `cockpit/now.md` — current focus + 15-min next + don't-do list. |
| `/cockpit roadmap` | `cockpit/roadmap.md` Next-3 + in-flight + blocked. |
| `/cockpit changelog` | `git log --oneline -20` + `git log --since='7 days ago' --oneline` count. |
| `/cockpit version` | `pkg@version` + commit SHA + branch + unpushed count + dirty count + state.json migration count + current_phase. |
| `/cockpit ship` | Ship-readiness card : working tree, unpushed, blockers (from roadmap), in-flight, verdict line ("safe to push" / "FAIL : <reason>"). |
| `/cockpit stack` | `package.json` runtime deps + scripts + 1-line architecture from `cockpit/architecture.md` if present. |
| `/cockpit status` | Synonym for `/cockpit` (no args). |
| `/cockpit check` | Run `npx cockpit check` and surface the result. |

## Rules

- **Read-only.** This skill never edits files. If the user wants to edit, suggest the appropriate tool.
- **Surface verbatim.** Don't paraphrase the CLI output. The CLI is the source of truth.
- **No explore.** Don't grep, don't search the codebase. The cockpit gives the answer ; trust it.
- **No re-run.** If the user just ran `/cockpit` 30 seconds ago, the state hasn't meaningfully changed. Don't burn tokens.
- **Honor `pwd`.** Never reach for a sibling project's cockpit.

## What `/cockpit` is NOT

- Not `/next` — cockpit reports, next acts.
- Not an editor — never bumps state.json or rewrites now.md.
- Not a planner — surfaces the existing plan, doesn't propose new ones.
