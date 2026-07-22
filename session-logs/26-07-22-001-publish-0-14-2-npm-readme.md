---
phase: 0.14.2-npm-readme-refresh
---

# 26-07-22-001 — publish 0.14.2 to refresh the npm README

Documentation-only release. `dist/` is byte-identical to 0.14.1; nothing in the
binary changed.

## Why a release at all

npm only updates the README shown on a package's page when a new version is
published. The five-screen README rewrite (commit `63bbb7a`) landed on GitHub
after 0.14.1 was already out, so the npm page — where the weekly installs
actually land — was still serving the old wall-of-prose README. 0.14.2 exists to
carry the new one across.

## Why the "captured on 0.14.1" line stays

The README says the screenshots were captured on 0.14.1, and that stays true:
0.14.2 produces byte-identical output, so the images are not stale. Rewriting the
line to 0.14.2 would have been the lie — the captures were taken on 0.14.1, and a
version number in a caption is a claim like any other.

## Accepted side effect

`docs/img/capture-readme-shots.sh` pins `VERSION="0.14.1"` and will now refuse to
run on a 0.14.2 machine until that constant is bumped deliberately. That is too
strict in the letter and correct in the spirit: it fails on the safe side —
refusing rather than emitting a screenshot that might not match — and the
deliberate bump is exactly the conscious act you want before a recapture.

## Verification

- `npm view @justethales/casp dist-tags` → `latest: 0.14.2`.
- `npm view @justethales/casp readme` returns the "What it does, in five screens"
  rewrite, confirming the page updated.
- 195 tests green, unchanged.

## Not queued

`next_phase` / `next_prompt` stay `null`. The npm token used in this session was
exposed in cleartext and must be revoked.
