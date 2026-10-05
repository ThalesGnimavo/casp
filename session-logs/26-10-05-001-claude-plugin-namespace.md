# 26-10-05-001 — The Claude Code skills ship as the `casp` plugin

Packaging change, built as 0.19.0 (not published in this session).

## The defect

The README told users to copy each skill flat into `~/.claude/skills/`. A flat copy is a
personal skill with no namespace. Claude Code ranks personal skills above project ones and
lets a skill replace a built-in command of the same name, so a flat `/next` shadowed every
other `/next` on the machine — another author's, a project's, and a native one the day it
ships. A prefix such as `casp-next` would only be a convention; a plugin namespace is the
mechanism Claude Code guarantees.

## The change

- `claude-plugin/` at the repository root is exactly the folder a user copies to
  `~/.claude/skills/casp`: `.claude-plugin/plugin.json` (name `casp`), the root `SKILL.md`
  (the former `skills/casp`), and `skills/{next,fleet,audit-batch}/SKILL.md`. Claude Code
  loads it in place as `casp@skills-dir`, with no marketplace and no install step.
- Commands: `/casp` (root skill), `/casp:next`, `/casp:fleet`, `/casp:audit-batch`.
  Cross-references inside the skills, `casp help audit` and source comments use the new
  names. CLI invocations are untouched; frontmatter `name` stays short.
- `package.json` `files`: `skills` → `claude-plugin`. The flat `skills/` folder is removed.
- `plugin.json` `version` = package version: `scripts/sync-plugin-version.mjs` runs as the
  npm `version` lifecycle script, and `--check` runs in `prepublishOnly`.
- `casp doctor` gains `skills.legacy_flat` (WARN) and `skills.plugin_version` (PASS/WARN),
  reading `$CLAUDE_CONFIG_DIR/skills` or `~/.claude/skills`. Read-only, silent when neither
  applies, never FAIL. `check` gains no rule.
- README "In your editor": one install line per system (POSIX `cp -R`, PowerShell
  `Copy-Item`), update and migration paragraphs, the reason for the namespace.

## Decision: `/casp` keeps its name

Tested before choosing (Claude Code 2.1.289). With the plugin copied under a skills
directory, one headless session's init event lists `casp`, `casp:audit-batch`, `casp:fleet`
and `casp:next` together. The root skill takes its name from the folder, not from the
frontmatter: a copy under another folder name registered under that folder name. The
README's install line names the folder `casp`.

## Proof

- `claude plugin validate ./claude-plugin` → `✔ Validation passed`.
- `npm pack --dry-run` → `claude-plugin/.claude-plugin/plugin.json`, `claude-plugin/SKILL.md`
  and the three `claude-plugin/skills/*/SKILL.md`; no root `skills/` entry; `version: 0.19.0`.
- 2026-10-05T13:48:23Z, on a machine whose personal skills directory also holds unrelated
  skills named `next` and `casp`: `claude plugin list` → `casp@skills-dir`, `Version: 0.19.0`,
  `Status: ✔ loaded`; `/casp:next` loaded the plugin's text (first heading
  `# /casp:next — Start the next implementation session`), not the personal `/next`.
- Windows: `Proof due: Copy-Item run once and casp@skills-dir loaded — on a real Windows
  machine — blocked by no Windows machine available to the session.`

## Tests

262 → 274. New `test/claude-plugin.test.mjs`: layout, manifest name and version equality,
`files`, short frontmatter names, no flat slash reference left, and seven `doctor` cases
isolated through `CLAUDE_CONFIG_DIR` (no directory, current plugin, stale plugin, flat
copies, quoted CRLF frontmatter, a same-named user skill left alone, the new plugin never
taken for a flat copy).

## Audit

Post-implementation audit, verdict GO-WITH-FIXES. Edge cases probed against the built
binary with `CLAUDE_CONFIG_DIR`: `plugin.json` as `null`, an array or a number, `SKILL.md`
and `plugin.json` as directories, unreadable files, `HOME` unset — `doctor` exits 0 in each.
Fixed in session: `casp audit status` still printed `/audit-batch`; `casp help doctor`
did not mention the probes; the stale-plugin detail hard-coded `~/.claude/skills` instead
of the resolved directory; quoted frontmatter values were not recognised; the 0.1.0
`cockpit` skill was missing from the legacy list; the sync script reported success on a
manifest without a `version` key; the README did not say that `cp -R` onto an existing
folder nests the copy.

## Deferred / risks

- The casp.sh pages and presentation material still name `/next`; they change after 0.19.0
  is on npm, so no public page describes a command no installed package provides.
- Marketplace distribution (`marketplace.json` with an `npm` source) is out of this slice.
- Legacy detection matches the description openings of every shipped release; a user's fork
  that keeps the original opening is reported too, which is accurate: it shadows the same way.
