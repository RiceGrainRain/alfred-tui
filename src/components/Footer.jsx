import React from 'react';
import { Box, Text } from 'ink';

export default function Footer({ hints }) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text dimColor>{hints}</Text>
    </Box>
  );
}
