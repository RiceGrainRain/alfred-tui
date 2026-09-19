import React from 'react';
import { Box, Text, useInput } from 'ink';

export default function Confirm({ message, onYes, onNo }) {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') onYes();
    else if (input === 'n' || input === 'N' || key.escape) onNo();
  });

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="yellow">
      <Text>{message}</Text>
      <Text dimColor>y / n</Text>
    </Box>
  );
}
