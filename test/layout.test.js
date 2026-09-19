import test from 'node:test';
import assert from 'node:assert/strict';
import { computeViewport } from '../src/layout.js';

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
