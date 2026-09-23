// Turns the raw vhs frames into docs/demo.gif and the four README
// screenshots. (vhs 0.12's own GIF/Screenshot output silently produces
// nothing with current ffmpeg, so we encode ourselves.)
//
// Screenshots: the tape holds still for 3s at each screenshot point and
// never pauses that long otherwise, so the long runs of identical frames are
// exactly the screenshot moments, in order.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const FPS = 25;
const SHOTS = ['sessions', 'transcript', 'plans', 'git'];
const frames = path.resolve(process.argv[2] || '/tmp/alfred-demo/frames');
const out = path.resolve(process.argv[3] || 'docs');

const textFrames = fs.readdirSync(frames).filter(f => f.startsWith('frame-text-')).sort();
const hash = f => crypto.createHash('sha1').update(fs.readFileSync(path.join(frames, f))).digest('hex');

const runs = [];
let start = 0;
let prev = null;
textFrames.forEach((f, i) => {
  const h = hash(f);
  if (h !== prev) {
    if (prev !== null) runs.push({ start, end: i - 1 });
    start = i;
    prev = h;
  }
});
runs.push({ start, end: textFrames.length - 1 });

const still = runs.filter(r => r.end - r.start + 1 >= 2.5 * FPS);
if (still.length !== SHOTS.length) {
  throw new Error(`expected ${SHOTS.length} still points, found ${still.length}`);
}

const ffmpeg = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
const frameNo = f => f.match(/(\d+)\.png$/)[1];

SHOTS.forEach((name, i) => {
  const n = frameNo(textFrames[still[i].end]);
  ffmpeg(
    '-i', path.join(frames, `frame-text-${n}.png`),
    '-i', path.join(frames, `frame-cursor-${n}.png`),
    '-filter_complex', '[0][1]overlay',
    '-frames:v', '1', '-update', '1', path.join(out, `${name}.png`),
  );
});

ffmpeg(
  '-framerate', String(FPS), '-i', path.join(frames, 'frame-text-%05d.png'),
  '-framerate', String(FPS), '-i', path.join(frames, 'frame-cursor-%05d.png'),
  '-filter_complex',
  '[0][1]overlay,fps=12,scale=1200:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none',
  path.join(out, 'demo.gif'),
);
console.log(`wrote ${out}/demo.gif and ${SHOTS.map(s => s + '.png').join(', ')}`);
