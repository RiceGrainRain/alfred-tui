# alfred-tui

A minimal terminal companion for browsing and archiving [Claude Code](https://claude.com/claude-code)
sessions and plans — no Electron, no GUI, just a keyboard-driven dashboard in your terminal.

It reads the same session data as [Switchboard](https://github.com/doctly/switchboard) and shares its
SQLite cache (`~/.switchboard/switchboard.db`), so archiving a session here also reflects there, and
vice versa. It does not depend on Switchboard's package — it vendors the small set of pure-Node
modules that do the actual data work, so there's no Electron, `node-pty`, or `xterm` in the dependency
tree.

## Features

- Browse all Claude Code sessions, grouped by project, sorted by last activity
- View a session's transcript without raw markdown syntax cluttering the screen
- Archive / unarchive a session
- Browse all `~/.claude/plans/*.md` plan-mode plans and read them rendered, not raw
- Discover and view any project's `plan-tracker.md`/`todos.md` progress checklist

Sessions and plans are Switchboard's own data — this reads `~/.claude/projects` directly and
shares Switchboard's SQLite cache at `~/.switchboard/switchboard.db`, so archiving here is
also reflected there, and vice versa. Nothing else in Switchboard (Projects/Tracks/Schedules,
its built-in terminal, file browser, stats, auto-update, etc.) is touched or required.

## Install

```bash
npm install
npm run build
npm link   # optional: makes `alfred-tui` available globally
```

## Usage

```bash
alfred-tui
```

Keyboard, session list: `↑`/`k` `↓`/`j` move, `Enter` open, `a` archive/unarchive, `A` toggle
showing archived, `/` filter, `Tab`/`p` switch to Plans, `Esc`/`q` quit.

Keyboard, session detail: `↑`/`k` `↓`/`j` prev/next turn, `g`/`G` first/last turn, `Esc`/`q` back.

Keyboard, plans: `↑`/`k` `↓`/`j` move, `Enter` open, `Tab`/`s` switch to Sessions, `Esc`/`q` quit/back.

## Development

```bash
npm run build   # bundle src/ to dist/ via esbuild
npm test        # node --test
```

Requires Node ≥22 (Ink 7 and better-sqlite3 both require it).

For development against fixture data instead of your real sessions/plans, override:

```bash
SWITCHBOARD_DATA_DIR=/tmp/alfred-tui-dev \
ALFRED_TUI_CLAUDE_PROJECTS_DIR=/tmp/alfred-tui-dev-projects \
ALFRED_TUI_CLAUDE_PLANS_DIR=/tmp/alfred-tui-dev-plans \
  npm start
```
