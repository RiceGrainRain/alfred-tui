import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Footer from '../components/Footer.jsx';
import SearchBar from '../components/SearchBar.jsx';
import SessionCard from '../components/SessionCard.jsx';
import { computeViewport } from '../layout.js';

function sessionLabel(session) {
  return session.name || session.aiTitle || session.summary || session.sessionId;
}

// Last two path segments, e.g. /Users/me/projects/p/alfred -> "p/alfred".
function groupLabel(projectPath) {
  const parts = projectPath.split('/').filter(Boolean);
  return parts.slice(-2).join('/') || projectPath;
}

function buildFlat(projects, filter) {
  const needle = filter.trim().toLowerCase();
  const flat = [];
  for (const project of projects) {
    const label = groupLabel(project.projectPath);
    const sessions = needle
      ? project.sessions.filter(s =>
          sessionLabel(s).toLowerCase().includes(needle) ||
          label.toLowerCase().includes(needle))
      : project.sessions;
    for (const session of sessions) flat.push({ session, label });
  }
  return flat;
}

export default function SessionList({
  projects, showArchived, liveSessionId,
  onToggleShowArchived, onArchiveToggle, onStarToggle, onOpen, onNew, onView, onSwitchToPlans, onQuit,
}) {
  const [selected, setSelected] = useState(0);
  const [filterMode, setFilterMode] = useState(false);
  const [filter, setFilter] = useState('');

  const flat = useMemo(() => buildFlat(projects, filter), [projects, filter]);
  const sel = Math.max(0, Math.min(selected, flat.length - 1));

  const groupCounts = useMemo(() => {
    const counts = new Map();
    for (const { label } of flat) counts.set(label, (counts.get(label) || 0) + 1);
    return counts;
  }, [flat]);

  // Chrome above/below the list: header (1) + search bar (3, bordered) +
  // footer (1). Everything else is the scrollable card list. Cards are 4
  // lines; a group header is 1 line (+1 spacer between groups). We pick a
  // start row that centres the selection, then greedily fill the line budget
  // WITHOUT overflowing — no clipping, so bordered cards never get cut.
  const rows = process.stdout.rows || 24;
  const budget = Math.max(4, rows - 5);
  const perPageEstimate = Math.max(2, Math.floor(budget / 4));
  const { start } = computeViewport(flat.length, sel, perPageEstimate);

  useInput((input, key) => {
    if (filterMode) {
      if (key.return || key.escape) setFilterMode(false);
      else if (key.backspace || key.delete) setFilter(f => f.slice(0, -1));
      else if (input) setFilter(f => f + input);
      return;
    }
    if (input === 'q') { onQuit(); return; }
    if (key.tab || input === 'p') { onSwitchToPlans(); return; }
    if (input === '/') { setFilterMode(true); return; }
    if (input === 'A') { onToggleShowArchived(); return; }
    if (key.downArrow || input === 'j') { setSelected(Math.min(sel + 1, flat.length - 1)); return; }
    if (key.upArrow || input === 'k') { setSelected(Math.max(sel - 1, 0)); return; }
    const cur = flat[sel]?.session;
    if (!cur) return;
    if (key.return) { onOpen(cur); return; }
    if (input === 'n') { onNew(cur); return; }
    if (input === 'v') { onView(cur); return; }
    if (input === 'a') { onArchiveToggle(cur); return; }
    if (input === 's') { onStarToggle(cur); return; }
  });

  let lastLabel = null;
  let used = 0;
  const items = [];
  for (let i = start; i < flat.length; i++) {
    const { session, label } = flat[i];
    const needHeader = label !== lastLabel;
    const headerCost = needHeader ? (items.length ? 2 : 1) : 0;
    if (used + headerCost + 4 > budget) break; // 4 = card height
    if (needHeader) {
      items.push(
        <Box key={`h:${label}:${i}`} marginTop={items.length ? 1 : 0}>
          <Text color="blue">▾ </Text><Text bold color="blueBright">{label}</Text>
          <Text dimColor>  {groupCounts.get(label)}</Text>
        </Box>
      );
      used += headerCost;
      lastLabel = label;
    }
    items.push(
      <SessionCard
        key={session.sessionId}
        session={session}
        selected={i === sel}
        live={session.sessionId === liveSessionId}
      />
    );
    used += 4;
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">ALFRED</Text>
        <Text dimColor>
          {flat.length} session{flat.length === 1 ? '' : 's'}{showArchived ? ' · archived' : ''}
        </Text>
      </Box>
      <SearchBar active={filterMode} value={filter} />
      <Box flexDirection="column" flexGrow={1}>
        {flat.length === 0 && <Box paddingX={1}><Text dimColor>No sessions found.</Text></Box>}
        {items}
      </Box>
      <Footer hints={
        filterMode
          ? 'type to filter · ⏎/Esc done'
          : '↑↓ move · ⏎ open · n new · v view · a arch · s star · / find · A all · ⇥ plans · q quit'
      } />
    </Box>
  );
}
