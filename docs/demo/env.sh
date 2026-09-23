#!/bin/sh
# Run a command against the demo fixtures only: fake HOME (so ~/.claude,
# ~/.alfred, tmux/zsh config all come from the fixture dir) and a private tmux
# server, so an `alfred` session you already have running is never touched.
R="${ALFRED_DEMO_ROOT:-/tmp/alfred-demo}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$R/tmux" "$R/bin"
ln -sf "$REPO/bin/alfred.js" "$R/bin/alfred"
exec env -i \
  HOME="$R/home" ZDOTDIR="$R/home" USER=demo LOGNAME=demo \
  PATH="$R/bin:$(dirname "$(command -v node)"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" \
  TERM="${TERM:-xterm-256color}" LANG=en_US.UTF-8 SHELL=/bin/zsh \
  TMUX_TMPDIR="$R/tmux" ALFRED_EDITOR=nvim \
  "$@"
