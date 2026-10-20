import React, { useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { C } from '../theme.js';
import { mouseEmitter } from '../mouse.js';
import { layoutTabStrip, hitSegment } from '../layout.js';

const ROOT_TABS = [
  { key: 'sessions', label: 'Sessions' },
  { key: 'plans', label: 'Plans' },
  { key: 'git', label: 'Git' },
];

// Two rows rendered above every screen (see CHROME_ROWS in layout.js):
//   row 1: root tabs  — Sessions │ Plans │ Git
//   row 2: work tabs  — one per open tab, plus × to close the active one
// A work tab is green when it's the focused pane, cyan when it's on screen
// next to it in a split, and grey when it's parked in the stash.
// Both rows are clickable; column ranges come from layoutTabStrip so
// rendering and hit-testing can't drift apart.
export default function Chrome({
  rootTab, onRootTab, tabs, activeTabId, visibleIds = [], splitDir, onSelectTab, onCloseTab,
}) {
  const cols = process.stdout.columns || 80;
  const onScreen = new Set(visibleIds);

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
              <Text bold={active} color={active ? C.black : C.gray} backgroundColor={active ? C.cyan : undefined}>
                {seg.text}
              </Text>
            </Text>
          );
        })}
      </Text>
      <Text wrap="truncate-end">
        {workSegs.length === 0 && <Text dimColor> no open tabs — ⏎ on a session opens one</Text>}
        {workSegs.map((seg, i) => {
          const id = tabs[seg.index].id;
          const active = id === activeTabId;
          const shown = onScreen.has(id);
          return (
            <Text key={id}>
              {i > 0 ? ' ' : ''}
              <Text
                color={active || shown ? C.black : undefined}
                backgroundColor={active ? C.green : shown ? C.cyan : C.gray}
              >
                {seg.text}
              </Text>
            </Text>
          );
        })}
        {workSegs.length > 0 && <Text color={C.red}> ×</Text>}
        {splitDir && (
          <Text color={C.yellow} bold>
            {'  '}split {splitDir === 'h' ? '│' : '─'} pick a tab
          </Text>
        )}
      </Text>
    </Box>
  );
}
