import test from 'node:test';
import assert from 'node:assert/strict';
import { relativeTime } from '../src/time.js';

const now = Date.parse('2026-09-19T12:00:00.000Z');
const ago = (ms) => new Date(now - ms).toISOString();

test('relativeTime buckets', () => {
  assert.equal(relativeTime(ago(10 * 1000), now), 'just now');
  assert.equal(relativeTime(ago(5 * 60 * 1000), now), '5m ago');
  assert.equal(relativeTime(ago(3 * 60 * 60 * 1000), now), '3h ago');
  assert.equal(relativeTime(ago(2 * 24 * 60 * 60 * 1000), now), '2d ago');
});

test('relativeTime past a week falls back to a date, and handles bad input', () => {
  const old = relativeTime(ago(30 * 24 * 60 * 60 * 1000), now);
  assert.ok(!/ago|just now/.test(old));
  assert.equal(relativeTime('', now), '');
  assert.equal(relativeTime('not-a-date', now), '');
});
