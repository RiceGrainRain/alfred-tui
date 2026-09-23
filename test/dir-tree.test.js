import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTree, flattenTree } from '../src/dir-tree.js';

const tree = [
  { name: 'src', path: '/r/src', type: 'dir', children: [
    { name: 'lib', path: '/r/src/lib', type: 'dir', children: [
      { name: 'x.js', path: '/r/src/lib/x.js', type: 'file' },
    ] },
    { name: 'a.js', path: '/r/src/a.js', type: 'file' },
  ] },
  { name: 'README.md', path: '/r/README.md', type: 'file' },
];

test('collapsed dirs hide their children', () => {
  const rows = flattenTree(tree, new Set());
  assert.deepEqual(rows.map(r => r.name), ['src/', 'README.md']);
  assert.equal(rows[0].expanded, false);
});

test('expanded dirs show children with tree prefixes', () => {
  const rows = flattenTree(tree, new Set(['/r/src']));
  assert.deepEqual(rows.map(r => r.name), ['src/', 'lib/', 'a.js', 'README.md']);
  assert.equal(rows[1].prefix + rows[1].connector, '│   ├── ');
  assert.equal(rows[2].prefix + rows[2].connector, '│   └── ');
  assert.equal(rows[1].depth, 1);
});

test('nested expansion requires ancestors to be expanded', () => {
  assert.deepEqual(
    flattenTree(tree, new Set(['/r/src/lib'])).map(r => r.name),
    ['src/', 'README.md'],
  );
  assert.deepEqual(
    flattenTree(tree, new Set(['/r/src', '/r/src/lib'])).map(r => r.name),
    ['src/', 'lib/', 'x.js', 'a.js', 'README.md'],
  );
});

test('buildTree only reads expanded dirs', () => {
  const fs = {
    '/r': [{ name: 'a', path: '/r/a', type: 'dir' }, { name: 'f', path: '/r/f', type: 'file' }],
    '/r/a': [{ name: 'b', path: '/r/a/b', type: 'file' }],
  };
  const reads = [];
  const read = (dir) => { reads.push(dir); return fs[dir] || []; };
  buildTree('/r', new Set(), read);
  assert.deepEqual(reads, ['/r']);
  const tree = buildTree('/r', new Set(['/r/a']), read);
  assert.deepEqual(flattenTree(tree, new Set(['/r/a'])).map(r => r.name), ['a/', 'b', 'f']);
});
