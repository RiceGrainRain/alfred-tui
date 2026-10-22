import test from 'node:test';
import assert from 'node:assert/strict';
import { paneStatus, nextStatus, worstStatus } from '../src/agent-status.js';

test('paneStatus reads claude pane text', () => {
  assert.equal(paneStatus('⏺ Bash(ls)\n✢ Creating… (55s · ↓ 1.5k tokens)\n───\n❯ \n───'), 'working');
  assert.equal(paneStatus(' Bash command\n Do you want to proceed?\n ❯ 1. Yes\n   2. No'), 'blocked');
  assert.equal(paneStatus('⏺ Done.\n✻ Cooked for 1m 2s\n───\n❯ \n───'), 'idle');
  // Old prompt text far above the bottom of the screen doesn't count.
  assert.equal(paneStatus(['Do you want to proceed?', ...Array(30).fill('x')].join('\n')), 'idle');
});

test('nextStatus marks unseen finishes done until seen', () => {
  assert.equal(nextStatus('working', 'idle', false), 'done');
  assert.equal(nextStatus('done', 'idle', false), 'done');
  assert.equal(nextStatus('done', 'idle', true), 'idle');
  assert.equal(nextStatus('working', 'idle', true), 'idle');
  assert.equal(nextStatus('idle', 'idle', false), 'idle');
  assert.equal(nextStatus('done', 'working', false), 'working');
});

test('worstStatus prefers blocked, then working', () => {
  assert.equal(worstStatus(['idle', 'working', 'blocked']), 'blocked');
  assert.equal(worstStatus(['idle', 'working']), 'working');
  assert.equal(worstStatus([]), null);
});
