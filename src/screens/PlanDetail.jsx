import React, { useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import Footer from '../components/Footer.jsx';
import { readPlanModePlan } from '../plans.js';
import { renderMarkdown } from '../markdown.js';

function shortPath(p) {
  const home = process.env.HOME || '';
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

function TrackedView({ entry }) {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{shortPath(entry.projectPath)}</Text>
      {entry.plan && entry.plan.phases.map((phase, i) => (
        <Box key={i} flexDirection="column" marginTop={1}>
          <Text color={phase.done ? 'green' : undefined}>
            {phase.done ? '✓' : '○'} {phase.title}
          </Text>
          {phase.items.map((item, j) => (
            <Text key={j}>  {item.done ? '✓' : '○'} {item.text}</Text>
          ))}
        </Box>
      ))}
      {entry.todos.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">Todos</Text>
          {entry.todos.map((item, i) => (
            <Text key={i}>{item.done ? '✓' : '○'} {item.text}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default function PlanDetail({ plan, trackedEntry, onBack }) {
  const rendered = useMemo(() => {
    if (!plan) return '';
    const content = readPlanModePlan(plan.filename);
    return renderMarkdown(content);
  }, [plan]);

  useInput((input, key) => {
    if (input === 'q' || key.escape) onBack();
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      {plan && (
        <Box flexDirection="column" paddingX={1} flexGrow={1}>
          <Text bold color="cyan">{plan.title}</Text>
          <Box marginTop={1}>
            <Text>{rendered}</Text>
          </Box>
        </Box>
      )}
      {trackedEntry && (
        <Box paddingX={1} flexGrow={1}>
          <TrackedView entry={trackedEntry} />
        </Box>
      )}
      <Footer hints="q/Esc back" />
    </Box>
  );
}
