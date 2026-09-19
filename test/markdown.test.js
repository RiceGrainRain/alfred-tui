import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/markdown.js';

test('renderMarkdown strips raw heading/bold/code/list syntax', () => {
  const out = renderMarkdown([
    '# Heading',
    '',
    'Some **bold** and `code` and a [link](https://example.com).',
    '',
    '- one',
    '- two',
    '',
    '```js',
    'const x = 1;',
    '```',
  ].join('\n'));

  assert.ok(!out.includes('#'), 'no literal heading marker');
  assert.ok(!out.includes('**'), 'no literal bold marker');
  assert.ok(!out.includes('```'), 'no literal code fence');
  assert.ok(out.includes('Heading'));
  assert.ok(out.includes('bold'));
  assert.ok(out.includes('code'));
  assert.ok(out.includes('const x = 1;'));
});

test('renderMarkdown returns empty string for empty input', () => {
  assert.equal(renderMarkdown(''), '');
  assert.equal(renderMarkdown(null), '');
});
