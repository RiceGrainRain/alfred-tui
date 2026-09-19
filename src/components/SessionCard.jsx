import React from 'react';
import { Box, Text } from 'ink';
import { relativeTime } from '../time.js';

function sessionLabel(session) {
  return session.name || session.aiTitle || session.summary || session.sessionId;
}

function truncate(str, max) {
  if (max <= 1) return '';
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

export default function SessionCard({ session, selected, live }) {
  const star = session.starred ? '★' : '☆';
  const raw = sessionLabel(session).replace(/\s+/g, ' ').trim();
  // Pane width minus border (2), paddingX (2), the dot (2) and the star (2).
  // Manual truncation keeps every card exactly one title line + one meta line,
  // avoiding Ink's flexGrow+wrap reserving a stray extra row for long titles.
  const inner = (process.stdout.columns || 80) - 8;
  const title = truncate(raw, Math.max(4, inner));
  const meta = `${relativeTime(session.modified)} · ${session.messageCount} msgs`;

  return (
    <Box
      borderStyle="round"
      borderColor={selected ? 'cyan' : 'gray'}
      paddingX={1}
      flexDirection="column"
    >
      <Box justifyContent="space-between">
        <Text>
          <Text color={live ? 'green' : 'gray'}>{live ? '● ' : '  '}</Text>
          <Text bold={selected} color={selected ? 'white' : undefined}>{title}</Text>
        </Text>
        <Text color={session.starred ? 'yellow' : 'gray'}>{star}</Text>
      </Box>
      <Box>
        <Text>{'  '}</Text>
        <Text dimColor>{meta}</Text>
        {session.archived ? <Text color="yellow" dimColor> · archived</Text> : null}
        {live ? <Text color="green" bold> · live</Text> : null}
      </Box>
    </Box>
  );
}
