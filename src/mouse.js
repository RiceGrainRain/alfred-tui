import { EventEmitter } from 'events';

export const mouseEmitter = new EventEmitter();

const SGR_RE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
let enabled = false;

// Only writes the escape code to stdout — the actual stdin listener is
// attached later via attachMouseListener() inside the React tree, so it
// hooks into the same stdin stream that Ink's readline is using.
export function enableMouse() {
  if (enabled) return;
  enabled = true;
  process.stdout.write('\x1b[?1006h'); // SGR extended mouse mode
}

// Call from a useEffect with the stdin obtained from Ink's useStdin().
// Returns a cleanup function that removes the listener.
export function attachMouseListener(stdin) {
  const handler = (buf) => {
    const str = buf.toString('binary');
    SGR_RE.lastIndex = 0;
    let m;
    while ((m = SGR_RE.exec(str)) !== null) {
      const [, btn, col, row, type] = m;
      if (type === 'M') mouseEmitter.emit('click', { btn: +btn, col: +col, row: +row });
    }
  };
  stdin.on('data', handler);
  return () => stdin.off('data', handler);
}

export function disableMouse() {
  if (!enabled) return;
  enabled = false;
  process.stdout.write('\x1b[?1006l');
}
