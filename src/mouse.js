import { EventEmitter } from 'events';

export const mouseEmitter = new EventEmitter();

const SGR_RE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
// Same sequence as Ink hands it to useInput: the leading ESC may be stripped.
const SGR_INPUT_RE = /\[<\d+;\d+;\d+[Mm]/;
let enabled = false;

// Pure parser: SGR mouse reports → [{ type: 'click'|'wheel', btn, col, row, dir }].
// Only left-button presses and wheel ticks are reported; releases, drags and
// other buttons are dropped.
export function parseMouseEvents(str) {
  const events = [];
  SGR_RE.lastIndex = 0;
  let m;
  while ((m = SGR_RE.exec(str)) !== null) {
    const btn = +m[1];
    const col = +m[2];
    const row = +m[3];
    const press = m[4] === 'M';
    if (btn === 64 || btn === 65) {
      events.push({ type: 'wheel', btn, col, row, dir: btn === 64 ? -1 : 1 });
    } else if (press && (btn & 0b11100011) === 0) {
      // Low two bits 0 = left button; bit 5 (32) = motion, bit 6 (64) = wheel.
      // Modifier bits (4/8/16) are allowed through.
      events.push({ type: 'click', btn, col, row });
    }
  }
  return events;
}

// True if a useInput `input` string is (part of) a raw mouse report that
// leaked through Ink's key parser.
export function isMouseSeq(input) {
  return typeof input === 'string' && SGR_INPUT_RE.test(input);
}

// Only writes the escape codes to stdout — the actual stdin listener is
// attached later via attachMouseListener() inside the React tree, so it
// hooks into the same stdin stream that Ink's readline is using.
export function enableMouse() {
  if (enabled) return;
  enabled = true;
  // 1000: report button presses/releases + wheel. 1006: SGR encoding.
  process.stdout.write('\x1b[?1000h\x1b[?1006h');
  process.on('exit', disableMouse);
}

// Call from a useEffect with the stdin obtained from Ink's useStdin().
// Returns a cleanup function that removes the listener.
export function attachMouseListener(stdin) {
  const handler = (buf) => {
    for (const ev of parseMouseEvents(buf.toString('binary'))) {
      mouseEmitter.emit(ev.type, ev);
    }
  };
  stdin.on('data', handler);
  return () => stdin.off('data', handler);
}

export function disableMouse() {
  if (!enabled) return;
  enabled = false;
  process.stdout.write('\x1b[?1000l\x1b[?1006l');
}
