import React from 'react';
import { Box, Text } from 'ink';

export default function Footer({ hints }) {
  const lines = Array.isArray(hints) ? hints : [hints];
  return (
    <Box paddingX={1} flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} dimColor wrap="truncate-end">{line}</Text>
      ))}
    </Box>
  );
}
