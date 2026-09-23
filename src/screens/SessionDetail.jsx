import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Footer from '../components/Footer.jsx';
import { transcriptPath } from '../harness-claude.js';
import { readTranscript } from '../transcript.js';
import { renderMarkdown } from '../markdown.js';
import { mouseEmitter } from '../mouse.js';
import wrapAnsi from 'wrap-ansi';
import { CHROME_ROWS, footerHeight } from '../layout.js';

function sessionLabel(session) {
  return session.name || session.aiTitle || session.summary || session.sessionId;
}

export default function SessionDetail({ session, onBack, onOpen }) {
  const [index, setIndex] = useState(0);

  const { turns, error } = useMemo(() => {
    const filePath = transcriptPath(session);
    return readTranscript(filePath);
  }, [session]);

  const [offset, setOffset] = useState(0);
  useEffect(() => { setOffset(0); }, [index]);

  // One entry per terminal row, so the frame never outgrows the pane.
  const width = Math.max(10, (process.stdout.columns || 80) - 2);
  const lines = useMemo(() => {
    const turn = turns[index];
    if (!turn) return [];
    return wrapAnsi(renderMarkdown(turn.text), width, { hard: true, trim: false }).split('\n');
  }, [turns, index, width]);

  const hints = '↑/k/wheel prev · ↓/j next · space/b page · g first · G last · o open in tab · 1-9 tab · x close tab · z zoom · q/Esc back';
  const rows = process.stdout.rows || 24;
  // app chrome + title (1) + turn info (1) + paddingTop (1) + footer + 1 slack
  const pageHeight = Math.max(3, rows - CHROME_ROWS - 4 - footerHeight(hints));
  const maxOffset = Math.max(0, lines.length - pageHeight);
  const off = Math.min(offset, maxOffset);

  // Wheel steps through turns, same as ↑/↓.
  const lastRef = useRef(0);
  lastRef.current = Math.max(turns.length - 1, 0);
  useEffect(() => {
    const onWheel = ({ dir }) => setIndex(i => Math.max(0, Math.min(i + dir, lastRef.current)));
    mouseEmitter.on('wheel', onWheel);
    return () => mouseEmitter.off('wheel', onWheel);
  }, []);

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      onBack();
      return;
    }
    if (key.downArrow || input === 'j') {
      setIndex(i => Math.min(i + 1, Math.max(turns.length - 1, 0)));
      return;
    }
    if (key.upArrow || input === 'k') {
      setIndex(i => Math.max(i - 1, 0));
      return;
    }
    if (key.pageDown || input === ' ') { setOffset(Math.min(off + pageHeight, maxOffset)); return; }
    if (key.pageUp || input === 'b') { setOffset(Math.max(off - pageHeight, 0)); return; }
    if (input === 'g') {
      setIndex(0);
      return;
    }
    if (input === 'G') {
      setIndex(Math.max(turns.length - 1, 0));
      return;
    }
    if (input === 'o' || key.return) {
      onOpen(session);
      return;
    }
  });

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Could not read transcript: {error}</Text>
        <Footer hints="q/Esc back" />
      </Box>
    );
  }

  const turn = turns[index];

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1}>
        <Text bold color="cyan">{sessionLabel(session)}</Text>
      </Box>
      <Box paddingX={1}>
        <Text dimColor>
          Turn {turns.length ? index + 1 : 0}/{turns.length}
          {turn ? `  ${turn.role === 'user' ? 'You' : 'Assistant'}` : ''}
          {turn?.timestamp ? `  ${turn.timestamp}` : ''}
          {maxOffset > 0 ? `  (${off + 1}-${Math.min(off + pageHeight, lines.length)}/${lines.length})` : ''}
        </Text>
      </Box>
      <Box flexDirection="column" paddingX={1} paddingTop={1} flexGrow={1}>
        {turns.length === 0 && <Text dimColor>No messages in this transcript.</Text>}
        {lines.slice(off, off + pageHeight).map((l, i) => <Text key={off + i} wrap="truncate-end">{l || ' '}</Text>)}
      </Box>
      <Footer hints={hints} />
    </Box>
  );
}
