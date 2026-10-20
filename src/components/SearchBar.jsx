import React from 'react';
import { Box, Text } from 'ink';
import { C } from '../theme.js';

export default function SearchBar({ active, value }) {
  return (
    <Box borderStyle="round" borderColor={active ? C.cyan : C.gray} paddingX={1}>
      <Text dimColor={!active}>
        {value ? value : 'Search sessions…'}{active ? <Text color={C.cyan}>▏</Text> : ''}
      </Text>
    </Box>
  );
}
