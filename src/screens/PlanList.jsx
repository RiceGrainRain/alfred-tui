import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Footer from '../components/Footer.jsx';

function shortPath(p) {
  const home = process.env.HOME || '';
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

function buildRows(plans, tracked) {
  const rows = [];
  if (plans.length) {
    rows.push({ type: 'section', key: 's:plans', label: 'Plan-mode plans (~/.claude/plans)' });
    for (const plan of plans) {
      rows.push({ type: 'plan', key: `p:${plan.filename}`, plan });
    }
  }
  if (tracked.length) {
    rows.push({ type: 'section', key: 's:tracked', label: 'Tracked progress' });
    for (const entry of tracked) {
      rows.push({ type: 'tracked', key: `t:${entry.projectPath}`, entry });
    }
  }
  return rows;
}

export default function PlanList({ plans, tracked, onOpenPlan, onOpenTracked, onSwitchToSessions, onQuit }) {
  const [selected, setSelected] = useState(0);
  const rows = useMemo(() => buildRows(plans, tracked), [plans, tracked]);
  const openableIndexes = useMemo(
    () => rows.map((r, i) => (r.type === 'section' ? -1 : i)).filter(i => i !== -1),
    [rows]
  );
  const clampedSelected = openableIndexes.includes(selected) ? selected : (openableIndexes[0] ?? -1);

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      onQuit();
      return;
    }
    if (key.tab || input === 's') {
      onSwitchToSessions();
      return;
    }
    const pos = openableIndexes.indexOf(clampedSelected);
    if ((key.downArrow || input === 'j') && pos !== -1) {
      const next = openableIndexes[Math.min(pos + 1, openableIndexes.length - 1)];
      if (next !== undefined) setSelected(next);
      return;
    }
    if ((key.upArrow || input === 'k') && pos !== -1) {
      const prev = openableIndexes[Math.max(pos - 1, 0)];
      if (prev !== undefined) setSelected(prev);
      return;
    }
    if (key.return && clampedSelected !== -1) {
      const row = rows[clampedSelected];
      if (row.type === 'plan') onOpenPlan(row.plan);
      else if (row.type === 'tracked') onOpenTracked(row.entry);
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1}>
        <Text bold color="cyan">Plans</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {rows.length === 0 && <Text dimColor>No plans found.</Text>}
        {rows.map((row, i) => {
          if (row.type === 'section') {
            return (
              <Box key={row.key} marginTop={1}>
                <Text bold color="yellow">{row.label}</Text>
              </Box>
            );
          }
          const isSelected = i === clampedSelected;
          const label = row.type === 'plan'
            ? row.plan.title
            : `${shortPath(row.entry.projectPath)}${row.entry.plan ? `  (${row.entry.plan.done}/${row.entry.plan.total} phases)` : ''}`;
          return (
            <Box key={row.key}>
              <Text color={isSelected ? 'black' : undefined} backgroundColor={isSelected ? 'cyan' : undefined}>
                {'  '}{label}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Footer hints="↑/k ↓/j move  Enter open  Tab sessions  q quit" />
    </Box>
  );
}
