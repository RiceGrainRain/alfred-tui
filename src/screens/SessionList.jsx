import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { mouseEmitter, isMouseSeq } from '../mouse.js';
import Footer from '../components/Footer.jsx';
import SearchBar from '../components/SearchBar.jsx';
import SessionCard from '../components/SessionCard.jsx';
import { CHROME_ROWS, computeViewport, footerHeight } from '../layout.js';

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
  projects, showArchived, liveSessionIds,
  onToggleShowArchived, onArchiveToggle, onStarToggle, onOpen, onNew, onView,
  onOpenShell, onSwitchToPlans, onCycleTab, onFilterMode, onQuit,
}) {
  const [selected, setSelected] = useState(0);
  const [filterMode, setFilterMode] = useState(false);
  const [filter, setFilter] = useState('');
  const rowMapRef = useRef({});

  const flat = useMemo(() => buildFlat(projects, filter), [projects, filter]);
  const sel = Math.max(0, Math.min(selected, flat.length - 1));

  const groupCounts = useMemo(() => {
    const counts = new Map();
    for (const { label } of flat) counts.set(label, (counts.get(label) || 0) + 1);
    return counts;
  }, [flat]);

  const hints = filterMode
    ? 'type to filter · ⏎/Esc done'
    : '↑↓/click/wheel move · ⏎/double-click open · n new · t terminal · v view · a archive · s star · / find · A archived · p plans · 1-9 tab · x close tab · z zoom · ⇥ cycle · q quit';

  // Chrome above/below the list: app chrome (CHROME_ROWS) + header (1) +
  // search bar (3, bordered) + footer (wrapped). Everything else is the scrollable card list. Cards are 4
  // lines; a group header is 1 line (+1 spacer between groups). We pick a
  // start row that centres the selection, then greedily fill the line budget
  // WITHOUT overflowing — no clipping, so bordered cards never get cut.
  const rows = process.stdout.rows || 24;
  const budget = Math.max(4, rows - 4 - footerHeight(hints) - CHROME_ROWS);
  const perPageEstimate = Math.max(2, Math.floor(budget / 4));
  const { start } = computeViewport(flat.length, sel, perPageEstimate);

  // Let the app suspend its global single-key bindings while typing a filter.
  useEffect(() => { onFilterMode?.(filterMode); }, [filterMode]);
  useEffect(() => () => onFilterMode?.(false), []);

  const lastRef = useRef(0);
  lastRef.current = flat.length - 1;
  const clickRef = useRef({});
  clickRef.current = { sel, flat, onOpen };
  useEffect(() => {
    // Click selects; clicking the already-selected card opens it.
    const onClick = ({ row }) => {
      const idx = rowMapRef.current[row];
      if (idx == null) return;
      const { sel: cur, flat: items, onOpen: open } = clickRef.current;
      if (idx === cur && items[idx]) open(items[idx].session);
      else setSelected(idx);
    };
    const onWheel = ({ dir }) => {
      setSelected(s => Math.max(0, Math.min(s + dir, lastRef.current)));
    };
    mouseEmitter.on('click', onClick);
    mouseEmitter.on('wheel', onWheel);
    return () => {
      mouseEmitter.off('click', onClick);
      mouseEmitter.off('wheel', onWheel);
    };
  }, []);

  useInput((input, key) => {
    if (filterMode) {
      if (isMouseSeq(input)) return;
      if (key.return || key.escape) setFilterMode(false);
      else if (key.backspace || key.delete) setFilter(f => f.slice(0, -1));
      else if (input) setFilter(f => f + input);
      return;
    }
    if (input === 'q') { onQuit(); return; }
    if (key.tab) { onCycleTab(); return; }
    if (input === 'p') { onSwitchToPlans(); return; }
    if (input === '/') { setFilterMode(true); return; }
    if (input === 'A') { onToggleShowArchived(); return; }
    if (key.downArrow || input === 'j') { setSelected(Math.min(sel + 1, flat.length - 1)); return; }
    if (key.upArrow || input === 'k') { setSelected(Math.max(sel - 1, 0)); return; }
    const cur = flat[sel]?.session;
    if (!cur) return;
    if (key.return) { onOpen(cur); return; }
    if (input === 'n') { onNew(cur); return; }
    if (input === 't') { onOpenShell?.(cur); return; }
    if (input === 'v') { onView(cur); return; }
    if (input === 'a') { onArchiveToggle(cur); return; }
    if (input === 's') { onStarToggle(cur); return; }
  });

  let lastLabel = null;
  let used = 0;
  const items = [];
  // Below the app chrome: header (1 row), SearchBar bordered box (3 rows),
  // then cards.
  const rowMap = {};
  let currentRow = CHROME_ROWS + 5;
  for (let i = start; i < flat.length; i++) {
    const { session, label } = flat[i];
    const needHeader = label !== lastLabel;
    const headerCost = needHeader ? (items.length ? 2 : 1) : 0;
    if (used + headerCost + 4 > budget) break; // 4 = card height
    if (needHeader) {
      if (items.length) currentRow++; // blank separator row (marginTop={1})
      currentRow++; // group header row
      items.push(
        <Box key={`h:${label}:${i}`} marginTop={items.length ? 1 : 0}>
          <Text color="blue">▾ </Text><Text bold color="blueBright">{label}</Text>
          <Text dimColor>  {groupCounts.get(label)}</Text>
        </Box>
      );
      used += headerCost;
      lastLabel = label;
    }
    // SessionCard is a bordered box: 4 rows (border-top, line1, line2, border-bottom)
    rowMap[currentRow] = i;
    rowMap[currentRow + 1] = i;
    rowMap[currentRow + 2] = i;
    rowMap[currentRow + 3] = i;
    currentRow += 4;
    items.push(
      <SessionCard
        key={session.sessionId}
        session={session}
        selected={i === sel}
        live={liveSessionIds.has(session.sessionId)}
      />
    );
    used += 4;
  }
  rowMapRef.current = rowMap;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1}>
        <Text dimColor>
          {flat.length} session{flat.length === 1 ? '' : 's'}{showArchived ? ' · archived' : ''}
        </Text>
      </Box>
      <SearchBar active={filterMode} value={filter} />
      <Box flexDirection="column" flexGrow={1}>
        {flat.length === 0 && <Box paddingX={1}><Text dimColor>No sessions found.</Text></Box>}
        {items}
      </Box>
      <Footer hints={hints} />
    </Box>
  );
}
