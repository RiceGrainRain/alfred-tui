import { execFileSync } from 'child_process';

function gitRun(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

export function getGitStatus(projectPath) {
  try {
    const branch = gitRun(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath).trim();
    // Porcelain paths are relative to the repo root, which may be above projectPath.
    const root = gitRun(['rev-parse', '--show-toplevel'], projectPath).trim();
    const raw = gitRun(['status', '--porcelain=v1', '-z'], projectPath);

    const staged = [];
    const unstaged = [];
    const untracked = [];

    const parts = raw.split('\0');
    let i = 0;
    while (i < parts.length) {
      const entry = parts[i];
      if (!entry || entry.length < 3) { i++; continue; }

      const X = entry[0];
      const Y = entry[1];
      const file = entry.slice(3);

      // Renames/copies have an extra null-separated original filename
      if (X === 'R' || X === 'C' || Y === 'R' || Y === 'C') i++;

      if (X === '?' && Y === '?') {
        untracked.push(file);
      } else {
        if (X !== ' ' && X !== '?') staged.push({ status: X, file });
        if (Y !== ' ' && Y !== '?') unstaged.push({ status: Y, file });
      }
      i++;
    }

    return { branch, root, staged, unstaged, untracked };
  } catch {
    return null;
  }
}
