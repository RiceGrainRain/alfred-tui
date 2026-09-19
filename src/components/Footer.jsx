import React from 'react';
import { Box, Text } from 'ink';

export default function Footer({ hints }) {
  return (
    <Box paddingX={1}>
      <Text dimColor wrap="truncate-end">{hints}</Text>
    </Box>
  );
}
