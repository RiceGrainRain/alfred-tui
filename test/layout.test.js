import test from 'node:test';
import assert from 'node:assert/strict';
import { computeViewport, layoutTabStrip, hitSegment, layoutHints } from '../src/layout.js';

test('everything fits when total <= height', () => {
  assert.deepEqual(computeViewport(5, 0, 10), { start: 0, end: 5 });
});

test('selection stays centered within the window', () => {
  const { start, end } = computeViewport(100, 50, 10);
  assert.ok(start <= 50 && 50 < end);
  assert.equal(end - start, 10);
});

test('clamps at the top and bottom', () => {
  assert.deepEqual(computeViewport(100, 0, 10), { start: 0, end: 10 });
  assert.deepEqual(computeViewport(100, 99, 10), { start: 90, end: 100 });
});

test('degenerate inputs', () => {
  assert.deepEqual(computeViewport(0, 0, 10), { start: 0, end: 0 });
  assert.deepEqual(computeViewport(10, 0, 0), { start: 0, end: 0 });
});


test('tab strip: columns are contiguous with one-space gaps', () => {
  const segs = layoutTabStrip(['Sessions', 'Plans', 'Git'], 80, 0, 2);
  assert.deepEqual(segs.map(s => s.text), [' Sessions ', ' Plans ', ' Git ']);
  assert.equal(segs[0].start, 2);
  assert.equal(segs[0].end, 11);
  assert.equal(segs[1].start, 13);
  assert.equal(hitSegment(segs, 14).index, 1);
  assert.equal(hitSegment(segs, 12), null);
});

test('tab strip: long labels truncate to fit width', () => {
  const segs = layoutTabStrip(['claude:a-very-long-session-name', 'nvim:App.jsx'], 20);
  const last = segs[segs.length - 1];
  assert.ok(last.end - segs[0].start + 1 <= 20);
  assert.ok(segs[0].text.includes('…'));
});

test('tab strip: windows around the active tab when too many', () => {
  const labels = Array.from({ length: 20 }, (_, i) => `t${i}`);
  const segs = layoutTabStrip(labels, 20, 15);
  assert.ok(segs.length < 20);
  assert.ok(segs.some(s => s.index === 15));
  assert.ok(segs[segs.length - 1].end <= 20);
});

test('hints: packed greedily, never wider than width', () => {
  const lines = layoutHints(['a · bb · ccc', 'dddd · e'], 10);
  assert.deepEqual(lines, ['a · bb', 'ccc · dddd', 'e']);
  for (const l of lines) assert.ok(l.length <= 10);
});

test('hints: everything on one line when it fits', () => {
  assert.deepEqual(layoutHints('q quit · ⏎ open', 80), ['q quit · ⏎ open']);
});

test('hints: oversized item gets its own line', () => {
  assert.deepEqual(layoutHints('x · a-very-long-item · y', 6), ['x', 'a-very-long-item', 'y']);
});
