import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Footer from '../components/Footer.jsx';
import { transcriptPath } from '../harness-claude.js';
import { readTranscript } from '../transcript.js';
import { renderMarkdown } from '../markdown.js';

function sessionLabel(session) {
  return session.name || session.aiTitle || session.summary || session.sessionId;
}

export default function SessionDetail({ session, onBack, onResume }) {
  const [index, setIndex] = useState(0);

  const { turns, error } = useMemo(() => {
    const filePath = transcriptPath(session);
    return readTranscript(filePath);
  }, [session]);

  const rendered = useMemo(() => {
    const turn = turns[index];
    if (!turn) return '';
    return renderMarkdown(turn.text);
  }, [turns, index]);

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
    if (input === 'g') {
      setIndex(0);
      return;
    }
    if (input === 'G') {
      setIndex(Math.max(turns.length - 1, 0));
      return;
    }
    if (input === 'r') {
      onResume(session);
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
        </Text>
      </Box>
      <Box flexDirection="column" paddingX={1} paddingTop={1} flexGrow={1}>
        {turns.length === 0 && <Text dimColor>No messages in this transcript.</Text>}
        {turn && <Text>{rendered}</Text>}
      </Box>
      <Footer hints="↑/k prev  ↓/j next  g first  G last  r resume  q/Esc back" />
    </Box>
  );
}
