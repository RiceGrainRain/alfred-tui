import React from 'react';
import { Box, Text } from 'ink';
import { layoutHints, footerWidth } from '../layout.js';

// Keybind hints, wrapped onto as many lines as the sidebar width needs so
// nothing is cut off. Screens reserve footerHeight(hints) rows for it.
export default function Footer({ hints }) {
  const lines = layoutHints(hints, footerWidth());
  return (
    <Box paddingX={1} flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} dimColor>{line}</Text>
      ))}
    </Box>
  );
}
