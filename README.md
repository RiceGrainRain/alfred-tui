# alfred-tui

A terminal companion for [Claude Code](https://claude.com/claude-code) sessions and plans,
inspired by [Switchboard](https://github.com/doctly/switchboard) — but it runs in your real
terminal via **tmux**, with a keyboard-driven sidebar on the left and the live `claude` session
on the right.

No Electron, no embedded terminal. It reads `~/.claude/projects` directly and shares Switchboard's
SQLite cache (`~/.switchboard/switchboard.db`), so archiving/starring here shows up in Switchboard
and vice versa. It vendors the small set of pure-Node modules that do the data work, so there's no
Electron, `node-pty`, or `xterm` in the dependency tree.

## How it works

```
┌──────────────┬───────────────────────────┐
│ ALFRED       │  claude --resume <id>     │
│ ▾ p/alfred   │                           │
│  ● build-tui │  the real Claude Code     │
│    new sess  │  session runs live here   │
│ ▾ work/psa   │                           │
│    add-epss  │  Ctrl-b ← back to sidebar │
└──────────────┴───────────────────────────┘
   sidebar (Ink)      work pane (swaps)
```

- Run `alfred` and it opens a tmux session with the sidebar (left) and an empty work pane (right).
- Select a session and press **Enter** — `claude --resume <id>` starts in the work pane, in that
  session's project directory, and focus jumps to it. You're now in a normal Claude Code session.
- Press **Ctrl-b ←** (tmux) to jump back to the sidebar. Open another session and the work pane
  **swaps** to it (you'll be asked to confirm if a session is still running there).
- Killing/swapping a session only detaches the CLI — the transcript persists and is re-resumable.

## Features

- Switchboard-style sidebar: project-grouped (with per-group counts), scrollable cards showing
  title, star, relative time, message count, and a green ● live marker on the open session.
- Open any session live in a real terminal pane (Enter).
- Read a session's transcript without leaving the sidebar (v), markdown rendered — no raw syntax.
- Archive / unarchive (a) and star / unstar (s) — both sync with Switchboard.
- Browse `~/.claude/plans/*.md` plan-mode plans plus any project's `plan-tracker.md`/`todos.md`,
  rendered to readable text.

## Requirements

- **tmux** (tested on 3.7) — `brew install tmux`
- **Node ≥ 22** (Ink 7 and better-sqlite3 require it)
- The `claude` CLI on your PATH (for opening sessions live)

## Install

```bash
npm install
npm run build
npm link   # optional: makes `alfred` available globally
```

## Usage

```bash
alfred
```

Run it from a plain shell — it creates/attaches the `alfred` tmux session for you. If you're
already inside tmux, it splits the current window instead (and quitting then leaves your session
intact).

### Keys

**Sidebar (sessions):** `↑`/`↓` (or `k`/`j`) move · `Enter` open live · `v` view transcript ·
`a` archive · `s` star · `/` filter · `A` show archived · `Tab`/`p` plans · `q` quit

**Transcript view:** `↑`/`↓` prev/next turn · `g`/`G` first/last · `o` open live · `q`/`Esc` back

**Plans:** `↑`/`↓` move · `Enter` open · `Tab`/`s` sessions · `q` quit

**Plan detail:** `↑`/`↓` scroll · `space`/`b` page · `g`/`G` top/bottom · `q`/`Esc` back

**tmux:** `Ctrl-b ←` / `Ctrl-b →` move between the sidebar and the work pane.

Quitting with `q` from the sidebar tears down the whole `alfred` tmux session and returns you to
your shell.

## Development

```bash
npm run build   # bundle src/ to dist/ via esbuild
npm test        # node --test
```

For development against fixture data instead of your real sessions/plans, override:

```bash
SWITCHBOARD_DATA_DIR=/tmp/alfred-dev \
ALFRED_TUI_CLAUDE_PROJECTS_DIR=/tmp/alfred-dev-projects \
ALFRED_TUI_CLAUDE_PLANS_DIR=/tmp/alfred-dev-plans \
  npm start
```
