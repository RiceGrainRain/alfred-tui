import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMouseEvents, isMouseSeq } from '../src/mouse.js';

test('left press is a click, release is ignored', () => {
  assert.deepEqual(parseMouseEvents('\x1b[<0;12;5M\x1b[<0;12;5m'), [
    { type: 'click', btn: 0, col: 12, row: 5 },
  ]);
});

test('wheel up/down', () => {
  assert.deepEqual(parseMouseEvents('\x1b[<64;3;4M\x1b[<65;3;4M'), [
    { type: 'wheel', btn: 64, col: 3, row: 4, dir: -1 },
    { type: 'wheel', btn: 65, col: 3, row: 4, dir: 1 },
  ]);
});

test('right/middle buttons and drags are ignored', () => {
  assert.deepEqual(parseMouseEvents('\x1b[<1;1;1M\x1b[<2;1;1M\x1b[<32;1;1M'), []);
});

test('non-mouse input yields nothing', () => {
  assert.deepEqual(parseMouseEvents('hello'), []);
});

test('isMouseSeq detects leaked reports', () => {
  assert.equal(isMouseSeq('[<0;12;5M'), true);
  assert.equal(isMouseSeq('\x1b[<65;1;1M'), true);
  assert.equal(isMouseSeq('q'), false);
});
