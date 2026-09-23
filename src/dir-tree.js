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
const FILE_ICON = ' '; // nf-fa-file

export function fileIcon(name) {
  const parts = name.split('.');
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
  return EXT_ICON[ext] || FILE_ICON;
}

// Returns a flat list of { prefix, connector, icon, name, type, path } for rendering.
// Each entry is one terminal row. Dirs come before files at each level.
export function buildDirTree(root, maxDepth = 4) {
  const flat = [];

  function walk(dir, depth, linePrefix) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }

    entries = entries
      .filter(e => !e.name.startsWith('.') && !SKIP.has(e.name))
      .sort((a, b) => {
        const aDir = a.isDirectory();
        const bDir = b.isDirectory();
        if (aDir !== bDir) return aDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    entries.forEach((e, i) => {
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const fullPath = path.join(dir, e.name);
      const isDir = e.isDirectory();
      flat.push({
        prefix: linePrefix,
        connector,
        icon: isDir ? DIR_ICON : fileIcon(e.name),
        name: e.name + (isDir ? '/' : ''),
        type: isDir ? 'dir' : 'file',
        path: fullPath,
      });
      if (isDir) walk(fullPath, depth + 1, linePrefix + (isLast ? '    ' : '│   '));
    });
  }

  walk(root, 0, '');
  return flat;
}
