import { EventEmitter } from 'events';

export const mouseEmitter = new EventEmitter();

const SGR_RE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
let enabled = false;

export function enableMouse() {
  if (enabled) return;
  enabled = true;
  process.stdout.write('\x1b[?1006h'); // SGR extended mouse mode
  process.stdin.on('data', (buf) => {
    const str = buf.toString('binary');
    SGR_RE.lastIndex = 0;
    let m;
    while ((m = SGR_RE.exec(str)) !== null) {
      const [, btn, col, row, type] = m;
      // type 'M' = press, 'm' = release; we only emit presses
      if (type === 'M') mouseEmitter.emit('click', { btn: +btn, col: +col, row: +row });
    }
  });
}

export function disableMouse() {
  if (!enabled) return;
  enabled = false;
  process.stdout.write('\x1b[?1006l'); // restore default (no mouse tracking)
}
