# Records raw frames of alfred running on fake fixture data; assemble.mjs
# turns them into docs/demo.gif + docs/*.png. Run via docs/demo/record.sh.
#
# Screenshots are taken from the frames: every "Sleep 3s" is a still point
# (sessions, transcript, plans, git+nvim — in that order), and every other pause
# must stay under 2.5s so assemble.mjs can tell them apart.
Output "/tmp/alfred-demo/frames/"

Require tmux
Set Shell zsh
Set FontFamily "JetBrains Mono"
Set FontSize 15
Set Width 1500
Set Height 860
Set Padding 8
Set Theme { "name": "Monokai Pro", "black": "#2d2a2e", "red": "#ff6188", "green": "#a9dc76", "yellow": "#ffd866", "blue": "#fc9867", "magenta": "#ab9df2", "cyan": "#78dce8", "white": "#fcfcfa", "brightBlack": "#727072", "brightRed": "#ff6188", "brightGreen": "#a9dc76", "brightYellow": "#ffd866", "brightBlue": "#fc9867", "brightMagenta": "#ab9df2", "brightCyan": "#78dce8", "brightWhite": "#fcfcfa", "background": "#2d2a2e", "foreground": "#fcfcfa", "cursor": "#c1c0c0", "selection": "#5b595c" }
Set TypingSpeed 60ms
Set Framerate 25

Hide
Type "exec docs/demo/env.sh zsh -i" Enter
Sleep 1s
Type "clear" Enter
Sleep 500ms
Show

Type "alfred" Sleep 400ms Enter
Sleep 2s

# Open the most recent session live in a work tab, then hop back to the sidebar.
Enter
Sleep 2s
Ctrl+b Left
Sleep 3s

# Read a transcript without leaving the sidebar.
Down Sleep 400ms Down Sleep 400ms Up Sleep 400ms Up Sleep 400ms
Type "v"
Sleep 1.5s
Down
Sleep 3s
Down Sleep 1.5s Down Sleep 1.5s
Type "q"
Sleep 800ms

# Plans tab.
Tab
Sleep 3s
Enter
Sleep 2s
Type "q"
Sleep 800ms

# Git tab: open a changed file in an nvim work tab, then back to the sidebar.
Tab
Sleep 1.5s
Right
Sleep 600ms
Enter
Sleep 2s
Ctrl+b Left
Sleep 3s

# Switch back to the claude tab, peek at the directory tree, quit.
Type "1"
Sleep 1.5s
Type "e"
Sleep 2s
Type "2"
Sleep 1.5s
Type "q"
Sleep 1s
