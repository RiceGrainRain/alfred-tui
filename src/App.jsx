import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Box, Text, useApp, useInput, useStdin, useStdout } from 'ink';
import { C } from './theme.js';
import SessionList from './screens/SessionList.jsx';
import SessionDetail from './screens/SessionDetail.jsx';
import PlanList from './screens/PlanList.jsx';
import PlanDetail from './screens/PlanDetail.jsx';
import GitTree from './screens/GitTree.jsx';
import Confirm from './components/Confirm.jsx';
import Chrome from './components/Chrome.jsx';
import * as db from './db.js';
import * as sessionIndex from './session-index.js';
import * as tmux from './tmux.js';
import path from 'path';
import { listPlanModePlans, listTrackedProgress, planModePath } from './plans.js';
import { attachMouseListener, disableMouse } from './mouse.js';
import { setHintsVisible } from './layout.js';
import { paneStatus, nextStatus } from './agent-status.js';

const EDITOR = process.env.ALFRED_EDITOR || 'nvim';
const EDITOR_NAME = path.basename(EDITOR.split(' ')[0]);
const SHELL = process.env.SHELL || 'zsh';

function sessionLabel(session) {
  return session.name || session.aiTitle || session.summary || session.sessionId;
}

function shortLabel(str, max = 24) {
  const s = String(str).replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

export default function App() {
  const { exit } = useApp();
  const { stdin } = useStdin();
  const { stdout, write } = useStdout();

  // Attach SGR mouse event parser to the stdin stream Ink actually reads from.
  useEffect(() => {
    if (!stdin) return;
    return attachMouseListener(stdin);
  }, [stdin]);

  // When the pane is resized (tab opened/closed, zoom, divider drag) tmux
  // reflows the old frame, and Ink's erase-by-line-count leaves stale rows
  // behind, pushing the live frame down and breaking every mouse row map.
  // Wipe the screen and home the cursor; Ink's write() then repaints the
  // frame from row 1. Registered after Ink's own resize listener.
  // Also re-render the tree: width/height-dependent layout (footer wrapping,
  // truncation, page budgets) is computed during render from stdout size.
  const [, setTermSize] = useState(null);
  useEffect(() => {
    const onResize = () => {
      write('\x1b[2J\x1b[3J\x1b[H');
      setTermSize({ cols: stdout.columns, rows: stdout.rows });
    };
    stdout.on('resize', onResize);
    return () => stdout.off('resize', onResize);
  }, [stdout, write]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [projects, setProjects] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [plans, setPlans] = useState([]);
  const [tracked, setTracked] = useState([]);
  const [rootTab, setRootTab] = useState('sessions'); // sessions | plans | git
  const [stack, setStack] = useState([]); // detail views pushed on top of the active root tab
  const [confirm, setConfirm] = useState(null); // { message, onYes }
  // Work-pane tabs: [{ id: tmux pane id, kind: 'claude'|'file'|'plan'|'diff', label, sessionId? }]
  const [tabs, setTabs] = useState([]);
  // Tab ids currently on screen in the work area. More than one = split view.
  const [visible, setVisible] = useState([]);
  // Armed split direction ('h' side by side, 'v' stacked): the next tab that
  // gets opened or selected joins the work area instead of replacing a pane.
  const [splitDir, setSplitDir] = useState(null);
  const [activeTabId, setActiveTabId] = useState(null);
  const [inputLocked, setInputLocked] = useState(false); // a screen is capturing text (filter mode)
  // Collapsed project groups in the sessions list. Lives here (not in
  // SessionList, which unmounts on tab switch) and is persisted in the db.
  const [collapsedProjects, setCollapsedProjectsState] = useState(() => new Set());
  const setCollapsedProjects = (next) => {
    setCollapsedProjectsState(next);
    db.setSetting('collapsedProjects', [...next]);
  };
  // Footer keybind hints. The flag also lives in layout.js so Footer and the
  // screens' height budgets stay in step; keep the two writes together.
  const [showHints, setShowHintsState] = useState(true);
  const applyShowHints = (next, { persist = true } = {}) => {
    setShowHintsState(next);
    setHintsVisible(next);
    if (persist) db.setSetting('showHints', next);
  };
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabRef = useRef(activeTabId);
  activeTabRef.current = activeTabId;

  // Re-read the cache, but only swap in new arrays when something the sidebar
  // actually draws has changed — refresh() runs on a timer, and a fresh array
  // every tick would re-render (and reflow the selection) for nothing.
  const sigRef = useRef({ projects: null, plans: null, tracked: null });
  const refresh = useCallback((archivedFlag) => {
    const nextProjects = sessionIndex.buildProjectsFromCache(archivedFlag);
    const projectsSig = nextProjects
      .map(p => p.sessions
        .map(s => `${s.sessionId}/${s.modified}/${s.messageCount}/${s.name}/${s.aiTitle}/${s.starred}/${s.archived}`)
        .join(','))
      .join('|');
    if (projectsSig !== sigRef.current.projects) {
      sigRef.current.projects = projectsSig;
      setProjects(nextProjects);
    }
    const nextPlans = listPlanModePlans();
    const plansSig = nextPlans.map(p => `${p.filename}/${p.title}/${p.modified}`).join('|');
    if (plansSig !== sigRef.current.plans) {
      sigRef.current.plans = plansSig;
      setPlans(nextPlans);
    }
    // Tracked progress is discovered from the projects we just built, so it
    // has to be re-read here rather than memoised off `projects` — a new
    // plan-tracker.md appears without the session list having changed at all.
    const nextTracked = listTrackedProgress(nextProjects.map(p => p.projectPath));
    const trackedSig = nextTracked
      .map(t => `${t.projectPath}/${t.modified}/${t.plan?.done ?? ''}/${t.plan?.total ?? ''}/${t.todos.length}`)
      .join('|');
    if (trackedSig !== sigRef.current.tracked) {
      sigRef.current.tracked = trackedSig;
      setTracked(nextTracked);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (!db.isCachePopulated()) {
          sessionIndex.populateCacheSync((i, total) => setProgress({ i, total }));
        } else {
          sessionIndex.reconcileCacheFromFilesystem();
        }
        tmux.setupSessionUi();
        setCollapsedProjectsState(new Set(db.getSetting('collapsedProjects') || []));
        applyShowHints(db.getSetting('showHints') ?? true, { persist: false });
        refresh(showArchived);
        setStatus('ready');
      } catch (err) {
        setError(err.message || String(err));
        setStatus('error');
      }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the sidebar in step with the filesystem: a session started with `n`
  // (or in any other terminal) only exists once claude writes its first JSONL
  // line, which is well after the tab opened. The reconcile is incremental —
  // a stat per transcript, ~1ms when nothing moved — and refresh() no-ops
  // unless the result actually differs, so the list stays still when it is.
  useEffect(() => {
    if (status !== 'ready') return;
    const timer = setInterval(() => {
      try {
        sessionIndex.reconcileCacheFromFilesystem();
        refresh(showArchived);
      } catch {
        // A transient FS/DB hiccup must not kill the timer.
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [status, showArchived, refresh]);

  const push = (view) => setStack(s => [...s, view]);
  const pop = () => setStack(s => s.slice(0, -1));

  const cycleTab = useCallback(() => {
    setRootTab(t => t === 'sessions' ? 'plans' : t === 'plans' ? 'git' : 'sessions');
  }, []);

  // Drop tabs whose process exited (e.g. :q in nvim, claude quit). Panes left
  // beside them in a split just reflow; if the work area emptied, the next
  // surviving tab is swapped in.
  useEffect(() => {
    if (status !== 'ready') return;
    const timer = setInterval(() => {
      const current = tabsRef.current;
      if (current.length === 0) return;
      const live = tmux.listLivePanes();
      const remaining = current.filter(t => live.has(t.id));
      if (remaining.length === current.length) return;
      setTabs(remaining);
      const ids = remaining.map(t => t.id);
      let vis = tmux.visibleTabs(ids);
      const active = activeTabRef.current;
      let next = live.has(active) ? active : vis[0] ?? null;
      if (!next) {
        const idx = current.findIndex(t => t.id === active);
        next = remaining[Math.min(Math.max(idx, 0), remaining.length - 1)]?.id ?? null;
        if (next) {
          tmux.showTab(next, null, { focus: false });
          vis = tmux.visibleTabs(ids);
        }
      }
      setVisible(vis);
      setActiveTabId(next);
    }, 2000);
    return () => clearInterval(timer);
  }, [status]);

  // tmux is the source of truth for what's on screen — the user can also move
  // panes around with tmux's own keys — so re-read it before every operation.
  const readVisible = (extraId) => {
    const ids = tabsRef.current.map(t => t.id);
    return tmux.visibleTabs(extraId ? [...ids, extraId] : ids);
  };

  // The visible pane a tab replaces, or splits off: the active one when it's
  // on screen, else whatever is leftmost.
  const anchor = (vis) => (vis.includes(activeTabRef.current) ? activeTabRef.current : vis[0] ?? null);

  const openNewTab = ({ cmd, cwd, label, ...meta }) => {
    const vis = readVisible();
    const at = anchor(vis);
    const dir = at ? splitDir : null; // nothing to split off an empty work area
    const id = tmux.openTab(cmd, { cwd, label, visibleId: at, splitOf: dir ? at : null, dir });
    if (!id) return;
    setTabs(t => [...t, { id, label, ...meta }]);
    setVisible(readVisible(id));
    setActiveTabId(id);
    setSplitDir(null);
  };

  const selectTab = (id, opts = {}) => {
    if (!id) return;
    const vis = readVisible();
    if (vis.includes(id)) {
      // Already on screen (in a split): just make it the active pane.
      if (opts.focus !== false) tmux.focusPane(id);
    } else {
      const at = anchor(vis);
      if (splitDir && at) tmux.splitTab(id, at, { dir: splitDir, ...opts });
      else tmux.showTab(id, at, opts);
    }
    setVisible(readVisible(id));
    setActiveTabId(id);
    setSplitDir(null);
  };

  const closeActiveTab = () => {
    const id = activeTabId;
    const idx = tabs.findIndex(t => t.id === id);
    if (idx < 0) return;
    const vis = readVisible();
    const rest = vis.filter(v => v !== id);
    // Only pull another tab in when this was the work area's last pane.
    const backfill = vis.includes(id) && rest.length === 0 ? (tabs[idx + 1] || tabs[idx - 1]) : null;
    tmux.closeTab(id, { visibleId: vis.includes(id) ? id : null, nextId: backfill?.id });
    setTabs(t => t.filter(x => x.id !== id));
    const nextVisible = backfill ? [backfill.id] : rest;
    setVisible(nextVisible);
    setActiveTabId(nextVisible[0] ?? null);
  };

  // u: take the active pane out of the split and park it back in the stash.
  // The tab stays in the strip and its process keeps running.
  const unsplitActiveTab = () => {
    const vis = readVisible();
    if (vis.length < 2) return;
    const id = vis.includes(activeTabId) ? activeTabId : vis[vis.length - 1];
    tmux.hideTab(id);
    const rest = vis.filter(v => v !== id);
    setVisible(rest);
    setActiveTabId(rest[0] ?? null);
    tmux.focusSidebar();
  };

  const onRootTab = (key) => {
    setStack([]);
    setRootTab(key);
  };

  const openFile = (filePath, { kind = 'file', label } = {}) => {
    openNewTab({
      kind,
      cmd: `${EDITOR} ${tmux.shellQuote(filePath)}`,
      cwd: path.dirname(filePath),
      label: label || `${EDITOR_NAME}:${shortLabel(path.basename(filePath))}`,
      path: filePath,
    });
  };

  const openDiff = (projectPath, file) => {
    openNewTab({
      kind: 'diff',
      cmd: `git -c color.ui=always diff HEAD -- ${tmux.shellQuote(file)} | less -R`,
      cwd: projectPath,
      label: `diff:${shortLabel(path.basename(file))}`,
    });
  };

  // Open a plain shell tab in `projectPath`. Label uses the last two segments
  // of the path so it's recognisable when several projects are open.
  const openShell = (projectPath) => {
    openNewTab({
      kind: 'shell',
      cmd: SHELL,
      cwd: projectPath,
      label: `sh:${shortLabel(path.basename(projectPath), 18)}`,
    });
  };

  // Open an interactive git-commit flow in a tab: stage individual hunks
  // (git add -p) then write the commit message (git commit -v).
  // Runs in the git repo root so paths are correct.
  const openCommit = (projectPath) => {
    openNewTab({
      kind: 'shell',
      cmd: `git add -p && git commit -v`,
      cwd: projectPath,
      label: `commit:${shortLabel(path.basename(projectPath), 14)}`,
    });
  };

  const onOpenPlanInTab = ({ plan, trackedEntry }) => {
    if (plan) {
      openFile(planModePath(plan.filename), { kind: 'plan', label: `plan:${shortLabel(plan.title)}` });
    } else if (trackedEntry) {
      const file = trackedEntry.trackerPath || trackedEntry.todosPath;
      if (file) openFile(file, { kind: 'plan', label: `plan:${shortLabel(path.basename(trackedEntry.projectPath))}` });
    }
  };

  const onQuit = () => {
    if (stack.length > 0) { pop(); return; }
    disableMouse();
    if (tmux.ownsSession()) {
      tmux.killOwnedSession(); // tears down the sidebar, tabs and stash, and detaches
    } else {
      tmux.killTabs(tabs.map(t => t.id));
    }
    db.closeDb();
    exit();
  };

  const onToggleShowArchived = () => {
    setShowArchived(v => {
      refresh(!v);
      return !v;
    });
  };

  const onArchiveToggle = (session) => {
    db.setArchived(session.sessionId, !session.archived);
    refresh(showArchived);
  };

  const onStarToggle = (session) => {
    db.toggleStar(session.sessionId);
    refresh(showArchived);
  };

  // n on a session: start a brand-new claude session in a new tab, in that
  // session's project directory. It appears in the sidebar once it writes its
  // first JSONL line and the cache reconciles on the next refresh.
  const onNew = (session) => {
    openNewTab({
      kind: 'claude',
      cmd: 'claude',
      cwd: session.projectPath,
      label: `claude:+${shortLabel(path.basename(session.projectPath), 16)}`,
    });
  };

  // Enter on a session: switch to its tab if it's already open, otherwise
  // resume it in a new tab. Archived sessions ask first.
  const onOpen = (session) => {
    const existing = tabs.find(t => t.sessionId === session.sessionId);
    if (existing) { selectTab(existing.id); return; }
    const doOpen = () => openNewTab({
      kind: 'claude',
      cmd: `claude --resume ${session.sessionId}`,
      cwd: session.projectPath,
      label: `claude:${shortLabel(sessionLabel(session))}`,
      sessionId: session.sessionId,
    });
    if (session.archived) {
      setConfirm({
        message: `"${sessionLabel(session)}" is archived. Open it anyway?`,
        onYes: doOpen,
      });
    } else {
      doOpen();
    }
  };

  const onView = (session) => push({ type: 'sessionDetail', session });

  const top = stack[stack.length - 1] || {
    type: rootTab === 'sessions' ? 'sessionList' : rootTab === 'plans' ? 'planList' : 'gitTree',
  };

  const ownsInput = new Set(['sessionList', 'sessionDetail', 'planList', 'planDetail', 'gitTree']);
  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      if (status === 'error') exit();
      else onQuit();
    }
  }, { isActive: status === 'error' || (status === 'ready' && !confirm && !ownsInput.has(top.type)) });

  // Global tab keys, available on every screen unless a screen is capturing
  // text: 1–9 switch work tab, x closes the active one, z zooms the sidebar.
  // | / - arm a split so the next tab opens beside the active pane instead of
  // replacing it (press again to cancel); u undoes one split.
  useInput((input) => {
    if (input >= '1' && input <= '9') { selectTab(tabs[+input - 1]?.id, { focus: false }); return; }
    if (input === 'x') { closeActiveTab(); return; }
    if (input === 'z') { tmux.toggleZoom(); return; }
    if (input === '|') { setSplitDir(d => (d === 'h' ? null : 'h')); return; }
    if (input === '-') { setSplitDir(d => (d === 'v' ? null : 'v')); return; }
    if (input === 'u') { unsplitActiveTab(); return; }
    if (input === '?') { applyShowHints(!showHints); return; }
  }, { isActive: status === 'ready' && !confirm && !inputLocked });

  const liveSessionIds = useMemo(
    () => new Set(tabs.map(t => t.sessionId).filter(Boolean)),
    [tabs]
  );

  // working / blocked / idle / done per open claude tab, read off its pane.
  const [statuses, setStatuses] = useState(() => new Map());
  const statusesRef = useRef(statuses);
  const statusSigRef = useRef('');
  useEffect(() => {
    if (status !== 'ready') return;
    const timer = setInterval(() => {
      const next = new Map();
      for (const t of tabsRef.current) {
        if (!t.sessionId) continue;
        const seen = t.id === activeTabRef.current;
        next.set(t.sessionId, nextStatus(statusesRef.current.get(t.sessionId), paneStatus(tmux.capturePane(t.id)), seen));
      }
      const sig = [...next].join();
      if (sig !== statusSigRef.current) {
        statusSigRef.current = sig;
        statusesRef.current = next;
        setStatuses(next);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  // Spinner frame for working sessions; only ticks while something works.
  const [spinFrame, setSpinFrame] = useState(0);
  const anyWorking = [...statuses.values()].includes('working');
  useEffect(() => {
    if (!anyWorking) return;
    const timer = setInterval(() => setSpinFrame(f => f + 1), 250);
    return () => clearInterval(timer);
  }, [anyWorking]);

  if (status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={C.red} bold>alfred hit a startup error:</Text>
        <Text color={C.red}>{error}</Text>
        <Box marginTop={1}>
          <Text dimColor>Check that ~/.claude/projects and ~/.alfred are readable. Press q/Esc to exit.</Text>
        </Box>
      </Box>
    );
  }

  if (status === 'loading') {
    return (
      <Box padding={1}>
        <Text>
          Scanning Claude Code sessions{progress ? ` (${progress.i}/${progress.total} projects)` : '…'}
        </Text>
      </Box>
    );
  }

  if (confirm) {
    return (
      <Confirm
        message={confirm.message}
        onYes={() => { const c = confirm; setConfirm(null); c.onYes(); }}
        onNo={() => setConfirm(null)}
      />
    );
  }

  let screen = null;
  if (top.type === 'sessionList') {
    screen = (
      <SessionList
        projects={projects}
        showArchived={showArchived}
        liveSessionIds={liveSessionIds}
        statuses={statuses}
        spinFrame={spinFrame}
        collapsed={collapsedProjects}
        onCollapsedChange={setCollapsedProjects}
        onToggleShowArchived={onToggleShowArchived}
        onArchiveToggle={onArchiveToggle}
        onStarToggle={onStarToggle}
        onOpen={onOpen}
        onNew={onNew}
        onView={onView}
        onOpenShell={(session) => openShell(session.projectPath)}
        onSwitchToPlans={() => setRootTab('plans')}
        onCycleTab={cycleTab}
        onFilterMode={setInputLocked}
        onQuit={onQuit}
      />
    );
  } else if (top.type === 'sessionDetail') {
    screen = <SessionDetail session={top.session} onBack={pop} onOpen={onOpen} />;
  } else if (top.type === 'planList') {
    screen = (
      <PlanList
        plans={plans}
        tracked={tracked}
        onOpenPlan={(plan) => push({ type: 'planDetail', plan })}
        onOpenTracked={(entry) => push({ type: 'planDetail', trackedEntry: entry })}
        onOpenInTab={onOpenPlanInTab}
        onSwitchToSessions={() => setRootTab('sessions')}
        onCycleTab={cycleTab}
        onQuit={onQuit}
      />
    );
  } else if (top.type === 'gitTree') {
    screen = (
      <GitTree
        projects={projects}
        liveSessionIds={liveSessionIds}
        onOpenFile={openFile}
        onOpenDiff={openDiff}
        onOpenShell={(projectPath) => openShell(projectPath)}
        onOpenCommit={(projectPath) => openCommit(projectPath)}
        onCycleTab={cycleTab}
        onBack={() => setRootTab('sessions')}
      />
    );
  } else if (top.type === 'planDetail') {
    screen = (
      <PlanDetail
        plan={top.plan}
        trackedEntry={top.trackedEntry}
        onOpenInTab={() => onOpenPlanInTab(top)}
        onBack={pop}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Chrome
        rootTab={rootTab}
        onRootTab={onRootTab}
        tabs={tabs}
        activeTabId={activeTabId}
        visibleIds={visible}
        splitDir={splitDir}
        onSelectTab={(id) => selectTab(id, { focus: false })}
        onCloseTab={closeActiveTab}
      />
      {screen}
    </Box>
  );
}
