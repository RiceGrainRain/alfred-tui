import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Box, Text, useApp, useInput, useStdin, useStdout } from 'ink';
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
  const [rootTab, setRootTab] = useState('sessions'); // sessions | plans | git
  const [stack, setStack] = useState([]); // detail views pushed on top of the active root tab
  const [confirm, setConfirm] = useState(null); // { message, onYes }
  // Work-pane tabs: [{ id: tmux pane id, kind: 'claude'|'file'|'plan'|'diff', label, sessionId? }]
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [inputLocked, setInputLocked] = useState(false); // a screen is capturing text (filter mode)
  // Collapsed project groups in the sessions list. Lives here (not in
  // SessionList, which unmounts on tab switch) and is persisted in the db.
  const [collapsedProjects, setCollapsedProjectsState] = useState(() => new Set());
  const setCollapsedProjects = (next) => {
    setCollapsedProjectsState(next);
    db.setSetting('collapsedProjects', [...next]);
  };
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabRef = useRef(activeTabId);
  activeTabRef.current = activeTabId;

  const refresh = useCallback((archivedFlag) => {
    setProjects(sessionIndex.buildProjectsFromCache(archivedFlag));
    setPlans(listPlanModePlans());
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

  const tracked = useMemo(
    () => listTrackedProgress(projects.map(p => p.projectPath)),
    [projects]
  );

  const push = (view) => setStack(s => [...s, view]);
  const pop = () => setStack(s => s.slice(0, -1));

  const cycleTab = useCallback(() => {
    setRootTab(t => t === 'sessions' ? 'plans' : t === 'plans' ? 'git' : 'sessions');
  }, []);

  // Drop tabs whose process exited (e.g. :q in nvim, claude quit). If the
  // visible tab died, the next surviving tab is swapped in.
  useEffect(() => {
    if (status !== 'ready') return;
    const timer = setInterval(() => {
      const current = tabsRef.current;
      if (current.length === 0) return;
      const live = tmux.listLivePanes();
      const remaining = current.filter(t => live.has(t.id));
      if (remaining.length === current.length) return;
      setTabs(remaining);
      const active = activeTabRef.current;
      if (active && live.has(active)) return;
      const idx = current.findIndex(t => t.id === active);
      const next = remaining[Math.min(Math.max(idx, 0), remaining.length - 1)];
      if (next) tmux.showTab(next.id, tmux.visibleTab(remaining.map(t => t.id)), { focus: false });
      setActiveTabId(next?.id ?? null);
    }, 2000);
    return () => clearInterval(timer);
  }, [status]);

  const visibleTabId = () => tmux.visibleTab(tabsRef.current.map(t => t.id));

  const openNewTab = ({ cmd, cwd, label, ...meta }) => {
    const id = tmux.openTab(cmd, { cwd, label, visibleId: visibleTabId() });
    if (!id) return;
    setTabs(t => [...t, { id, label, ...meta }]);
    setActiveTabId(id);
  };

  const selectTab = (id, opts) => {
    if (!id) return;
    tmux.showTab(id, visibleTabId(), opts);
    setActiveTabId(id);
  };

  const closeActiveTab = () => {
    const idx = tabs.findIndex(t => t.id === activeTabId);
    if (idx < 0) return;
    const next = tabs[idx + 1] || tabs[idx - 1];
    tmux.closeTab(activeTabId, { visibleId: visibleTabId(), nextId: next?.id });
    setTabs(t => t.filter(x => x.id !== activeTabId));
    setActiveTabId(next?.id ?? null);
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
  useInput((input) => {
    if (input >= '1' && input <= '9') { selectTab(tabs[+input - 1]?.id, { focus: false }); return; }
    if (input === 'x') { closeActiveTab(); return; }
    if (input === 'z') { tmux.toggleZoom(); return; }
  }, { isActive: status === 'ready' && !confirm && !inputLocked });

  const liveSessionIds = useMemo(
    () => new Set(tabs.map(t => t.sessionId).filter(Boolean)),
    [tabs]
  );

  if (status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>alfred hit a startup error:</Text>
        <Text color="red">{error}</Text>
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
        onSelectTab={(id) => selectTab(id, { focus: false })}
        onCloseTab={closeActiveTab}
      />
      {screen}
    </Box>
  );
}
