// Relative time strings matching Switchboard's wording: "just now", "52m ago",
// "3h ago", "1d ago", then an absolute date past a week.
function relativeTime(iso, now = Date.now()) {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const d = new Date(then);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export { relativeTime };
