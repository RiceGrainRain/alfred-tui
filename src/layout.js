// Scroll viewport: given a total row count, the selected index, and how many
// rows fit, return the {start, end} slice to render, keeping the selection in
// view. `end` is exclusive.
function computeViewport(total, selected, height) {
  if (height <= 0 || total <= 0) return { start: 0, end: 0 };
  if (total <= height) return { start: 0, end: total };
  const sel = Math.max(0, Math.min(selected, total - 1));
  let start = sel - Math.floor(height / 2);
  start = Math.max(0, Math.min(start, total - height));
  return { start, end: start + height };
}

// Rows the app chrome (root tabs + work-tab strip) occupies above every
// screen. Screens add this to their mouse row maps and subtract it from
// their height budgets.
const CHROME_ROWS = 2;

const MIN_TAB = 4;

// Lay out a one-row tab strip: each label becomes " label " separated by a
// single space, truncated so the strip never exceeds `width` (and so never
// wraps). If even minimally-truncated tabs don't fit, only a window of tabs
// around `active` is shown. Returns [{ index, text, start, end }] with 1-based
// inclusive terminal columns starting at `startCol` — used for both rendering
// and mouse hit-testing.
function layoutTabStrip(labels, width, active = 0, startCol = 1) {
  const n = labels.length;
  if (n === 0 || width < MIN_TAB) return [];
  const maxFit = Math.max(1, Math.floor((width + 1) / (MIN_TAB + 1)));
  const { start, end } = computeViewport(n, active, maxFit);
  const shown = end - start;
  const per = Math.max(MIN_TAB, Math.floor((width - (shown - 1)) / shown));
  const segments = [];
  let col = startCol;
  for (let i = start; i < end; i++) {
    let text = ` ${labels[i]} `;
    if (text.length > per) text = text.slice(0, per - 2) + '… ';
    segments.push({ index: i, text, start: col, end: col + text.length - 1 });
    col += text.length + 1;
  }
  return segments;
}

// Which segment (if any) contains terminal column `col`.
function hitSegment(segments, col) {
  return segments.find(s => col >= s.start && col <= s.end) || null;
}

// Pack footer hints into as many lines as needed so every keybind is
// visible. `hints` is a string or array of strings; each is split on " · "
// into items, which are greedily re-joined with " · " up to `width`. An item
// wider than `width` gets its own line (and is hard-wrapped by the terminal).
function layoutHints(hints, width) {
  const items = (Array.isArray(hints) ? hints : [hints])
    .flatMap(h => String(h).split(' · '))
    .map(s => s.trim())
    .filter(Boolean);
  const lines = [];
  let line = '';
  for (const item of items) {
    const next = line ? `${line} · ${item}` : item;
    if (line && next.length > width) {
      lines.push(line);
      line = item;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Footer width available inside the sidebar (Footer has paddingX={1}).
function footerWidth() {
  return Math.max(10, (process.stdout.columns || 80) - 2);
}

// Rows the footer will occupy for these hints at the current width.
function footerHeight(hints) {
  const w = footerWidth();
  const n = layoutHints(hints, w).reduce((sum, l) => sum + Math.max(1, Math.ceil(l.length / w)), 0);
  return Math.max(1, n);
}

export { CHROME_ROWS, computeViewport, layoutTabStrip, hitSegment, layoutHints, footerWidth, footerHeight };
