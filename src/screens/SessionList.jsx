import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { mouseEmitter, isMouseSeq } from '../mouse.js';
import Footer from '../components/Footer.jsx';
import SearchBar from '../components/SearchBar.jsx';
import SessionCard from '../components/SessionCard.jsx';
import { CHROME_ROWS, footerHeight } from '../layout.js';

function sessionLabel(session) {
  return session.name || session.aiTitle || session.summary || session.sessionId;
}

// Last two path segments, e.g. /Users/me/projects/p/alfred -> "p/alfred".
function groupLabel(projectPath) {
  const parts = projectPath.split('/').filter(Boolean);
  return parts.slice(-2).join('/') || projectPath;
}

// One entry per selectable row: a project header, then (unless the project
// is collapsed) its sessions. While a filter is active every group is shown
// expanded so matches are never hidden.
function buildRows(projects, filter, collapsed) {
  const needle = filter.trim().toLowerCase();
  const rows = [];
  for (const project of projects) {
    const { projectPath } = project;
    const label = groupLabel(projectPath);
    const sessions = needle
      ? project.sessions.filter(s =>
          sessionLabel(s).toLowerCase().includes(needle) ||
          label.toLowerCase().includes(needle))
      : project.sessions;
    if (sessions.length === 0) continue;
    const isCollapsed = !needle && collapsed.has(projectPath);
    const headerIdx = rows.length;
    rows.push({ kind: 'header', projectPath, label, sessions, collapsed: isCollapsed });
    if (isCollapsed) continue;
    for (const session of sessions) rows.push({ kind: 'session', session, projectPath, label, headerIdx });
  }
  return rows;
}

const HEADER_H = 1;
const CARD_H = 4; // SessionCard: border-top, title, meta, border-bottom

export default function SessionList({
  projects, showArchived, liveSessionIds, collapsed, onCollapsedChange,
  onToggleShowArchived, onArchiveToggle, onStarToggle, onOpen, onNew, onView,
  onOpenShell, onSwitchToPlans, onCycleTab, onFilterMode, onQuit,
}) {
  const [selected, setSelected] = useState(0);
  const [filterMode, setFilterMode] = useState(false);
  const [filter, setFilter] = useState('');
  const rowMapRef = useRef({});

  const rows = useMemo(() => buildRows(projects, filter, collapsed), [projects, filter, collapsed]);
  const sel = Math.max(0, Math.min(selected, rows.length - 1));
  const sessionCount = useMemo(
    () => rows.reduce((n, r) => n + (r.kind === 'header' ? r.sessions.length : 0), 0),
    [rows]
  );

  // Collapse/expand one project. Collapsing from one of its sessions moves
  // the selection to the header — rows above it don't change, so its index holds.
  const setGroup = (row, collapse) => {
    if (!row) return;
    const next = new Set(collapsed);
    if (collapse) next.add(row.projectPath); else next.delete(row.projectPath);
    onCollapsedChange(next);
    if (collapse && row.kind === 'session') setSelected(row.headerIdx);
  };
  const isCollapsedRow = (row) => row.kind === 'header' ? row.collapsed : false;
  const toggleGroup = (row) => row && setGroup(row, !(row.kind === 'header' && row.collapsed));
  const toggleAll = () => {
    const anyExpanded = rows.some(r => r.kind === 'header' && !r.collapsed);
    onCollapsedChange(anyExpanded ? new Set(projects.map(p => p.projectPath)) : new Set());
    const cur = rows[sel];
    if (anyExpanded && cur?.kind === 'session') {
      // Headers above keep their order; count them to find the new index.
      setSelected(rows.slice(0, cur.headerIdx).filter(r => r.kind === 'header').length);
    }
  };

  const hints = filterMode
    ? 'type to filter · ⏎/Esc done'
    : '↑↓/click/wheel move · ⏎/double-click open · ←→/c collapse · C collapse all · n new · t terminal · v view · a archive · s star · / find · A archived · p plans · 1-9 tab · x close tab · z zoom · ⇥ cycle · q quit';

  // Chrome above/below the list: app chrome (CHROME_ROWS) + header (1) +
  // search bar (3, bordered) + footer (wrapped). Everything else is the
  // scrollable list: cards are 4 lines, a project header 1 line (+1 spacer
  // between groups). Walk back from the selection up to half the budget to
  // pick the first row, then greedily fill WITHOUT overflowing — no clipping,
  // so bordered cards never get cut and the selection is always on screen.
  const termRows = process.stdout.rows || 24;
  const budget = Math.max(CARD_H + 1, termRows - 4 - footerHeight(hints) - CHROME_ROWS);
  const approxH = (r) => (r.kind === 'header' ? HEADER_H + 1 : CARD_H);
  let start = sel;
  if (rows.length) {
    let above = 0;
    while (start > 0 && above + approxH(rows[start - 1]) <= Math.floor(budget / 2) - CARD_H) {
      start--;
      above += approxH(rows[start]);
    }
  }

  // Let the app suspend its global single-key bindings while typing a filter.
  useEffect(() => { onFilterMode?.(filterMode); }, [filterMode]);
  useEffect(() => () => onFilterMode?.(false), []);

  const lastRef = useRef(0);
  lastRef.current = rows.length - 1;
  const clickRef = useRef({});
  clickRef.current = { sel, rows, onOpen, toggleGroup };
  useEffect(() => {
    // Click a header: select + toggle. Click a card: select; click the
    // already-selected card: open it.
    const onClick = ({ row }) => {
      const idx = rowMapRef.current[row];
      if (idx == null) return;
      const { sel: cur, rows: items, onOpen: open, toggleGroup: toggle } = clickRef.current;
      const item = items[idx];
      if (!item) return;
      setSelected(idx);
      if (item.kind === 'header') toggle(item);
      else if (idx === cur) open(item.session);
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
    if (key.downArrow || input === 'j') { setSelected(Math.min(sel + 1, rows.length - 1)); return; }
    if (key.upArrow || input === 'k') { setSelected(Math.max(sel - 1, 0)); return; }
    if (input === 'C') { toggleAll(); return; }
    const row = rows[sel];
    if (!row) return;
    if (key.leftArrow || input === 'h') { setGroup(row, true); return; }
    if (key.rightArrow || input === 'l') { if (isCollapsedRow(row)) setGroup(row, false); return; }
    if (input === 'c') { toggleGroup(row); return; }
    // n / t act on the project, so they work on headers too.
    if (input === 'n') { onNew({ projectPath: row.projectPath }); return; }
    if (input === 't') { onOpenShell?.({ projectPath: row.projectPath }); return; }
    if (row.kind === 'header') {
      if (key.return) toggleGroup(row);
      return;
    }
    const cur = row.session;
    if (key.return) { onOpen(cur); return; }
    if (input === 'v') { onView(cur); return; }
    if (input === 'a') { onArchiveToggle(cur); return; }
    if (input === 's') { onStarToggle(cur); return; }
  });

  const renderHeader = (row, idx, key, spaced) => {
    const selectedHeader = idx === sel;
    const live = row.sessions.some(x => liveSessionIds.has(x.sessionId));
    return (
      <Box key={key} marginTop={spaced ? 1 : 0}>
        <Text wrap="truncate-end">
          <Text color={selectedHeader ? 'cyan' : 'blue'}>{row.collapsed ? '▸ ' : '▾ '}</Text>
          <Text bold color={selectedHeader ? 'black' : 'blueBright'} backgroundColor={selectedHeader ? 'cyan' : undefined}>
            {row.label}
          </Text>
          <Text dimColor>  {row.sessions.length}</Text>
          {row.collapsed && live && <Text color="green"> ●</Text>}
        </Text>
      </Box>
    );
  };

  let used = 0;
  const items = [];
  // Below the app chrome: header (1 row), SearchBar bordered box (3 rows),
  // then the list.
  const rowMap = {};
  let currentRow = CHROME_ROWS + 5;
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    const spaced = items.length > 0;
    if (row.kind === 'header') {
      const cost = HEADER_H + (spaced ? 1 : 0);
      if (used + cost > budget) break;
      if (spaced) currentRow++; // blank separator row (marginTop={1})
      rowMap[currentRow++] = i;
      items.push(renderHeader(row, i, `h:${row.projectPath}`, spaced));
      used += cost;
      continue;
    }
    // A list that starts mid-group gets its project header for context
    // (clicking it targets the real header row).
    const needContext = items.length === 0;
    if (used + CARD_H + (needContext ? HEADER_H : 0) > budget) break;
    if (needContext) {
      rowMap[currentRow++] = row.headerIdx;
      items.push(renderHeader(rows[row.headerIdx], row.headerIdx, `ctx:${row.projectPath}`, false));
      used += HEADER_H;
    }
    for (let r = 0; r < CARD_H; r++) rowMap[currentRow + r] = i;
    currentRow += CARD_H;
    items.push(
      <SessionCard
        key={row.session.sessionId}
        session={row.session}
        selected={i === sel}
        live={liveSessionIds.has(row.session.sessionId)}
      />
    );
    used += CARD_H;
  }
  rowMapRef.current = rowMap;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1}>
        <Text dimColor>
          {sessionCount} session{sessionCount === 1 ? '' : 's'}{showArchived ? ' · archived' : ''}
        </Text>
      </Box>
      <SearchBar active={filterMode} value={filter} />
      <Box flexDirection="column" flexGrow={1}>
        {rows.length === 0 && <Box paddingX={1}><Text dimColor>No sessions found.</Text></Box>}
        {items}
      </Box>
      <Footer hints={hints} />
    </Box>
  );
}
