import React, { useEffect, useState, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import SessionList from './screens/SessionList.jsx';
import * as db from './db.js';
import * as sessionIndex from './session-index.js';

export default function App() {
  const { exit } = useApp();
  const [status, setStatus] = useState('loading'); // loading | ready
  const [progress, setProgress] = useState(null);
  const [projects, setProjects] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [stack, setStack] = useState([{ type: 'sessionList' }]);

  const refresh = useCallback((archivedFlag) => {
    setProjects(sessionIndex.buildProjectsFromCache(archivedFlag));
  }, []);

  useEffect(() => {
    // Deferred one tick so the "loading" text has a chance to paint before
    // the (synchronous) cold-start/reconcile scan blocks the event loop.
    const timer = setTimeout(() => {
      if (!db.isCachePopulated()) {
        sessionIndex.populateCacheSync((i, total) => setProgress({ i, total }));
      } else {
        sessionIndex.reconcileCacheFromFilesystem();
      }
      refresh(showArchived);
      setStatus('ready');
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const push = (view) => setStack(s => [...s, view]);
  const pop = () => setStack(s => (s.length > 1 ? s.slice(0, -1) : s));

  const onQuit = () => {
    if (stack.length > 1) pop();
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

  const top = stack[stack.length - 1];

  // Placeholder detail screens don't yet own their own input handling
  // (that lands with the real SessionDetail/PlanList/PlanDetail screens);
  // give them a bare q/Esc-to-go-back until then. SessionList always
  // handles its own input, so this stays inactive while it's on top.
  useInput((input, key) => {
    if (input === 'q' || key.escape) onQuit();
  }, { isActive: status === 'ready' && top.type !== 'sessionList' });

  if (status === 'loading') {
    return (
      <Box padding={1}>
        <Text>
          Scanning Claude Code sessions{progress ? ` (${progress.i}/${progress.total} projects)` : '…'}
        </Text>
      </Box>
    );
  }

  if (top.type === 'sessionList') {
    return (
      <SessionList
        projects={projects}
        showArchived={showArchived}
        onToggleShowArchived={onToggleShowArchived}
        onArchiveToggle={onArchiveToggle}
        onOpen={(session) => push({ type: 'sessionDetail', session })}
        onSwitchToPlans={() => push({ type: 'planList' })}
        onQuit={onQuit}
      />
    );
  }

  if (top.type === 'sessionDetail') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">{top.session.sessionId}</Text>
        <Text dimColor>Detail view coming in a later phase — press q/Esc to go back.</Text>
      </Box>
    );
  }

  if (top.type === 'planList') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Plans</Text>
        <Text dimColor>Coming in a later phase — press q/Esc to go back.</Text>
      </Box>
    );
  }

  return null;
}
