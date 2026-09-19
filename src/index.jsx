import { inTmux, bootstrap } from './tmux.js';

// Outside tmux: create/attach the alfred session and hand the terminal to
// tmux. Only when we're inside a pane do we load the DB + Ink and render the
// sidebar — so the throwaway bootstrap process never opens the database.
if (!inTmux()) {
  bootstrap();
  process.exit(0);
}

const [{ default: React }, { render }, { default: App }] = await Promise.all([
  import('react'),
  import('ink'),
  import('./App.jsx'),
]);

render(React.createElement(App));
