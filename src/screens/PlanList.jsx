import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { mouseEmitter } from '../mouse.js';
import Footer from '../components/Footer.jsx';
import { computeViewport } from '../layout.js';
import { relativeTime } from '../time.js';

function shortPath(p) {
  const home = process.env.HOME || '';
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

function truncate(str, max) {
  if (max <= 1) return '';
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

function buildFlat(plans, tracked) {
  const flat = [];
  for (const plan of plans) flat.push({ kind: 'plan', section: 'Plan-mode plans', plan });
  for (const entry of tracked) flat.push({ kind: 'tracked', section: 'Tracked progress', entry });
  return flat;
}

function PlanCard({ item, selected }) {
  let rawTitle;
  let meta;
  if (item.kind === 'plan') {
    rawTitle = item.plan.title.replace(/\s+/g, ' ').trim();
    meta = relativeTime(item.plan.modified);
  } else {
    rawTitle = shortPath(item.entry.projectPath);
    meta = item.entry.plan ? `${item.entry.plan.done}/${item.entry.plan.total} phases` : 'todos';
  }
  // Reserve border (2), paddingX (2), and the right-aligned meta (+1 gap) so
  // the title never wraps onto a second line.
  const inner = (process.stdout.columns || 80) - 4 - meta.length - 1;
  const title = truncate(rawTitle, Math.max(4, inner));
  return (
    <Box borderStyle="round" borderColor={selected ? 'cyan' : 'gray'} paddingX={1} flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold={selected} color={selected ? 'white' : undefined}>{title}</Text>
        <Text dimColor> {meta}</Text>
      </Box>
    </Box>
  );
}

export default function PlanList({ plans, tracked, onOpenPlan, onOpenTracked, onSwitchToSessions, onCycleTab, onQuit }) {
  const [selected, setSelected] = useState(0);
  const flat = useMemo(() => buildFlat(plans, tracked), [plans, tracked]);
  const rowMapRef = useRef({});
  const sel = Math.max(0, Math.min(selected, flat.length - 1));

  const rows = process.stdout.rows || 24;
  const budget = Math.max(4, rows - 3);
  const perPageEstimate = Math.max(2, Math.floor(budget / 3));
  const { start } = computeViewport(flat.length, sel, perPageEstimate);

  useEffect(() => {
    const handler = ({ row }) => {
      const idx = rowMapRef.current[row];
      if (idx != null) setSelected(idx);
    };
    mouseEmitter.on('click', handler);
    return () => mouseEmitter.off('click', handler);
  }, []);

  useInput((input, key) => {
    if (input === 'q' || key.escape) { onQuit(); return; }
    if (key.tab) { onCycleTab(); return; }
    if (input === 's') { onSwitchToSessions(); return; }
    if (key.downArrow || input === 'j') { setSelected(Math.min(sel + 1, flat.length - 1)); return; }
    if (key.upArrow || input === 'k') { setSelected(Math.max(sel - 1, 0)); return; }
    if (key.return) {
      const item = flat[sel];
      if (!item) return;
      if (item.kind === 'plan') onOpenPlan(item.plan);
      else onOpenTracked(item.entry);
    }
  });

  let lastSection = null;
  let used = 0;
  const items = [];
  // Row 1: header; plan cards start at row 2.
  const rowMap = {};
  let currentRow = 2;
  for (let i = start; i < flat.length; i++) {
    const item = flat[i];
    const needHeader = item.section !== lastSection;
    const headerCost = needHeader ? (items.length ? 2 : 1) : 0;
    if (used + headerCost + 3 > budget) break;
    if (needHeader) {
      if (items.length) currentRow++; // blank separator row (marginTop={1})
      currentRow++; // section header row
      items.push(
        <Box key={`s:${item.section}:${i}`} marginTop={items.length ? 1 : 0}>
          <Text color="blue">▾ </Text><Text bold color="blueBright">{item.section}</Text>
        </Box>
      );
      used += headerCost;
      lastSection = item.section;
    }
    // PlanCard is a bordered box: 3 rows (border-top, content, border-bottom)
    rowMap[currentRow] = i;
    rowMap[currentRow + 1] = i;
    rowMap[currentRow + 2] = i;
    currentRow += 3;
    items.push(<PlanCard key={i} item={item} selected={i === sel} />);
    used += 3;
  }
  rowMapRef.current = rowMap;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">ALFRED</Text>
        <Text dimColor>{flat.length} plan{flat.length === 1 ? '' : 's'}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {flat.length === 0 && <Box paddingX={1}><Text dimColor>No plans found.</Text></Box>}
        {items}
      </Box>
      <Footer hints="↑↓/click move · ⏎ open · s sessions · ⇥ cycle · q quit" />
    </Box>
  );
}
