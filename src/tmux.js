// tmux orchestration. alfred runs as a sidebar in the left pane of a tmux
// window; opening a session runs a live `claude` in the right "work" pane.
//
// Every tmux call is best-effort: tmux exits non-zero on ordinary events
// (a client detaching, a killed session), which is not an error for us, so
// helpers swallow failures and return sensible fallbacks rather than throw.
import { execFileSync } from 'child_process';
import path from 'path';

const SESSION = 'alfred';

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

// ── Work-pane tabs ────────────────────────────────────────────────────────
// Exactly one tab pane is visible to the right of the sidebar. The others are
// parked in a hidden, detached "stash" session so their processes (claude,
// nvim, …) keep running. Tabs are swapped in with swap-pane, which keeps pane
// ids stable, so the sidebar can track tabs purely by pane id.

/** Name of this sidebar's hidden stash session (one per sidebar pane). */
function stashName() {
  return `alfred-stash-${selfPaneId().replace(/^%/, '') || '0'}`;
}

function ensureStash() {
  const name = stashName();
  if (!sessionExists(name)) tmuxQuiet(['new-session', '-d', '-s', name]);
  return name;
}

/** Single-quote a string for the shell tmux runs pane commands with. */
function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/** Set of every live pane id on the server. */
function listLivePanes() {
  return new Set(tmuxCapture(['list-panes', '-a', '-F', '#{pane_id}']).split('\n').filter(Boolean));
}

/** Which of `tabIds` is currently shown next to the sidebar (or null). */
function visibleTab(tabIds) {
  const self = selfPaneId();
  if (!self) return null;
  const here = tmuxCapture(['list-panes', '-t', self, '-F', '#{pane_id}']).split('\n');
  return tabIds.find(id => here.includes(id)) || null;
}

/**
 * Bring tab pane `id` into view. If another tab is visible, the two swap
 * places (the old one goes to the stash, still running); otherwise the pane
 * is joined to the right of the sidebar. Focuses the tab unless `focus` is false.
 */
function showTab(id, visibleId, { focus = true } = {}) {
  if (!id) return false;
  let ok = true;
  if (visibleId && visibleId !== id) {
    ok = tmuxQuiet(['swap-pane', '-d', '-s', id, '-t', visibleId]);
  } else if (!visibleId) {
    const self = selfPaneId();
    ok = tmuxQuiet(['join-pane', '-h', '-l', '65%', '-d', '-s', id, ...(self ? ['-t', self] : [])]);
  }
  if (ok && focus) tmuxQuiet(['select-pane', '-t', id]);
  return ok;
}

/**
 * Start `cmd` in a new tab pane (created in the stash, then shown). `label`
 * is stored on the pane and drawn in its top border. Returns the pane id.
 */
function openTab(cmd, { cwd, label, visibleId } = {}) {
  const stash = ensureStash();
  const id = tmuxCapture([
    'new-window', '-d', '-t', `${stash}:`, '-P', '-F', '#{pane_id}',
    ...(cwd ? ['-c', cwd] : []), cmd,
  ]);
  if (!id) return '';
  if (label) tmuxQuiet(['set-option', '-p', '-t', id, '@alfred_label', label]);
  showTab(id, visibleId);
  return id;
}

/**
 * Kill tab pane `id`. If it's the visible one and `nextId` is given, that tab
 * is swapped in first so the work area doesn't collapse. Focus returns to the sidebar.
 */
function closeTab(id, { visibleId, nextId } = {}) {
  if (!id) return;
  if (id === visibleId && nextId) showTab(nextId, id, { focus: false });
  tmuxQuiet(['kill-pane', '-t', id]);
  const self = selfPaneId();
  if (self) tmuxQuiet(['select-pane', '-t', self]);
}

function killTabs(ids) {
  for (const id of ids) tmuxQuiet(['kill-pane', '-t', id]);
  tmuxQuiet(['kill-session', '-t', stashName()]);
}

/** Name of the tmux session the sidebar pane lives in. */
function currentSessionName() {
  const self = selfPaneId();
  return tmuxCapture(['display-message', '-p', ...(self ? ['-t', self] : []), '#{session_name}']);
}

/**
 * Session UI, only in alfred's own `alfred` session (never touches a user's
 * own session): mouse on — so clicking a pane focuses it (clicking the sidebar
 * takes keyboard focus back from claude/nvim) and the divider can be dragged
 * — plus a top border on each pane showing what the tab holds. Checked by
 * session name too, so relaunching alfred inside that session still applies it.
 */
function setupSessionUi() {
  if (!ownsSession() && currentSessionName() !== SESSION) return;
  tmuxQuiet(['set-option', '-t', SESSION, 'mouse', 'on']);
  const self = selfPaneId();
  const target = self ? ['-t', self] : [];
  tmuxQuiet(['set-option', '-w', ...target, 'pane-border-status', 'top']);
  tmuxQuiet(['set-option', '-w', ...target, 'pane-border-format', ' #{?@alfred_label,#{@alfred_label},alfred} ']);
}

/** Toggle tmux zoom on the sidebar pane (full-window view and back). */
function toggleZoom() {
  const self = selfPaneId();
  tmuxQuiet(['resize-pane', '-Z', ...(self ? ['-t', self] : [])]);
}

function killOwnedSession() {
  tmuxQuiet(['kill-session', '-t', stashName()]);
  tmuxQuiet(['kill-session', '-t', SESSION]);
}

export {
  inTmux, ownsSession, selfPaneId, sessionExists, bootstrap, shellQuote,
  listLivePanes, visibleTab, showTab, openTab, closeTab, killTabs,
  setupSessionUi, toggleZoom, killOwnedSession,
};
