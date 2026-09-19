// tmux orchestration. alfred runs as a sidebar in the left pane of a tmux
// window; opening a session runs a live `claude` in the right "work" pane.
//
// Every tmux call is best-effort: tmux exits non-zero on ordinary events
// (a client detaching, a killed session), which is not an error for us, so
// helpers swallow failures and return sensible fallbacks rather than throw.
import { execFileSync } from 'child_process';
import path from 'path';

const SESSION = 'alfred';
const WORK_PANE_OPT = '@alfred_work_pane';

function tmux(args, { capture = false } = {}) {
  return execFileSync('tmux', args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'ignore'] : 'inherit',
  });
}

function tmuxCapture(args) {
  try {
    return tmux(args, { capture: true }).trim();
  } catch {
    return '';
  }
}

function tmuxQuiet(args) {
  try {
    execFileSync('tmux', args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Are we running inside a tmux pane? */
function inTmux() {
  return !!process.env.TMUX;
}

/** Did our launcher create the tmux session (vs. running inside the user's own)? */
function ownsSession() {
  return process.env.ALFRED_OWNS_TMUX === '1';
}

/** The pane alfred's sidebar is rendering in. */
function selfPaneId() {
  return process.env.TMUX_PANE || '';
}

function sessionExists(name) {
  return tmuxQuiet(['has-session', '-t', name]);
}

/**
 * Outside-tmux entry: create (or re-attach to) the dedicated `alfred` session,
 * whose pane-0 command re-invokes this launcher so it lands inside tmux and
 * renders the sidebar. Blocks until the tmux client detaches.
 */
function bootstrap() {
  try {
    if (sessionExists(SESSION)) {
      tmux(['attach', '-t', SESSION]);
      return;
    }
    const node = JSON.stringify(process.execPath);
    const script = JSON.stringify(path.resolve(process.argv[1]));
    const cmd = `ALFRED_OWNS_TMUX=1 exec ${node} ${script}`;
    tmux(['new-session', '-s', SESSION, cmd]);
  } catch {
    // Normal on detach / session kill.
  }
}

/**
 * Ensure the right-hand work pane exists and return its id. Stored in a tmux
 * session option so it survives sidebar re-renders and can be re-validated.
 */
function ensureWorkPane() {
  const stored = tmuxCapture(['show-options', '-v', WORK_PANE_OPT]);
  if (stored) {
    const panes = tmuxCapture(['list-panes', '-a', '-F', '#{pane_id}']).split('\n');
    if (panes.includes(stored)) return stored;
  }
  const self = selfPaneId();
  const target = self ? ['-t', self] : [];
  const id = tmuxCapture([
    'split-window', '-h', '-l', '65%', '-d', '-P', '-F', '#{pane_id}', ...target,
  ]);
  if (!id) return '';
  tmuxQuiet(['set-option', WORK_PANE_OPT, id]);
  // Keep focus on the sidebar; split-window -d already does, but re-selecting
  // self guards against terminals that ignore -d.
  if (self) tmuxQuiet(['select-pane', '-t', self]);
  return id;
}

/** Is the work pane running something other than an idle shell? */
function workPaneBusy(workPane) {
  if (!workPane) return false;
  const cmd = tmuxCapture(['display-message', '-p', '-t', workPane, '#{pane_current_command}']);
  if (!cmd) return false;
  const shell = path.basename(process.env.SHELL || 'zsh');
  const idle = new Set([shell, '-' + shell, 'zsh', 'bash', 'sh', 'fish', 'dash']);
  return !idle.has(cmd);
}

/** Run `claude --resume <sessionId>` in the work pane (in the session's cwd) and focus it. */
function openInWorkPane(workPane, sessionId, cwd) {
  if (!workPane) return false;
  const args = ['respawn-pane', '-k'];
  if (cwd) args.push('-c', cwd);
  args.push('-t', workPane, `claude --resume ${sessionId}`);
  const ok = tmuxQuiet(args);
  if (ok) tmuxQuiet(['select-pane', '-t', workPane]);
  return ok;
}

function killWorkPane(workPane) {
  if (workPane) tmuxQuiet(['kill-pane', '-t', workPane]);
}

function killOwnedSession() {
  tmuxQuiet(['kill-session', '-t', SESSION]);
}

export {
  inTmux, ownsSession, selfPaneId, sessionExists, bootstrap,
  ensureWorkPane, workPaneBusy, openInWorkPane, killWorkPane, killOwnedSession,
};
