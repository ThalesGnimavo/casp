#!/usr/bin/env bash
# Capture the six README stepper images from a real cockpit. Real outputs only,
# byte-for-byte — never a mockup, never an AI-generated terminal.
#
#   ./capture-readme-shots.sh /path/to/a-green-demo-repo
#
# Prereqs:
#   npm i -g @justethales/casp        # `casp --version` must equal VERSION below
#   brew install charmbracelet/tap/freeze
#
# RE-RUN THIS ON EVERY RELEASE THAT CHANGES `check` OUTPUT. A README screenshot
# taken on an older binary is a stale claim in the one document that argues stale
# claims are the problem — the exact failure this product exists to catch.
set -euo pipefail

VERSION="0.14.1"

REPO="${1:?usage: capture-readme-shots.sh <demo-repo-path>}"
OUT="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO"

[ "$(casp --version)" = "$VERSION" ] || {
  echo "casp is $(casp --version), expected $VERSION — the shots would not match the release"; exit 1;
}

# Every green shot is only green if the repo STARTS green. Assert it; never assume.
# A leftover drift from a manual experiment silently turns a "hands over" shot into
# a second refusal shot, and a backup taken afterwards then preserves the drift.
casp check --quiet || { echo "demo repo is NOT green — reconcile it before capturing"; exit 1; }

FREEZE=(freeze --window -p 30,50 -m 20 -r 8 --shadow.blur 24 --shadow.y 10 --font.size 24)

# freeze refuses to write when the command exits non-zero, and the best shots are
# exactly those. Route every command through a wrapper that forces a clean exit.
shot () { # shot <outfile> <command...>
  local out="$1"; shift
  printf '%s 2>&1\nexit 0\n' "$*" > /tmp/casp-readme-shot.sh
  chmod +x /tmp/casp-readme-shot.sh
  "${FREEZE[@]}" -x "bash /tmp/casp-readme-shot.sh" -o "$OUT/$out"
  echo "  wrote $out"
}

# Restore the cockpit to its committed state whatever happens, so a failed run
# never leaves the demo repo drifted for the next one.
START_SHA="$(git rev-parse HEAD)"
restore () { git reset -q --hard "$START_SHA"; git clean -qfd config 2>/dev/null || true; }
trap restore EXIT

echo "Capturing $VERSION shots against $REPO"

# --- 2 · the queue hands over, and 4 · the one screen (green state) ------------
shot 02-queue-hands-over.png "casp next"
shot 04-status.png           "casp status"

# A drift must be COMMITTED before it is shot: a hand-edited-but-uncommitted state
# adds a CASP-WORKTREE-001 WARN that distracts from the finding the shot is about,
# and a drift of this kind arrives committed in real life anyway. Carry last_commit
# forward with a SECOND, state-surface-only commit so CASP-GIT-001 does not fire
# too. Never --amend: amending rewrites the sha just recorded, so last_commit ends
# up pointing at a commit that is no longer HEAD — the exact WARN just removed.
bump_and_commit () { # bump_and_commit <message>
  git add -A >/dev/null
  git commit -q -m "$1"
  python3 - <<'PY'
import json,pathlib,collections,subprocess
h=subprocess.run(['git','rev-parse','--short','HEAD'],capture_output=True,text=True).stdout.strip()
p=pathlib.Path('casp/state.json')
s=json.loads(p.read_text(),object_pairs_hook=collections.OrderedDict)
s['last_commit']=h
p.write_text(json.dumps(s,indent=2)+'\n')
PY
  git add casp/state.json >/dev/null
  git commit -q -m "chore(casp): bump last_commit (state surface only)"
}

# --- 1 · the gate, and 2b · the refusal --------------------------------------
# next_prompt points at a slice that already shipped: the re-do-last-week's-work bug.
python3 - <<'PY'
import json,pathlib,collections
p=pathlib.Path('casp/state.json')
s=json.loads(p.read_text(),object_pairs_hook=collections.OrderedDict)
s['next_prompt']='docs/plan/sessions/PHASE-14-ANALYTICS-DASHBOARD.md'
s['next_phase']='14-analytics-dashboard'
p.write_text(json.dumps(s,indent=2)+'\n')
PY
bump_and_commit "chore(casp): point at the next slice"
# --quiet on the gate shot: the full report opens with ~26 PASS lines, and a wall
# of green above the one red line is exactly how a reader misses the point. The
# flag is real and documented (CI-friendly), so the shot stays an honest output.
shot 01-gate.png            "casp check --quiet"
shot 02b-queue-refuses.png  "casp next"
restore

# --- 3 · the plan is checked as a plan ---------------------------------------
# A queued prompt declares a predecessor that resolves to nothing: the plan is
# unexecutable as written, so it FAILs rather than warns.
python3 - <<'PY'
import pathlib,re
p=pathlib.Path('docs/plan/sessions/PHASE-17-BILLING-SEATS.md')
t=p.read_text()
p.write_text(re.sub(r'^next_after: .*$','next_after: phase-16-usage-metering',t,count=1,flags=re.M))
PY
bump_and_commit "demo: chain phase 17 onto the metering slice"
shot 03-plan-checked.png "casp check"
restore

# --- 5 · a number that stopped being verified --------------------------------
# The provider migrated and the config changed under a value derived from it —
# the founding case for the facts layer.
python3 - <<'PY'
import json,pathlib,collections
p=pathlib.Path('config/pricing.json')
c=json.loads(p.read_text(),object_pairs_hook=collections.OrderedDict)
c['providers']['current']='fastedge'
c['providers']['fastedge']=collections.OrderedDict(
    [('egress_usd_per_gb',0.021),('transcode_usd_per_stream_hour',0.011)])
p.write_text(json.dumps(c,indent=2)+'\n')
PY
bump_and_commit "config: migrate transcoding to fastedge"
# `fact list` rather than `fact check`: the check line carries both sha256 digests
# in full, which makes one ~200-character line, which makes the whole frame
# unreadable once it is scaled down to README width. `list` shows the same verdict
# next to a fact that is still fresh, which is the contrast worth seeing anyway.
shot 05-fact-stale.png "casp fact list"
restore

# --- optimise -----------------------------------------------------------------
# freeze writes a retina-scale PNG — 7000-11000 px wide, 1-7 MB each. Unoptimised
# that is ~25 MB of images on a README page, which every visitor downloads.
# Terminal output has a tiny palette, so a 64-colour quantisation at 1600 px is
# visually identical and about 60x smaller. This step is IN the script on purpose:
# done by hand it would be skipped on the release where it mattered.
command -v magick >/dev/null || { echo "magick (ImageMagick) not found — images left unoptimised"; exit 0; }
echo "Optimising"
for f in "$OUT"/*.png; do
  before=$(stat -f%z "$f")
  magick "$f" -resize 1600x -strip -colors 64 -define png:compression-level=9 "$f"
  after=$(stat -f%z "$f")
  printf "  %-26s %6s KB -> %4s KB\n" "$(basename "$f")" "$((before/1024))" "$((after/1024))"
done

echo "Done. Six shots in $OUT; demo repo restored to $START_SHA."
