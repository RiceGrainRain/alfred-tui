import { readdirSync } from 'fs';
import path from 'path';

const SKIP = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.venv', 'vendor', 'coverage', '.cache', '.turbo', 'out',
]);

const EXT_ICON = {
  js:   ' ',  // nf-dev-javascript
  jsx:  ' ',  // nf-dev-react
  ts:   ' ',  // nf-seti-typescript
  tsx:  ' ',  // nf-dev-react
  json: ' ',  // nf-seti-json
  md:   ' ',  // nf-seti-markdown
  py:   ' ',  // nf-seti-python
  rs:   ' ',  // nf-seti-rust
  sh:   ' ',  // nf-seti-shell
  css:  ' ',  // nf-seti-css
  html: ' ',  // nf-seti-html
  toml: ' ',  // nf-seti-config
  yaml: ' ',
  yml:  ' ',
  lock: ' ',  // nf-fa-lock
};

const DIR_ICON = ' '; // nf-fa-folder
const DIR_OPEN_ICON = '\uf07c '; // nf-fa-folder_open
const FILE_ICON = ' '; // nf-fa-file

export function fileIcon(name) {
  const parts = name.split('.');
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
  return EXT_ICON[ext] || FILE_ICON;
}

// One directory level: [{ name, path, type: 'dir'|'file' }], dirs first,
// hidden and SKIP entries dropped.
export function readDirLevel(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter(e => !e.name.startsWith('.') && !SKIP.has(e.name))
    .sort((a, b) => {
      const aDir = a.isDirectory();
      const bDir = b.isDirectory();
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map(e => ({ name: e.name, path: path.join(dir, e.name), type: e.isDirectory() ? 'dir' : 'file' }));
}

// Build the nested tree under `root`, descending only into dirs in `expanded`
// so big repos stay cheap. `readLevel` is injectable (e.g. a caching wrapper).
export function buildTree(root, expanded, readLevel = readDirLevel) {
  return readLevel(root).map(node => node.type === 'dir'
    ? { ...node, children: expanded.has(node.path) ? buildTree(node.path, expanded, readLevel) : [] }
    : node);
}

// Flatten a tree into one row per visible entry. Only dirs whose path is in
// `expanded` show their children. Each row:
// { prefix, connector, icon, name, type, path, depth, expanded }.
export function flattenTree(nodes, expanded) {
  const flat = [];
  function walk(list, depth, linePrefix) {
    list.forEach((node, i) => {
      const isLast = i === list.length - 1;
      const isDir = node.type === 'dir';
      const open = isDir && expanded.has(node.path);
      flat.push({
        prefix: linePrefix,
        connector: isLast ? '└── ' : '├── ',
        icon: isDir ? (open ? DIR_OPEN_ICON : DIR_ICON) : fileIcon(node.name),
        name: node.name + (isDir ? '/' : ''),
        type: node.type,
        path: node.path,
        depth,
        expanded: open,
      });
      if (open) walk(node.children, depth + 1, linePrefix + (isLast ? '    ' : '│   '));
    });
  }
  walk(nodes, 0, '');
  return flat;
}
