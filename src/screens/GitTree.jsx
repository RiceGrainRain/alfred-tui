import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Footer from '../components/Footer.jsx';
import { getGitStatus } from '../git.js';

function shortPath(p) {
  const home = process.env.HOME || '';
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

const STATUS_COLOR = { M: 'yellow', A: 'green', D: 'red', R: 'cyan', C: 'cyan', U: 'magenta' };

function FileList({ label, items, renderFile }) {
  if (!items || items.length === 0) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box paddingLeft={2}>
        <Text dimColor>{label} </Text><Text dimColor>({items.length})</Text>
      </Box>
      {items.map((f, i) => (
        <Box key={i} paddingLeft={4}>{renderFile(f)}</Box>
      ))}
    </Box>
  );
}

export default function GitTree({ projects, liveSessionId, onCycleTab, onBack }) {
  const [selProj, setSelProj] = useState(0);
  const [gitData, setGitData] = useState({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    const data = {};
    for (const p of projects) data[p.projectPath] = getGitStatus(p.projectPath);
    setGitData(data);
    setLoading(false);
  }, [projects]);

  useEffect(() => { refresh(); }, [refresh]);

  const numProjects = projects.length;
  const sel = Math.max(0, Math.min(selProj, numProjects - 1));
  const currentProject = projects[sel];
  const status = currentProject ? gitData[currentProject.projectPath] : null;
  const clean = status && status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0;

  useInput((input, key) => {
    if (input === 'q' || key.escape) { onBack(); return; }
    if (key.tab) { onCycleTab(); return; }
    if (input === 'r') { refresh(); return; }
    if (key.downArrow || input === 'j') { setSelProj(s => Math.min(s + 1, numProjects - 1)); return; }
    if (key.upArrow || input === 'k') { setSelProj(s => Math.max(s - 1, 0)); return; }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">ALFRED</Text>
        <Text dimColor>[git]</Text>
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
              {hasChanges && <Text color="yellow"> *</Text>}
              {pStatus && !hasChanges && <Text color="green"> ✓</Text>}
            </Box>
          );
        })}
      </Box>

      {/* Git status for selected project */}
      <Box flexDirection="column" paddingX={2} flexGrow={1} marginTop={1}>
        {loading && <Text dimColor>Loading…</Text>}
        {!loading && !currentProject && <Text dimColor>No projects.</Text>}
        {!loading && currentProject && !status && <Text dimColor>not a git repo</Text>}
        {!loading && status && (
          <Box flexDirection="column">
            <Box>
              <Text color="blue">▾ </Text>
              <Text bold color="blueBright">{shortPath(currentProject.projectPath)}</Text>
              <Text dimColor>  [{status.branch}]</Text>
            </Box>
            {clean && <Text dimColor paddingLeft={2}>✓ clean</Text>}
            <FileList
              label="staged"
              items={status.staged}
              renderFile={f => (
                <>
                  <Text color={STATUS_COLOR[f.status] || 'white'}>{f.status} </Text>
                  <Text>{f.file}</Text>
                </>
              )}
            />
            <FileList
              label="unstaged"
              items={status.unstaged}
              renderFile={f => (
                <>
                  <Text color={STATUS_COLOR[f.status] || 'white'}>{f.status} </Text>
                  <Text>{f.file}</Text>
                </>
              )}
            />
            <FileList
              label="untracked"
              items={status.untracked}
              renderFile={f => (
                <>
                  <Text dimColor>?? </Text>
                  <Text dimColor>{f}</Text>
                </>
              )}
            />
          </Box>
        )}
      </Box>

      <Footer hints="↑↓ project · r refresh · ⇥ next tab · q back" />
    </Box>
  );
}
