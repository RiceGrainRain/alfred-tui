import React, { useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { mouseEmitter } from '../mouse.js';
import { layoutTabStrip, hitSegment } from '../layout.js';

const ROOT_TABS = [
  { key: 'sessions', label: 'Sessions' },
  { key: 'plans', label: 'Plans' },
  { key: 'git', label: 'Git' },
];

// Two rows rendered above every screen (see CHROME_ROWS in layout.js):
//   row 1: root tabs  — Sessions │ Plans │ Git
//   row 2: work tabs  — one per pane in the work area, plus × to close the active one
// Both are clickable; column ranges come from layoutTabStrip so rendering
// and hit-testing can't drift apart.
export default function Chrome({ rootTab, onRootTab, tabs, activeTabId, onSelectTab, onCloseTab }) {
  const cols = process.stdout.columns || 80;

  const rootSegs = layoutTabStrip(ROOT_TABS.map(t => t.label), cols - 2, 0, 2);
  const activeIdx = Math.max(0, tabs.findIndex(t => t.id === activeTabId));
  // Reserve 2 columns for the trailing " ×".
  const workSegs = layoutTabStrip(tabs.map((t, i) => `${i + 1} ${t.label}`), cols - 4, activeIdx, 2);
  const closeCol = workSegs.length ? workSegs[workSegs.length - 1].end + 2 : null;

  const stateRef = useRef();
  stateRef.current = { rootSegs, workSegs, closeCol, tabs, onRootTab, onSelectTab, onCloseTab };

  useEffect(() => {
    const handler = ({ row, col }) => {
      const s = stateRef.current;
      if (row === 1) {
        const hit = hitSegment(s.rootSegs, col);
        if (hit) s.onRootTab(ROOT_TABS[hit.index].key);
      } else if (row === 2) {
        if (s.closeCol != null && col === s.closeCol) { s.onCloseTab(); return; }
        const hit = hitSegment(s.workSegs, col);
        if (hit) s.onSelectTab(s.tabs[hit.index].id);
      }
    };
    mouseEmitter.on('click', handler);
    return () => mouseEmitter.off('click', handler);
  }, []);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text wrap="truncate-end">
        {rootSegs.map((seg, i) => {
          const active = ROOT_TABS[seg.index].key === rootTab;
          return (
            <Text key={seg.index}>
              {i > 0 ? ' ' : ''}
              <Text bold={active} color={active ? 'black' : 'gray'} backgroundColor={active ? 'cyan' : undefined}>
                {seg.text}
              </Text>
            </Text>
          );
        })}
      </Text>
      <Text wrap="truncate-end">
        {workSegs.length === 0 && <Text dimColor> no open tabs — ⏎ on a session opens one</Text>}
        {workSegs.map((seg, i) => {
          const active = tabs[seg.index].id === activeTabId;
          return (
            <Text key={tabs[seg.index].id}>
              {i > 0 ? ' ' : ''}
              <Text color={active ? 'black' : undefined} backgroundColor={active ? 'green' : 'gray'}>
                {seg.text}
              </Text>
            </Text>
          );
        })}
        {workSegs.length > 0 && <Text color="red"> ×</Text>}
      </Text>
    </Box>
  );
}
