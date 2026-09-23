import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Footer from '../components/Footer.jsx';
import { readPlanModePlan } from '../plans.js';
import { renderMarkdown } from '../markdown.js';
import { copyToClipboard } from '../clipboard.js';

function shortPath(p) {
  const home = process.env.HOME || '';
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

function TrackedView({ entry }) {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{shortPath(entry.projectPath)}</Text>
      {entry.plan && entry.plan.phases.map((phase, i) => (
        <Box key={i} flexDirection="column" marginTop={1}>
          <Text color={phase.done ? 'green' : undefined}>
            {phase.done ? '✓' : '○'} {phase.title}
          </Text>
          {phase.items.map((item, j) => (
            <Text key={j}>  {item.done ? '✓' : '○'} {item.text}</Text>
          ))}
        </Box>
      ))}
      {entry.todos.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">Todos</Text>
          {entry.todos.map((item, i) => (
            <Text key={i}>{item.done ? '✓' : '○'} {item.text}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default function PlanDetail({ plan, trackedEntry, onBack }) {
  const [offset, setOffset] = useState(0);
  const [copied, setCopied] = useState(null); // null | 'ok' | 'err'

  const lines = useMemo(() => {
    if (!plan) return [];
    return renderMarkdown(readPlanModePlan(plan.filename)).split('\n');
  }, [plan]);

  const rows = process.stdout.rows || 24;
  const pageHeight = Math.max(3, rows - 3); // title (1) + footer (1) + slack
  const maxOffset = Math.max(0, lines.length - pageHeight);
  const off = Math.min(offset, maxOffset);

  useInput((input, key) => {
    if (input === 'q' || key.escape) { onBack(); return; }
    if (!plan) return;
    if (key.downArrow || input === 'j') { setOffset(o => Math.min(o + 1, maxOffset)); return; }
    if (key.upArrow || input === 'k') { setOffset(o => Math.max(o - 1, 0)); return; }
    if (key.pageDown || input === ' ') { setOffset(o => Math.min(o + pageHeight, maxOffset)); return; }
    if (key.pageUp || input === 'b') { setOffset(o => Math.max(o - pageHeight, 0)); return; }
    if (input === 'g') { setOffset(0); return; }
    if (input === 'G') { setOffset(maxOffset); return; }
    if (input === 'c') {
      try {
        copyToClipboard(readPlanModePlan(plan.filename));
        setCopied('ok');
        setTimeout(() => setCopied(null), 1500);
      } catch {
        setCopied('err');
        setTimeout(() => setCopied(null), 1500);
      }
    }
  });

  if (trackedEntry) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box paddingX={1} flexGrow={1}><TrackedView entry={trackedEntry} /></Box>
        <Footer hints="q/Esc back" />
      </Box>
    );
  }

  const visible = lines.slice(off, off + pageHeight);
  const more = maxOffset > 0 ? `  (${off + 1}-${off + visible.length}/${lines.length})` : '';

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color="cyan" wrap="truncate-end">{plan ? plan.title : ''}</Text>
        <Text dimColor>{more}</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {visible.map((l, i) => <Text key={off + i}>{l || ' '}</Text>)}
      </Box>
      <Footer hints={
        copied === 'ok' ? '✓ Copied!' :
        copied === 'err' ? '✗ Copy failed' :
        '↑↓ scroll · space/b page · g/G top/bottom · c copy · q/Esc back'
      } />
    </Box>
  );
}
