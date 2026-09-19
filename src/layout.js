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

export { computeViewport };
