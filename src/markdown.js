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
  // marked-terminal appends trailing newlines Ink's <Text> doesn't need.
  return String(out).replace(/\n+$/, '');
}

export { renderMarkdown };
