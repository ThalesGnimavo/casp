---
phase: readme-five-screens
---

# 26-07-21-013 — the README leads with five screens of real output

Documentation and assets. No source change; 195 tests unchanged.

## The problem

The README was 402 lines of accurate content in a shape that only works on a
reader who is already convinced. Roughly 1.1k installs a month against zero
stars is not a product signal — people install it and leave without being
persuaded enough to say so. Nothing in the document showed the tool working
until the reader had scrolled past a wall of prose.

## What changed

Five screens now sit above everything else, each one problem sentence and one
image:

1. the gate blocking a push whose state file lies;
2. the queue handing over the next slice — and refusing one that already shipped;
3. the plan checked as an *executable plan*, not a list;
4. the one-screen status, with the roadmap scoreboard beside it;
5. a declared number that stopped being verified.

Nothing was deleted. The original 402 lines are still there, below the point
where a reader actually wants them. The queue and the facts layer — the two
halves people never discovered — are now unmissable rather than buried at §00
and in the command table.

## The assets, and why the script matters more than the images

Six screenshots, real output byte for byte, captured on the **published** 0.14.1
against a demo cockpit whose queue and history are genuinely chained. No mockups,
no AI-generated terminals, nothing retouched — `CASP-SCREENSHOTS-GUIDE.md` is
absolute on this and the product reason is stronger than the rule: a README whose
screenshots are generated, for a tool whose entire claim is *prove it against
reality*, refutes itself the first time somebody runs the command and sees a
different screen.

They are produced by `docs/img/capture-readme-shots.sh`, committed, which
**refuses to run unless `casp --version` matches the release it documents**. A
screenshot taken on an older binary is a stale claim inside the one document
arguing that stale claims are the problem. The guard is what stops that being a
matter of anyone remembering.

Optimisation is inside the same script — 20.7 MB of retina PNGs down to 272 KB,
a 60× reduction at 1600 px and 64 colours, visually identical because terminal
output has almost no palette. It lives in the script rather than in a habit for
the same reason the version guard does: a manual step is the one skipped on the
release where it mattered.

Images are referenced by absolute `raw.githubusercontent.com` URL rather than
hosted on the project's own site. GitHub proxies README images, npm does not — so
site-hosted images would mean every visit to the npm page hitting a host this
project runs, which sits badly beside "nothing leaves your machine". This way no
request reaches any host we operate.

The README states the capture version (`0.14.1`) rather than saying "the current
version". A checkable claim that can go stale beats a vague one that can never be
wrong, given something exists to stop it going stale.

## Two standing canon violations fixed

Pre-existing, not introduced here: *"the one gap **nothing else** covers"* and
*"(this is the gap **nothing else** fills)"*. The positioning canon rules out the
only/first/best family — the wedge is stated as a fact (validation versus storage,
deterministic versus probabilistic), never as a superiority claim. Both rewritten.

## What this session also produced

`casp check`'s orphan-storm fix (0.14.1, session 012) came out of this work: the
first attempt at the gate screenshot returned three warnings that were correct
about the walk and wrong about the repository. Capturing the product honestly is
what found the defect — the same way 0.13.0's chain bug surfaced.

## Not queued

`next_phase` / `next_prompt` stay `null`.
