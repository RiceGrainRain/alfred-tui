import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Footer from '../components/Footer.jsx';
import { getGitStatus } from '../git.js';
import { buildDirTree } from '../dir-tree.js';
import { mouseEmitter } from '../mouse.js';

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
    for (const f of files) items.push({ kind: 'file', badge: mkBadge(f), name: typeof f === 'string' ? f : f.file, badgeColor: STATUS_COLOR[f.status] || 'gray' });
  };
  addSection('staged',   status.staged,   f => f.status);
  addSection('unstaged', status.unstaged, f => f.status);
  addSection('untracked', status.untracked, () => '??');
  return items;
}

export default function GitTree({ projects, liveSessionId, onCycleTab, onBack }) {
  const [selProj, setSelProj]         = useState(0);
  const [gitData, setGitData]         = useState({});
  const [loading, setLoading]         = useState(true);
  const [dirMode, setDirMode]         = useState(false);
  const [contentOffset, setContentOffset] = useState(0);
  const [selectedContent, setSelectedContent] = useState(-1);
  const rowMapRef = useRef({});

  const refresh = useCallback(() => {
    setLoading(true);
    const data = {};
    for (const p of projects) data[p.projectPath] = getGitStatus(p.projectPath);
    setGitData(data);
    setLoading(false);
  }, [projects]);

  useEffect(() => { refresh(); }, [refresh]);

  // Reset content scroll + selection when project or mode changes
  useEffect(() => { setContentOffset(0); setSelectedContent(-1); }, [selProj, dirMode]);

  const numProjects = projects.length;
  const sel = Math.max(0, Math.min(selProj, numProjects - 1));
  const currentProject = projects[sel];
  const status = currentProject ? gitData[currentProject.projectPath] : null;
  const clean = status && status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0;

  // Flat content items for the current view
  const contentItems = useMemo(() => {
    if (!currentProject) return [];
    if (dirMode) {
      return buildDirTree(currentProject.projectPath).map(node => ({ kind: 'dir_node', node }));
    }
    if (loading || !status) return [];
    return buildGitItems(status);
  }, [currentProject, dirMode, status, loading]);

  const rows = process.stdout.rows || 24;
  // Rows consumed: 1 header + numProjects proj rows + 1 blank + 1 branch/mode header + 1 footer
  const contentBudget = Math.max(1, rows - numProjects - 4);
  const maxOffset = Math.max(0, contentItems.length - contentBudget);
  const off = Math.min(contentOffset, maxOffset);
  const visibleItems = contentItems.slice(off, off + contentBudget);

  // Row mapping:
  //   Row 1          : header
  //   Rows 2..N+1    : project selector (1 row each)
  //   Row N+2        : blank (marginTop={1} on content section)
  //   Row N+3        : branch/mode header (always 1 row)
  //   Rows N+4..     : visible content items (1 row each)
  const rowMap = {};
  for (let i = 0; i < numProjects; i++) rowMap[2 + i] = { type: 'project', idx: i };
  const CONTENT_START = numProjects + 4; // row where content items begin (after branch header)
  for (let ci = 0; ci < visibleItems.length; ci++) rowMap[CONTENT_START + ci] = { type: 'content', visibleIdx: ci };
  rowMapRef.current = rowMap;

  useEffect(() => {
    const handler = ({ row }) => {
      const target = rowMapRef.current[row];
      if (!target) return;
      if (target.type === 'project') setSelProj(target.idx);
      else if (target.type === 'content') setSelectedContent(off + target.visibleIdx);
    };
    mouseEmitter.on('click', handler);
    return () => mouseEmitter.off('click', handler);
  }, [off]);

  useInput((input, key) => {
    if (input === 'q' || key.escape) { onBack(); return; }
    if (key.tab) { onCycleTab(); return; }
    if (input === 'r') { refresh(); return; }
    if (input === 'e') { setDirMode(d => !d); return; }
    if (key.downArrow || input === 'j') { setSelProj(s => Math.min(s + 1, numProjects - 1)); return; }
    if (key.upArrow || input === 'k') { setSelProj(s => Math.max(s - 1, 0)); return; }
    if (key.pageDown || input === ' ') { setContentOffset(o => Math.min(o + contentBudget, maxOffset)); return; }
    if (key.pageUp || input === 'b') { setContentOffset(o => Math.max(o - contentBudget, 0)); return; }
  });

  // Render a single content item row
  function renderItem(item, idx) {
    const absoluteIdx = off + idx;
    const isSelected = absoluteIdx === selectedContent;
    if (item.kind === 'section') {
      return (
        <Box key={idx} paddingLeft={2}>
          <Text dimColor>{item.label}</Text>
        </Box>
      );
    }
    if (item.kind === 'file') {
      return (
        <Box key={idx} paddingLeft={4} backgroundColor={isSelected ? 'blue' : undefined}>
          <Text color={item.badgeColor}>{item.badge} </Text>
          <Text color={isSelected ? 'white' : undefined}>{item.name}</Text>
        </Box>
      );
    }
    if (item.kind === 'dir_node') {
      const { node } = item;
      return (
        <Box key={idx} backgroundColor={isSelected ? 'blue' : undefined}>
          <Text dimColor>{node.prefix}{node.connector}</Text>
          <Text color={node.type === 'dir' ? 'blue' : undefined}>{node.icon}</Text>
          <Text color={isSelected ? 'white' : node.type === 'dir' ? 'blueBright' : undefined}>
            {node.name}
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
        <Text bold color="cyan">ALFRED</Text>
        <Text dimColor>{modeTag}</Text>
      </Box>

      {/* Project selector */}
      <Box flexDirection="column" paddingX={1}>
        {projects.map((p, i) => {
          const isLive = p.sessions.some(s => s.sessionId === liveSessionId);
          const selected = i === sel;
          const pStatus = gitData[p.projectPath];
          const hasChanges = pStatus &&
            (pStatus.staged.length + pStatus.unstaged.length + pStatus.untracked.length > 0);
          return (
            <Box key={p.projectPath}>
              <Text color={selected ? 'cyan' : 'blue'}>{selected ? '▶ ' : '  '}</Text>
              <Text bold={selected} color={selected ? 'white' : undefined}>
                {shortPath(p.projectPath)}
              </Text>
              {isLive && <Text color="green"> ●</Text>}
              {pStatus && hasChanges && <Text color="yellow"> *</Text>}
              {pStatus && !hasChanges && <Text color="green"> ✓</Text>}
            </Box>
          );
        })}
      </Box>

      {/* Content area */}
      <Box flexDirection="column" paddingX={2} flexGrow={1} marginTop={1}>
        {/* Branch / mode header row */}
        {currentProject && !dirMode && status && (
          <Box justifyContent="space-between">
            <Box>
              <Text color="blue">▾ </Text>
              <Text bold color="blueBright">{shortPath(currentProject.projectPath)}</Text>
              <Text dimColor>  [{status.branch}]</Text>
            </Box>
            <Text dimColor>{scrollHint}</Text>
          </Box>
        )}
        {currentProject && dirMode && (
          <Box justifyContent="space-between">
            <Box>
              <Text color="blue">▾ </Text>
              <Text bold color="blueBright">{shortPath(currentProject.projectPath)}</Text>
            </Box>
            <Text dimColor>{scrollHint}</Text>
          </Box>
        )}

        {/* Content rows */}
        {loading && !dirMode && <Text dimColor>Loading…</Text>}
        {!loading && currentProject && !dirMode && !status && <Text dimColor>not a git repo</Text>}
        {!loading && currentProject && !dirMode && clean && <Text dimColor paddingLeft={2}>✓ clean</Text>}
        {visibleItems.map((item, idx) => renderItem(item, idx))}
      </Box>

      <Footer hints="↑↓/click project · space/b scroll · e dir · r refresh · ⇥ next · q back" />
    </Box>
  );
}
