// Color themes, picked with ALFRED_THEME (default: gruvbox).
//
// Components only ever name ANSI colors (`C.cyan`, `C.gray`, …). A theme maps
// those names to hex values the way a terminal color scheme does, so the
// `terminal` theme — every name left as itself — renders in whatever palette
// the terminal already has. `tmux` styles apply to alfred's own session only
// (see setupSessionUi), like the rest of its tmux setup.

const ANSI = ['black', 'red', 'green', 'yellow', 'blue', 'blueBright', 'magenta', 'cyan', 'white', 'gray'];

const THEMES = {
  terminal: { colors: {}, tmux: null },

  // https://github.com/morhetz/gruvbox — dark, using the bright accents.
  gruvbox: {
    colors: {
      black: '#282828', // bg: text on colored badges
      red: '#fb4934',
      green: '#b8bb26',
      yellow: '#fabd2f',
      blue: '#458588',
      blueBright: '#83a598',
      magenta: '#d3869b',
      cyan: '#8ec07c', // aqua: the selection accent
      white: '#fbf1c7',
      gray: '#7c6f64', // bg4: readable as dim text and as a tab background
    },
    tmux: {
      session: {
        'status-style': 'bg=#3c3836,fg=#a89984',
        'window-status-current-style': 'bg=#fabd2f,fg=#282828,bold',
        'message-style': 'bg=#504945,fg=#ebdbb2',
      },
      window: {
        'pane-border-style': 'fg=#504945',
        'pane-active-border-style': 'fg=#fabd2f',
      },
    },
  },
};

const theme = THEMES[process.env.ALFRED_THEME] || THEMES.gruvbox;

/** Ink color for each ANSI name under the active theme. */
const C = Object.fromEntries(ANSI.map(name => [name, theme.colors[name] || name]));

export { C, theme, THEMES };
