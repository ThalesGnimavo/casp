# 26-06-16-001 — 0.4.2: `check --all <absolute path>` fix

## What shipped
- `casp check --all <absolute path>` no longer doubles the path. The optional
  root argument was `join`ed onto the cwd unconditionally, so an absolute root
  became `<cwd>/<abs>` and reported "no cockpit found". It now `resolve()`s the
  argument: absolute roots are used as-is, relative roots still resolve against
  the cwd, the no-arg form is unchanged.

## Tests
- One new regression test. Suite green.
