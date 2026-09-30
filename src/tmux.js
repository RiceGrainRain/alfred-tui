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
// One or more tab panes are visible to the right of the sidebar (a split view
// shows several at once). The rest are parked in a hidden, detached "stash"
// session so their processes (claude, nvim, …) keep running. Tabs move between
// the two with swap-pane / join-pane / break-pane, all of which keep pane ids
// stable, so the sidebar can track tabs purely by pane id.

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

/**
 * Which of `tabIds` are currently in the work area, in tmux's layout order
 * (left-to-right / top-to-bottom). More than one means a split view.
 */
function visibleTabs(tabIds) {
  const self = selfPaneId();
  if (!self) return [];
  const wanted = new Set(tabIds);
  return tmuxCapture(['list-panes', '-t', self, '-F', '#{pane_id}'])
    .split('\n')
    .filter(id => wanted.has(id));
}

/** Which of `tabIds` is shown next to the sidebar (the first one, or null). */
function visibleTab(tabIds) {
  return visibleTabs(tabIds)[0] || null;
}

/**
 * Bring tab pane `id` into view in place of `visibleId`: the two swap places,
 * so the old tab goes to the stash still running. With nothing visible the
 * pane is joined to the right of the sidebar instead. Focuses the tab unless
 * `focus` is false.
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
 * Add tab pane `id` to the work area as a split of the already-visible pane
 * `targetId`, which gives up half its space. `dir` is 'h' for side by side,
 * 'v' for stacked.
 */
function splitTab(id, targetId, { dir = 'h', focus = true } = {}) {
  if (!id || !targetId || id === targetId) return false;
  const ok = tmuxQuiet(['join-pane', dir === 'v' ? '-v' : '-h', '-d', '-s', id, '-t', targetId]);
  if (ok && focus) tmuxQuiet(['select-pane', '-t', id]);
  return ok;
}

/**
 * Pull visible tab pane `id` out of the work area and park it back in the
 * stash. Its process keeps running and the remaining panes reflow to fill
 * the gap — the inverse of splitTab.
 */
function hideTab(id) {
  if (!id) return false;
  const stash = ensureStash();
  return tmuxQuiet(['break-pane', '-d', '-s', id, '-t', `${stash}:`]);
}

/**
 * Start `cmd` in a new tab pane (created in the stash, then shown). `label`
 * is stored on the pane and drawn in its top border. Passing `splitOf` adds
 * it alongside that visible pane instead of replacing `visibleId`. Returns
 * the pane id.
 */
function openTab(cmd, { cwd, label, visibleId, splitOf, dir } = {}) {
  const stash = ensureStash();
  const id = tmuxCapture([
    'new-window', '-d', '-t', `${stash}:`, '-P', '-F', '#{pane_id}',
    ...(cwd ? ['-c', cwd] : []), cmd,
  ]);
  if (!id) return '';
  if (label) tmuxQuiet(['set-option', '-p', '-t', id, '@alfred_label', label]);
  if (splitOf) splitTab(id, splitOf, { dir });
  else showTab(id, visibleId);
  return id;
}

/** Give keyboard focus to pane `id`. */
function focusPane(id) {
  if (id) tmuxQuiet(['select-pane', '-t', id]);
}

/** Give keyboard focus back to the sidebar pane. */
function focusSidebar() {
  const self = selfPaneId();
  if (self) tmuxQuiet(['select-pane', '-t', self]);
}

/**
 * Kill tab pane `id`. If it's the last visible one and `nextId` is given,
 * that tab is swapped in first so the work area doesn't collapse; panes still
 * beside it in a split just reflow. Focus returns to the sidebar.
 */
function closeTab(id, { visibleId, nextId } = {}) {
  if (!id) return;
  if (id === visibleId && nextId) showTab(nextId, id, { focus: false });
  tmuxQuiet(['kill-pane', '-t', id]);
  focusSidebar();
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
  listLivePanes, visibleTab, visibleTabs, showTab, splitTab, hideTab,
  openTab, closeTab, killTabs, focusPane, focusSidebar,
  setupSessionUi, toggleZoom, killOwnedSession,
};
