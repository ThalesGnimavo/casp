---
phase: author-identity
---

# 26-07-21-004 — Author identity on the public surfaces (metadata only, no code)

## What changed

Two public-facing surfaces gain a consistent author identity, aligned with
`justegnimavo.com` (title: **Chief AI-Augmented Architect**).

- **`package.json`** — `author` converted from a bare string to the structured
  `{ name, url }` form. npmjs.com renders that as a **clickable link** on the
  package page; a plain string is inert text. One line, and it is the highest-
  leverage change of the two.
- **`README.md`** — the existing "Built by" credit now carries the title, the
  primary link (`justegnimavo.com`), and the location, with the
  `thalesandhisaictoclaude.com` reference kept as the secondary "documented in
  the open" pointer rather than the primary destination.

## What was deliberately NOT changed

- **The README's opening paragraph and the wedge.** The first line of a package
  README is what a developer reads to decide whether to install. Product first,
  author second — reversing that costs installs.
- **No other ZeroSuite product is named.** This is a **public** repo, and the
  established pattern here is "seven production products" without enumeration,
  with the portfolio living behind the author link. Naming them would be exactly
  the portfolio linkage `CLAUDE.md` §3 keeps out of this repository.
- **No new claim.** Every fact in the credit line already appears in the site's
  `llms.txt` author block; this is alignment, not invention. No superlatives.

## Reachability caveat

**The npm package page does not update until the next publish.** `README.md` and
`package.json` are baked into the published tarball, so this credit reaches
npmjs.com when the next version ships (facts-layer), not before. GitHub shows it
immediately. A patch publish purely for a README change is available but wasteful;
riding the next release is the default.

## Verify

- `npm test` — 121/121 pass. Nothing in the binary reads `author`
  (`casp version --json` sources `name`/`version`), so the structured form is inert
  to behaviour — confirmed by the suite rather than assumed.
- `npm run build` clean, `casp check` 0.

## Deferred

- **The site footer credit** is not done here: it would touch all 18 homepages plus
  `roadmap.html`, and it needs a decision on whether the credit line is translated
  or stays English. Folded into Phase 19, which already sweeps every root HTML file
  for head/nav parity — nearly free there, a separate 19-file pass otherwise.
