// Reads a session's JSONL transcript into per-turn {role, text, timestamp}
// records for the detail viewer. Reuses the same string/content-block text
// extraction as harness-claude.js's indexer (textOf), duplicated at the call
// site rather than factored further: the indexer accumulates one running
// summary/search blob, while the viewer needs each turn kept separate.
import { scanLines } from './jsonl-scan.js';
import { textOf } from './harness-claude.js';

/** Read every user/assistant turn out of a transcript file, in order. */
function readTranscript(filePath) {
  const turns = [];
  const push = (entry) => {
    const isConversationMessage = entry.type === 'user' || entry.type === 'assistant' ||
      (entry.type === 'message' && (entry.role === 'user' || entry.role === 'assistant'));
    if (!isConversationMessage) return;
    const role = entry.type === 'message' ? entry.role : entry.type;
    const text = textOf(entry.message);
    if (!text) return;
    // Skip local `!`-prefixed shell command bookkeeping, same as the indexer.
    if (/<bash-input>|<bash-stdout>|<local-command-caveat>/.test(text)) return;
    turns.push({ role, text, timestamp: entry.timestamp || null });
  };
  const onLine = (line) => {
    let entry;
    try { entry = JSON.parse(line); } catch { return; }
    push(entry);
  };
  try {
    const { tail } = scanLines(filePath, 0, onLine);
    if (tail) onLine(tail);
  } catch (err) {
    return { turns: [], error: err.message };
  }
  return { turns, error: null };
}

export { readTranscript };
