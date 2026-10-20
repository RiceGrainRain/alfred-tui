import fs from 'fs';
import path from 'path';
import { inTmux, bootstrap } from './tmux.js';

// Fail loudly up front: without these, bootstrap's best-effort tmux calls
// would just exit silently.
const onPath = cmd => (process.env.PATH || '').split(path.delimiter).some(dir => {
  try { fs.accessSync(path.join(dir, cmd), fs.constants.X_OK); return true; } catch { return false; }
});
const missing = ['tmux', 'claude'].filter(cmd => !onPath(cmd));
if (missing.length) {
  console.error(`alfred: ${missing.join(' and ')} not found on PATH — see https://github.com/RiceGrainRain/alfred-tui#requirements`);
  process.exit(1);
}

// Outside tmux: create/attach the alfred session and hand the terminal to
// tmux. Only when we're inside a pane do we load the DB + Ink and render the
// sidebar — so the throwaway bootstrap process never opens the database.
if (!inTmux()) {
  bootstrap();
  process.exit(0);
}

const [{ default: React }, { render }, { default: App }, { enableMouse }] = await Promise.all([
  import('react'),
  import('ink'),
  import('./App.jsx'),
  import('./mouse.js'),
]);

enableMouse();
// Alternate screen: frames stay anchored at row 1 (mouse row maps depend on
// it) and tmux never reflows old frames when the pane is resized/zoomed.
render(React.createElement(App), { alternateScreen: true });
