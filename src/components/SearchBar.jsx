import React from 'react';
import { Box, Text } from 'ink';

export default function SearchBar({ active, value }) {
  return (
    <Box borderStyle="round" borderColor={active ? 'cyan' : 'gray'} paddingX={1}>
      <Text dimColor={!active}>
        {value ? value : 'Search sessions…'}{active ? <Text color="cyan">▏</Text> : ''}
      </Text>
    </Box>
  );
}
