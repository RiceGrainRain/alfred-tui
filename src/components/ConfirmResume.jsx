import React from 'react';
import { Box, Text, useInput } from 'ink';

function sessionLabel(session) {
  return session.name || session.aiTitle || session.summary || session.sessionId;
}

export default function ConfirmResume({ session, onConfirm, onCancel }) {
  useInput((input, key) => {
    if (input === 'y') onConfirm();
    else if (input === 'n' || key.escape) onCancel();
  });

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="yellow">
      <Text bold color="yellow">This session is archived: {sessionLabel(session)}</Text>
      <Text>Resume it anyway? (y/n)</Text>
    </Box>
  );
}
