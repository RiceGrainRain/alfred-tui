import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Box, Text, useApp, useInput, useStdin } from 'ink';
import SessionList from './screens/SessionList.jsx';
import SessionDetail from './screens/SessionDetail.jsx';
import PlanList from './screens/PlanList.jsx';
import PlanDetail from './screens/PlanDetail.jsx';
import GitTree from './screens/GitTree.jsx';
import Confirm from './components/Confirm.jsx';
import * as db from './db.js';
import * as sessionIndex from './session-index.js';
import * as tmux from './tmux.js';
import { listPlanModePlans, listTrackedProgress } from './plans.js';
import { attachMouseListener, disableMouse } from './mouse.js';

export default function App() {
  const { exit } = useApp();
  const { stdin } = useStdin();

  // Attach SGR mouse event parser to the stdin stream Ink actually reads from.
  useEffect(() => {
    if (!stdin) return;
    return attachMouseListener(stdin);
  }, [stdin]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [projects, setProjects] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [plans, setPlans] = useState([]);
  const [rootTab, setRootTab] = useState('sessions'); // sessions | plans | git
  const [stack, setStack] = useState([]); // detail views pushed on top of the active root tab
  const [liveSessionId, setLiveSessionId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { message, onYes }
  const workPane = useRef('');

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
        workPane.current = tmux.ensureWorkPane();
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

  const onQuit = () => {
    if (stack.length > 0) { pop(); return; }
    disableMouse();
    if (tmux.ownsSession()) {
      tmux.killOwnedSession(); // tears down both panes and detaches
    } else {
      tmux.killWorkPane(workPane.current);
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

  // Re-validate the work pane each time before using it: if it was closed
  // externally, ensureWorkPane() recreates it and returns the new id.
  const getWorkPane = () => {
    const id = tmux.ensureWorkPane();
    workPane.current = id;
    return id;
  };

  const doOpen = (session) => {
    tmux.openInWorkPane(getWorkPane(), session.sessionId, session.projectPath);
    setLiveSessionId(session.sessionId);
  };

  // n on a session: start a brand-new claude session in that session's project
  // directory. Confirms first if the work pane is already busy.
  const onNew = (session) => {
    const pane = getWorkPane();
    const doNew = () => {
      tmux.newSessionInWorkPane(pane, session.projectPath);
      // Clear the live marker — the new session has no id yet. It will
      // appear in the sidebar once it writes its first JSONL line and the
      // cache reconciles on the next refresh.
      setLiveSessionId(null);
    };
    if (tmux.workPaneBusy(pane)) {
      setConfirm({
        message: `Start a new claude session in ${session.projectPath}? (will replace what's in the work pane)`,
        onYes: doNew,
      });
    } else {
      doNew();
    }
  };

  // Enter on a session: open it live in the work pane. Confirm first if the
  // pane is busy (would kill a running claude) or the session is archived.
  const onOpen = (session) => {
    const openWithBusyCheck = () => {
      const pane = getWorkPane();
      if (tmux.workPaneBusy(pane)) {
        setConfirm({
          message: 'A session is already open in the work pane. Replace it?',
          onYes: () => doOpen(session),
        });
      } else {
        doOpen(session);
      }
    };
    if (session.archived) {
      setConfirm({
        message: `"${session.name || session.summary || session.sessionId}" is archived. Open it anyway?`,
        onYes: openWithBusyCheck,
      });
    } else {
      openWithBusyCheck();
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

  if (status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>alfred hit a startup error:</Text>
        <Text color="red">{error}</Text>
        <Box marginTop={1}>
          <Text dimColor>Check that ~/.claude/projects and ~/.switchboard are readable. Press q/Esc to exit.</Text>
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

  if (top.type === 'sessionList') {
    return (
      <SessionList
        projects={projects}
        showArchived={showArchived}
        liveSessionId={liveSessionId}
        onToggleShowArchived={onToggleShowArchived}
        onArchiveToggle={onArchiveToggle}
        onStarToggle={onStarToggle}
        onOpen={onOpen}
        onNew={onNew}
        onView={onView}
        onSwitchToPlans={() => setRootTab('plans')}
        onCycleTab={cycleTab}
        onQuit={onQuit}
      />
    );
  }

  if (top.type === 'sessionDetail') {
    return <SessionDetail session={top.session} onBack={pop} onOpen={onOpen} />;
  }

  if (top.type === 'planList') {
    return (
      <PlanList
        plans={plans}
        tracked={tracked}
        onOpenPlan={(plan) => push({ type: 'planDetail', plan })}
        onOpenTracked={(entry) => push({ type: 'planDetail', trackedEntry: entry })}
        onSwitchToSessions={() => setRootTab('sessions')}
        onCycleTab={cycleTab}
        onQuit={onQuit}
      />
    );
  }

  if (top.type === 'gitTree') {
    return (
      <GitTree
        projects={projects}
        liveSessionId={liveSessionId}
        onCycleTab={cycleTab}
        onBack={() => setRootTab('sessions')}
      />
    );
  }

  if (top.type === 'planDetail') {
    return <PlanDetail plan={top.plan} trackedEntry={top.trackedEntry} onBack={pop} />;
  }

  return null;
}
