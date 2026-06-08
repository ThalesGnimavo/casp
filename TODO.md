# CASP — TODO / feature backlog

> Internal idea backlog. The polished, public, version-numbered roadmap lives in
> `README.md` (§ Roadmap). This file is the looser "things worth building"
> list — capture first, prioritize later. Promote an item to the README roadmap
> once it has a target version.

---

## High priority

### Session / task notifications (requested 2026-06-08)

Send a notification when an **important task or session closes** — so the human
(or a watching teammate) hears about a shipped phase without staring at the
terminal. Channels to support:

- **Discord** (webhook URL)
- **Slack** (incoming webhook / bot token)
- **Telegram** (bot token + chat id)
- **WhatsApp via Twilio** (Twilio SID/token + from/to)
- **Facebook / Messenger** (page token)
- **Email** (SMTP, or a transactional provider via API)
- **Generic webhook** (POST the payload anywhere — the escape hatch that covers
  Teams, Mattermost, ntfy, Pushover, etc. without bespoke adapters)

**Hard constraint — do not break the "zero telemetry" promise.** The README sells
CASP on *"no SaaS, zero telemetry, nothing leaves your machine"*. A notification
feature is the first thing that makes an outbound call, so it must be framed and
implemented as **user-owned outbound**:

- **Off by default.** No notifications unless the user explicitly configures a
  channel. A fresh `casp init` still makes zero network calls.
- **The user's own channels only.** Webhooks/tokens point at *their* Discord,
  *their* Slack, *their* Twilio. Nothing ever flows to a CASP-operated
  endpoint. This is the distinction between "user-owned outbound" and "telemetry"
  — document it explicitly so the trust positioning survives.
- **Secrets from env, never committed.** Read tokens from environment variables
  (or a git-ignored `casp/.notify.local.json`). The validator should FAIL if a
  token literal is found committed in `casp/` (reuse the existing
  "uncommitted changes" check infrastructure).
- **Local config, redacted in `status`.** Channel config lives in a single place
  (e.g. `casp/notify.json` for non-secret routing + env for secrets).
  `casp status` must never print a token.

**Shape (proposal — refine before building):**

- `casp notify "message"` — send an ad-hoc message to all configured channels.
- `casp notify --on close` — emit the **session-close payload** built from
  `state.json` + the latest session log: what shipped, the new `next_prompt`,
  any blockers from `roadmap.md`, the `last_commit`. This is the killer use:
  the close notification writes itself from state the agent already maintains.
- Wire it into the close loop *after* `casp check` exits 0 — never notify
  "phase shipped" while the validator still reports drift.
- **Notify on red, too.** `casp check --notify` could fire a channel message
  when a scheduled/CI validation FAILs (drift detected on a cron run) — arguably
  more valuable than the success ping, since that's the failure you'd otherwise
  miss until next morning.
- A **message template** (`casp/templates/notify.md`) so teams control the
  format, consistent with the "templates are gates" philosophy.

**Open questions:** rate-limiting / dedupe (don't double-fire on re-run);
per-channel severity routing (close → Discord, FAIL → Slack+email); whether to
ship channel adapters in core or as optional peer deps to keep the install lean.

---

## Other useful features (unranked)

### Multi-project status (`casp status --all`)
A solo operator running several repos (ZeroSuite = 6+ products) currently runs
`casp status` per repo. `casp status --all <glob>` (or a config list of
project paths) would print a one-screen roll-up: each project's current phase,
next prompt, last commit, and whether `check` is green. The natural companion to
notifications — "where does *everything* stand" in one command.

### `casp timeline` (session history)
Render the shipped history chronologically from `session-logs/` + the
`state.json` `phases_shipped[]` + git dates: a "what shipped, when" digest.
Useful for changelogs, investor updates, and "what did I do last month".

### `casp metrics` (local velocity)
Derive read-only velocity from session-log filenames and git timestamps:
sessions/week, average days between shipped phases, drift-catch count. No
network, no storage — computed on demand. Feeds the multi-project roll-up.

### `casp check --json`
Machine-readable validator output (the categories as structured PASS/WARN/FAIL)
so other tools, CI annotations, or the notification payload can consume results
without scraping ANSI text.

### `casp state diff`
Show how `state.json` evolved between two commits (or HEAD vs working tree):
which phase advanced, what `next_prompt` changed to, migrations added. An audit
trail of the *state*, complementary to git's audit trail of the *code*.

### `casp doctor`
A one-shot environment/setup check: Node version, presence of `casp/`,
`docs/plan/sessions/`, `session-logs/`, whether the skills are installed, whether
notification config parses. Lowers the first-run failure rate.

### Snapshot the close payload to disk
Even with notifications off, writing the structured close payload (what shipped /
next / blockers) to `casp/last-close.json` gives the next session a precise,
machine-readable handoff — and becomes the exact body the notifier would send.

---

## Already on the README roadmap (don't duplicate here)
- 0.3 — Configurable paths
- 0.4 — Native binaries (Python/Rust/Go shops)
- 0.5 — `casp rollback`
- 0.6 — Pre-push git hook installer
- Long-term — `casp lint` (prose-vs-reality via local LLM)
