import { useRef, useState } from 'react';

// An index-based list selection that survives the list being rebuilt
// underneath it. The lists in the sidebar are re-derived on a timer and sort
// by mtime, so a new or freshly-touched entry can appear above the cursor and
// slide it onto a neighbour. This remembers the *key* of the selected entry
// and re-finds it whenever `items` changes identity.
//
// `keyOf` must return a stable id for an entry (session id, plan filename, …).
// Returns [selectedIndex, setSelected]; the index is already clamped into
// range, so callers can index `items` with it directly.
export function useAnchoredSelection(items, keyOf) {
  const [selected, setSelected] = useState(0);
  const anchorRef = useRef(null);
  const seenRef = useRef(items);

  let idx = selected;
  if (seenRef.current !== items) {
    seenRef.current = items;
    const found = anchorRef.current ? items.findIndex(it => keyOf(it) === anchorRef.current) : -1;
    if (found >= 0 && found !== selected) {
      idx = found;
      setSelected(found);
    }
  }

  const sel = Math.max(0, Math.min(idx, items.length - 1));
  anchorRef.current = items[sel] ? keyOf(items[sel]) : null;
  return [sel, setSelected];
}
