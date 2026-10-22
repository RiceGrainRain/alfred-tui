// Working / blocked / idle for a claude tab, read off its tmux pane the way
// herdr does. Only the bottom of the screen is checked so transcript text
// scrolled above the prompt can't match.
// ponytail: screen-scraping Claude Code's TUI; a Notification/Stop hook
// writing state files is sturdier if these strings change.
const TAIL = 20;
const BLOCKED = /Do you want to |❯ 1\. Yes/;
// Spinner line: "✢ Creating… (55s · ↓ 1.5k tokens)"; older builds: "esc to interrupt".
const WORKING = /…\s*\(\d+[smh]|esc to interrupt/;

function paneStatus(text) {
  const tail = text.split('\n').filter(l => l.trim()).slice(-TAIL).join('\n');
  if (BLOCKED.test(tail)) return 'blocked';
  if (WORKING.test(tail)) return 'working';
  return 'idle';
}

// Fold a fresh pane reading into the previous status: a session that finishes
// (working -> idle) while its tab isn't the active one stays 'done' until seen.
function nextStatus(prev, read, seen) {
  if (read === 'idle' && !seen && (prev === 'working' || prev === 'done')) return 'done';
  return read;
}

// Highest-priority status among sessions (for collapsed project headers).
function worstStatus(statuses) {
  for (const s of ['blocked', 'done', 'working', 'idle']) if (statuses.includes(s)) return s;
  return null;
}

// Glyph + theme color per status (herdr-style: ◉ needs you, ● finished, ○ idle);
// working spins through SPINNER instead of a fixed glyph.
const STATUS_STYLE = {
  blocked: { glyph: '◉', color: 'red' },
  done: { glyph: '●', color: 'cyan' },
  working: { glyph: '●', color: 'yellow' },
  idle: { glyph: '○', color: 'green' },
};
const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

function statusGlyph(status, frame = 0) {
  return status === 'working' ? SPINNER[frame % SPINNER.length] : STATUS_STYLE[status]?.glyph;
}

export { paneStatus, nextStatus, worstStatus, statusGlyph, STATUS_STYLE };
