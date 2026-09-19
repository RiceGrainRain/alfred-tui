// Renders markdown to ANSI-escaped plain text for display inside Ink's
// <Text>, so plans and session turns never show literal `#`/`**`/``` on
// screen. marked-terminal is the standard choice for this (README-style
// markdown -> terminal), pairing with `marked` as its peer dependency.
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

let configured = false;

function configure() {
  if (configured) return;
  const width = Math.max(40, Math.min(process.stdout.columns || 80, 120));
  marked.use(markedTerminal({
    width,
    reflowText: true,
    showSectionPrefix: false,
    image: (href) => `[image: ${href}]`,
  }));
  configured = true;
}

/** Render a markdown string to an ANSI-formatted plain string. */
function renderMarkdown(text) {
  configure();
  if (!text) return '';
  const out = marked.parse(text, { async: false });
  // marked-terminal doesn't parse inline markdown inside list items (a known
  // limitation with marked's new-renderer API), so `**bold**` / `code` survive
  // there. Strip the leftover bold/inline-code markers — plain text is exactly
  // what we want on screen. Top-level prose is already converted to ANSI, so
  // no legitimate markers remain to clobber.
  return String(out)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    // Single-asterisk emphasis (*word*), but not list bullets ("* " has a
    // space right after the marker, so the \S guard skips them).
    .replace(/\*(\S[^*\n]*?\S|\S)\*/g, '$1')
    .replace(/\n+$/, '');
}

export { renderMarkdown };
