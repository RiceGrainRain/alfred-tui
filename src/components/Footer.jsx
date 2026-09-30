import React from 'react';
import { Box, Text } from 'ink';
import { layoutHints, footerWidth, hintsAreVisible } from '../layout.js';

// Keybind hints, wrapped onto as many lines as the sidebar width needs so
// nothing is cut off. Screens reserve footerHeight(hints) rows for it.
// Collapsed (?) it shrinks to a one-line reminder of how to get it back.
export default function Footer({ hints }) {
  const lines = hintsAreVisible() ? layoutHints(hints, footerWidth()) : ['? keys'];
  return (
    <Box paddingX={1} flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} dimColor>{line}</Text>
      ))}
    </Box>
  );
}
