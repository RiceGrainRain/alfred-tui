#!/bin/sh
# Regenerate the README demo GIF + screenshots from fake data.
# Needs vhs, ffmpeg and tmux (`brew install vhs tmux`).
set -e
cd "$(dirname "$0")/../.."
export ALFRED_DEMO_ROOT=/tmp/alfred-demo   # demo.tape hardcodes this path
npm run build >/dev/null
node docs/demo/make-fixtures.mjs "$ALFRED_DEMO_ROOT" >/dev/null
docs/demo/env.sh tmux kill-server 2>/dev/null || true
vhs -q docs/demo/demo.tape
docs/demo/env.sh tmux kill-server 2>/dev/null || true
node docs/demo/assemble.mjs "$ALFRED_DEMO_ROOT/frames" docs
