import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import SessionList from './screens/SessionList.jsx';
import SessionDetail from './screens/SessionDetail.jsx';
import PlanList from './screens/PlanList.jsx';
import PlanDetail from './screens/PlanDetail.jsx';
import ConfirmResume from './components/ConfirmResume.jsx';
import * as db from './db.js';
import * as sessionIndex from './session-index.js';
import { listPlanModePlans, listTrackedProgress } from './plans.js';
import { resumeInClaude } from './resume.js';

export default function App() {
  const { exit, suspendTerminal } = useApp();
  const [pendingResume, setPendingResume] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [projects, setProjects] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [plans, setPlans] = useState([]);
  const [rootTab, setRootTab] = useState('sessions'); // sessions | plans
  const [stack, setStack] = useState([]); // detail views pushed on top of the active root tab

  const refresh = useCallback((archivedFlag) => {
    setProjects(sessionIndex.buildProjectsFromCache(archivedFlag));
    setPlans(listPlanModePlans());
  }, []);

  useEffect(() => {
    // Deferred one tick so the "loading" text has a chance to paint before
    // the (synchronous) cold-start/reconcile scan blocks the event loop.
    const timer = setTimeout(() => {
      try {
        if (!db.isCachePopulated()) {
          sessionIndex.populateCacheSync((i, total) => setProgress({ i, total }));
        } else {
          sessionIndex.reconcileCacheFromFilesystem();
        }
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

  const onQuit = () => {
    if (stack.length > 0) pop();
    else {
      db.closeDb();
      exit();
    }
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

  const doResume = async (session) => {
    await suspendTerminal(() => resumeInClaude(session.sessionId));
    sessionIndex.reconcileCacheFromFilesystem();
    refresh(showArchived);
  };

  const onResume = (session) => {
    if (session.archived) setPendingResume(session);
    else doResume(session);
  };

  const top = stack[stack.length - 1] || { type: rootTab === 'sessions' ? 'sessionList' : 'planList' };

  // Placeholder for anything not yet handling its own input; every current
  // screen manages its own useInput, so this is effectively a no-op safety
  // net kept for forward compatibility with future screens.
  const ownsInput = new Set(['sessionList', 'sessionDetail', 'planList', 'planDetail']);
  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      if (status === 'error') exit();
      else onQuit();
    }
  }, { isActive: status === 'error' || (status === 'ready' && !pendingResume && !ownsInput.has(top.type)) });

  if (status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>alfred-tui hit a startup error:</Text>
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

  if (pendingResume) {
    return (
      <ConfirmResume
        session={pendingResume}
        onConfirm={() => { const s = pendingResume; setPendingResume(null); doResume(s); }}
        onCancel={() => setPendingResume(null)}
      />
    );
  }

  if (top.type === 'sessionList') {
    return (
      <SessionList
        projects={projects}
        showArchived={showArchived}
        onToggleShowArchived={onToggleShowArchived}
        onArchiveToggle={onArchiveToggle}
        onResume={onResume}
        onOpen={(session) => push({ type: 'sessionDetail', session })}
        onSwitchToPlans={() => setRootTab('plans')}
        onQuit={onQuit}
      />
    );
  }

  if (top.type === 'sessionDetail') {
    return <SessionDetail session={top.session} onBack={pop} onResume={onResume} />;
  }

  if (top.type === 'planList') {
    return (
      <PlanList
        plans={plans}
        tracked={tracked}
        onOpenPlan={(plan) => push({ type: 'planDetail', plan })}
        onOpenTracked={(entry) => push({ type: 'planDetail', trackedEntry: entry })}
        onSwitchToSessions={() => setRootTab('sessions')}
        onQuit={onQuit}
      />
    );
  }

  if (top.type === 'planDetail') {
    return <PlanDetail plan={top.plan} trackedEntry={top.trackedEntry} onBack={pop} />;
  }

  return null;
}
