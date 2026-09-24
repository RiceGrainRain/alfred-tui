import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import path from 'path';
import Footer from '../components/Footer.jsx';
import { getGitStatus } from '../git.js';
import { buildTree, flattenTree, readDirLevel } from '../dir-tree.js';
import { mouseEmitter } from '../mouse.js';
import { CHROME_ROWS, computeViewport, footerHeight } from '../layout.js';

function shortPath(p) {
  const home = process.env.HOME || '';
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

const STATUS_COLOR = { M: 'yellow', A: 'green', D: 'red', R: 'cyan', C: 'cyan', U: 'magenta' };

// Build a flat list of content items for git-status view.
function buildGitItems(status) {
  if (!status) return [];
  const items = [];
  const addSection = (label, files, mkBadge) => {
    if (!files || files.length === 0) return;
    items.push({ kind: 'section', label: `${label} (${files.length})` });
    for (const f of files) items.push({ kind: 'file', badge: mkBadge(f), name: typeof f === 'string' ? f : f.file, badgeColor: STATUS_COLOR[f.status] || 'gray', untracked: typeof f === 'string' });
  };
  addSection('staged',   status.staged,   f => f.status);
  addSection('unstaged', status.unstaged, f => f.status);
  addSection('untracked', status.untracked, () => '??');
  return items;
}

const isSelectable = (item) => item && item.kind !== 'section';

export default function GitTree({ projects, liveSessionIds, onOpenFile, onOpenDiff, onOpenShell, onOpenCommit, onCycleTab, onBack }) {
  const [selProj, setSelProj]         = useState(0);
  const [gitData, setGitData]         = useState({});
  const [loading, setLoading]         = useState(true);
  const [dirMode, setDirMode]         = useState(false);
  const [contentOffset, setContentOffset] = useState(0);
  const [cursor, setCursor]           = useState(-1);
  const [focus, setFocus]             = useState('projects'); // projects | content
  const [expanded, setExpanded]       = useState(() => new Set());
  const [treeTick, setTreeTick]       = useState(0); // bump to re-read the filesystem
  const levelCache = useRef(new Map());
  const stateRef = useRef({});

  const refresh = useCallback(() => {
    setLoading(true);
    const data = {};
    for (const p of projects) data[p.projectPath] = getGitStatus(p.projectPath);
    setGitData(data);
    setLoading(false);
    levelCache.current.clear();
    setTreeTick(t => t + 1);
  }, [projects]);

  useEffect(() => { refresh(); }, [refresh]);

  // Reset content scroll + cursor when project or mode changes; collapse the
  // tree when switching projects.
  useEffect(() => { setContentOffset(0); setCursor(-1); }, [selProj, dirMode]);
  useEffect(() => { setExpanded(new Set()); }, [selProj]);

  const numProjects = projects.length;
  const sel = Math.max(0, Math.min(selProj, numProjects - 1));
  const currentProject = projects[sel];
  const status = currentProject ? gitData[currentProject.projectPath] : null;
  const clean = status && status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0;

  // Flat content items for the current view
  const contentItems = useMemo(() => {
    if (!currentProject) return [];
    if (dirMode) {
      const readLevel = (dir) => {
        const cache = levelCache.current;
        if (!cache.has(dir)) cache.set(dir, readDirLevel(dir));
        return cache.get(dir);
      };
      const tree = buildTree(currentProject.projectPath, expanded, readLevel);
      return flattenTree(tree, expanded).map(node => ({ kind: 'dir_node', node }));
    }
    if (loading || !status) return [];
    return buildGitItems(status);
  }, [currentProject, dirMode, status, loading, expanded, treeTick]);

  // Vertical layout below the app chrome:
  //   header (1) · project list (projRows) · blank (1) · branch header (1)
  //   · content (contentBudget) · footer (wrapped)
  // The project list is capped so a long list can't starve the tree.
  const rows = process.stdout.rows || 24;
  const projRows = Math.min(numProjects, Math.max(3, Math.floor((rows - CHROME_ROWS) / 3)));
  const { start: projStart } = computeViewport(numProjects, sel, projRows);
  const visibleProjects = projects.slice(projStart, projStart + projRows);
  const hints = '↑↓ move · ←→ projects/files · ⏎/double-click open · d diff · t terminal · C commit · e dir/git · r refresh · wheel scroll · space/b page · z zoom · 1-9 tab · x close tab · ⇥ next · q back';
  const contentBudget = Math.max(1, rows - CHROME_ROWS - projRows - 3 - footerHeight(hints));
  const maxOffset = Math.max(0, contentItems.length - contentBudget);
  const off = Math.min(contentOffset, maxOffset);
  const visibleItems = contentItems.slice(off, off + contentBudget);

  const PROJ_START = CHROME_ROWS + 2;
  const CONTENT_START = PROJ_START + projRows + 2;
  const rowMap = {};
  for (let i = 0; i < visibleProjects.length; i++) rowMap[PROJ_START + i] = { type: 'project', idx: projStart + i };
  for (let ci = 0; ci < visibleItems.length; ci++) rowMap[CONTENT_START + ci] = { type: 'content', idx: off + ci };

  const toggleDir = (dirPath) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath); else next.add(dirPath);
      return next;
    });
  };

  const absPath = (item) => {
    if (item.kind === 'dir_node') return item.node.path;
    return path.join(status?.root || currentProject.projectPath, item.name);
  };

  // Enter / second click on a content row: dirs toggle, files open in a tab.
  const activate = (idx) => {
    const item = contentItems[idx];
    if (!isSelectable(item)) return;
    if (item.kind === 'dir_node' && item.node.type === 'dir') { toggleDir(item.node.path); return; }
    onOpenFile(absPath(item));
  };

  // Move the content cursor, skipping section labels, and scroll it into view.
  const moveCursor = (delta) => {
    let i = cursor < 0 ? (delta > 0 ? -1 : contentItems.length) : cursor;
    do { i += delta; } while (i >= 0 && i < contentItems.length && !isSelectable(contentItems[i]));
    if (i < 0 || i >= contentItems.length) return;
    setCursor(i);
    setContentOffset(o => {
      const cur = Math.min(o, maxOffset);
      if (i < cur) return i;
      if (i >= cur + contentBudget) return i - contentBudget + 1;
      return cur;
    });
  };

  stateRef.current = { rowMap, contentItems, cursor, off, maxOffset, numProjects, CONTENT_START, activate, toggleDir };

  useEffect(() => {
    const onClick = ({ row }) => {
      const s = stateRef.current;
      const target = s.rowMap[row];
      if (!target) return;
      if (target.type === 'project') { setSelProj(target.idx); setFocus('projects'); return; }
      const item = s.contentItems[target.idx];
      if (!isSelectable(item)) return;
      setFocus('content');
      if (item.kind === 'dir_node' && item.node.type === 'dir') {
        setCursor(target.idx);
        s.toggleDir(item.node.path);
      } else if (s.cursor === target.idx) {
        s.activate(target.idx);
      } else {
        setCursor(target.idx);
      }
    };
    const onWheel = ({ row, dir }) => {
      const s = stateRef.current;
      if (s.rowMap[row]?.type === 'project') {
        setSelProj(p => Math.max(0, Math.min(p + dir, s.numProjects - 1)));
      } else if (row >= s.CONTENT_START - 1) {
        setContentOffset(o => Math.max(0, Math.min(Math.min(o, s.maxOffset) + dir * 3, s.maxOffset)));
      }
    };
    mouseEmitter.on('click', onClick);
    mouseEmitter.on('wheel', onWheel);
    return () => {
      mouseEmitter.off('click', onClick);
      mouseEmitter.off('wheel', onWheel);
    };
  }, []);

  useInput((input, key) => {
    if (input === 'q' || key.escape) { onBack(); return; }
    if (key.tab) { onCycleTab(); return; }
    if (input === 'r') { refresh(); return; }
    if (input === 'e') { setDirMode(d => !d); return; }
    if (key.leftArrow || input === 'h') { setFocus('projects'); return; }
    if (key.rightArrow || input === 'l') { setFocus('content'); if (cursor < 0) moveCursor(1); return; }
    if (key.pageDown || input === ' ') { setContentOffset(o => Math.min(Math.min(o, maxOffset) + contentBudget, maxOffset)); return; }
    if (key.pageUp || input === 'b') { setContentOffset(o => Math.max(Math.min(o, maxOffset) - contentBudget, 0)); return; }
    // t and C always apply to the current project regardless of which side has focus
    if (input === 't') { if (currentProject) onOpenShell?.(currentProject.projectPath); return; }
    if (input === 'C') { if (currentProject) onOpenCommit?.(status?.root || currentProject.projectPath); return; }
    if (focus === 'projects') {
      if (key.downArrow || input === 'j') { setSelProj(s => Math.min(s + 1, numProjects - 1)); return; }
      if (key.upArrow || input === 'k') { setSelProj(s => Math.max(s - 1, 0)); return; }
      if (key.return) { setFocus('content'); if (cursor < 0) moveCursor(1); return; }
      return;
    }
    if (key.downArrow || input === 'j') { moveCursor(1); return; }
    if (key.upArrow || input === 'k') { moveCursor(-1); return; }
    if (key.return || input === 'o') { activate(cursor); return; }
    if (input === 'd' && !dirMode) {
      const item = contentItems[cursor];
      if (item?.kind === 'file' && !item.untracked) onOpenDiff(status.root, item.name);
      return;
    }
  });

  // Render a single content item row. Every row is one <Text> with
  // wrap="truncate-end" so long paths never wrap and break the row map.
  function renderItem(item, idx) {
    const absoluteIdx = off + idx;
    const isCursor = absoluteIdx === cursor;
    const bg = isCursor ? (focus === 'content' ? 'blue' : 'gray') : undefined;
    if (item.kind === 'section') {
      return (
        <Box key={idx} paddingLeft={2}>
          <Text dimColor wrap="truncate-end">{item.label}</Text>
        </Box>
      );
    }
    if (item.kind === 'file') {
      return (
        <Box key={idx} paddingLeft={4} backgroundColor={bg}>
          <Text wrap="truncate-end">
            <Text color={item.badgeColor}>{item.badge} </Text>
            <Text color={isCursor ? 'white' : undefined}>{item.name}</Text>
          </Text>
        </Box>
      );
    }
    if (item.kind === 'dir_node') {
      const { node } = item;
      const isDir = node.type === 'dir';
      return (
        <Box key={idx} backgroundColor={bg}>
          <Text wrap="truncate-end">
            <Text dimColor>{node.prefix}{node.connector}</Text>
            <Text color={isDir ? 'blue' : undefined}>{node.icon}</Text>
            <Text color={isCursor ? 'white' : isDir ? 'blueBright' : undefined}>{node.name}</Text>
            {isDir && <Text dimColor>{node.expanded ? ' ▾' : ' ▸'}</Text>}
          </Text>
        </Box>
      );
    }
    return null;
  }

  const modeTag = dirMode ? '[dir]' : '[git]';
  const scrollHint = maxOffset > 0 ? `  ${off + 1}-${off + visibleItems.length}/${contentItems.length}` : '';

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box paddingX={1} justifyContent="space-between">
        <Text dimColor>{numProjects} project{numProjects === 1 ? '' : 's'}</Text>
        <Text dimColor>{modeTag}</Text>
      </Box>

      {/* Project selector */}
      <Box flexDirection="column" paddingX={1}>
        {visibleProjects.map((p, vi) => {
          const i = projStart + vi;
          const isLive = p.sessions.some(s => liveSessionIds.has(s.sessionId));
          const selected = i === sel;
          const pStatus = gitData[p.projectPath];
          const hasChanges = pStatus &&
            (pStatus.staged.length + pStatus.unstaged.length + pStatus.untracked.length > 0);
          return (
            <Text key={p.projectPath} wrap="truncate-end">
              <Text color={selected ? 'cyan' : 'blue'}>{selected ? '▶ ' : '  '}</Text>
              <Text bold={selected} color={selected ? (focus === 'projects' ? 'white' : 'gray') : undefined}>
                {shortPath(p.projectPath)}
              </Text>
              {isLive && <Text color="green"> ●</Text>}
              {pStatus && hasChanges && <Text color="yellow"> *</Text>}
              {pStatus && !hasChanges && <Text color="green"> ✓</Text>}
            </Text>
          );
        })}
      </Box>

      {/* Content area */}
      <Box flexDirection="column" paddingX={2} flexGrow={1} marginTop={1}>
        {/* Branch / mode header row */}
        {currentProject && (dirMode || status) && (
          <Box justifyContent="space-between">
            <Text wrap="truncate-end">
              <Text color="blue">▾ </Text>
              <Text bold color="blueBright">{shortPath(currentProject.projectPath)}</Text>
              {!dirMode && <Text dimColor>  [{status.branch}]</Text>}
            </Text>
            <Text dimColor>{scrollHint}</Text>
          </Box>
        )}

        {/* Content rows */}
        {loading && !dirMode && <Text dimColor>Loading…</Text>}
        {!loading && currentProject && !dirMode && !status && <Text dimColor>not a git repo</Text>}
        {!loading && currentProject && !dirMode && clean && <Text dimColor>  ✓ clean</Text>}
        {visibleItems.map((item, idx) => renderItem(item, idx))}
      </Box>

      <Footer hints={hints} />
    </Box>
  );
}
