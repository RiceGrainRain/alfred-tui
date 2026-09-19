import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Footer from '../components/Footer.jsx';

function sessionLabel(session) {
  return session.name || session.aiTitle || session.summary || session.sessionId;
}

function shortProjectPath(projectPath) {
  const home = process.env.HOME || '';
  return home && projectPath.startsWith(home) ? '~' + projectPath.slice(home.length) : projectPath;
}

function buildRows(projects, filter) {
  const needle = filter.trim().toLowerCase();
  const rows = [];
  for (const project of projects) {
    const sessions = needle
      ? project.sessions.filter(s =>
          sessionLabel(s).toLowerCase().includes(needle) ||
          project.projectPath.toLowerCase().includes(needle))
      : project.sessions;
    if (!sessions.length) continue;
    rows.push({ type: 'header', key: `h:${project.projectPath}`, projectPath: project.projectPath });
    for (const session of sessions) {
      rows.push({ type: 'session', key: session.sessionId, session });
    }
  }
  return rows;
}

export default function SessionList({
  projects, showArchived, onToggleShowArchived, onArchiveToggle, onOpen, onSwitchToPlans, onQuit,
}) {
  const [selected, setSelected] = useState(0);
  const [filterMode, setFilterMode] = useState(false);
  const [filter, setFilter] = useState('');

  const rows = useMemo(() => buildRows(projects, filter), [projects, filter]);
  const sessionRowIndexes = useMemo(
    () => rows.map((r, i) => (r.type === 'session' ? i : -1)).filter(i => i !== -1),
    [rows]
  );

  const clampedSelected = sessionRowIndexes.includes(selected)
    ? selected
    : (sessionRowIndexes[0] ?? -1);

  useInput((input, key) => {
    if (filterMode) {
      if (key.return || key.escape) {
        setFilterMode(false);
      } else if (key.backspace || key.delete) {
        setFilter(f => f.slice(0, -1));
      } else if (input) {
        setFilter(f => f + input);
      }
      return;
    }

    if (input === 'q' || key.escape) {
      onQuit();
      return;
    }
    if (key.tab || input === 'p') {
      onSwitchToPlans();
      return;
    }
    if (input === '/') {
      setFilterMode(true);
      return;
    }
    if (input === 'A') {
      onToggleShowArchived();
      return;
    }

    const pos = sessionRowIndexes.indexOf(clampedSelected);
    if ((key.downArrow || input === 'j') && pos !== -1) {
      const next = sessionRowIndexes[Math.min(pos + 1, sessionRowIndexes.length - 1)];
      if (next !== undefined) setSelected(next);
      return;
    }
    if ((key.upArrow || input === 'k') && pos !== -1) {
      const prev = sessionRowIndexes[Math.max(pos - 1, 0)];
      if (prev !== undefined) setSelected(prev);
      return;
    }
    if (key.return && clampedSelected !== -1) {
      onOpen(rows[clampedSelected].session);
      return;
    }
    if (input === 'a' && clampedSelected !== -1) {
      onArchiveToggle(rows[clampedSelected].session);
      return;
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1}>
        <Text bold color="cyan">Sessions</Text>
        <Text dimColor>  {showArchived ? '(showing archived)' : ''}</Text>
      </Box>
      {filterMode && (
        <Box paddingX={1}>
          <Text>Filter: {filter}<Text dimColor>█</Text></Text>
        </Box>
      )}
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {rows.length === 0 && <Text dimColor>No sessions found.</Text>}
        {rows.map((row, i) => {
          if (row.type === 'header') {
            return (
              <Box key={row.key} marginTop={1}>
                <Text bold color="yellow">{shortProjectPath(row.projectPath)}</Text>
              </Box>
            );
          }
          const s = row.session;
          const isSelected = i === clampedSelected;
          const star = s.starred ? '★ ' : '  ';
          const archivedTag = s.archived ? ' [archived]' : '';
          return (
            <Box key={row.key}>
              <Text color={isSelected ? 'black' : undefined} backgroundColor={isSelected ? 'cyan' : undefined}>
                {'  '}{star}{sessionLabel(s)}{archivedTag}
                {'  '}<Text dimColor={!isSelected}>({s.messageCount} msgs)</Text>
              </Text>
            </Box>
          );
        })}
      </Box>
      <Footer hints={
        filterMode
          ? 'Enter/Esc: done filtering'
          : '↑/k ↓/j move  Enter open  a archive  A show archived  / filter  Tab plans  q quit'
      } />
    </Box>
  );
}
