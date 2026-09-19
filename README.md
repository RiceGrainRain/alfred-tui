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

Keyboard: arrow keys / `j` `k` to move, `Enter` to open, `a` to archive/unarchive, `/` to filter,
`Esc` / `q` to go back or quit.

## Development

```bash
npm run build   # bundle src/ to dist/ via esbuild
npm test        # node --test
```
