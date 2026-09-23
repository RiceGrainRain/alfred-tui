// Plan-mode plans (~/.claude/plans/*.md): readdir, first `# ` line as title,
// mtime sort.
//
// Also does lightweight discovery of any project's plan-tracker.md/todos.md
// ("tracked progress"): it just checks the distinct projectPath values alfred-tui is
// already loading for the session list, since that's the only place a cwd
// is known from. A tracker kept outside every session's cwd won't be found —
// acceptable for a lightweight v1, not a full Projects reimplementation.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parsePlan, parseTodos } from './plan-parser.js';

function plansDir() {
  if (process.env.ALFRED_TUI_CLAUDE_PLANS_DIR) {
    return path.resolve(process.env.ALFRED_TUI_CLAUDE_PLANS_DIR);
  }
  return path.join(os.homedir(), '.claude', 'plans');
}

/** List every ~/.claude/plans/*.md plan-mode plan, newest first. */
function listPlanModePlans() {
  const dir = plansDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  const plans = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      const firstLine = content.split('\n').find(l => l.trim());
      const title = firstLine && firstLine.startsWith('# ')
        ? firstLine.slice(2).trim()
        : file.replace(/\.md$/, '');
      plans.push({ filename: file, title, modified: stat.mtime.toISOString() });
    } catch {}
  }
  plans.sort((a, b) => new Date(b.modified) - new Date(a.modified));
  return plans;
}

/** Absolute path of one plan-mode plan file. */
function planModePath(filename) {
  return path.join(plansDir(), path.basename(filename));
}

/** Raw content of one plan-mode plan file. */
function readPlanModePlan(filename) {
  return fs.readFileSync(planModePath(filename), 'utf8');
}

/** Discover plan-tracker.md/todos.md next to any known session cwd. */
function listTrackedProgress(projectPaths) {
  const seen = new Set();
  const found = [];
  for (const projectPath of projectPaths) {
    if (!projectPath || seen.has(projectPath)) continue;
    seen.add(projectPath);
    const trackerPath = path.join(projectPath, 'plan-tracker.md');
    const todosPath = path.join(projectPath, 'todos.md');
    const hasTracker = fs.existsSync(trackerPath);
    const hasTodos = fs.existsSync(todosPath);
    if (!hasTracker && !hasTodos) continue;

    let plan = null;
    let todos = [];
    let modified = null;
    if (hasTracker) {
      const content = fs.readFileSync(trackerPath, 'utf8');
      plan = parsePlan(content);
      modified = fs.statSync(trackerPath).mtime.toISOString();
    }
    if (hasTodos) {
      const content = fs.readFileSync(todosPath, 'utf8');
      todos = parseTodos(content);
      const todosModified = fs.statSync(todosPath).mtime.toISOString();
      if (!modified || todosModified > modified) modified = todosModified;
    }
    found.push({ projectPath, trackerPath: hasTracker ? trackerPath : null, todosPath: hasTodos ? todosPath : null, plan, todos, modified });
  }
  found.sort((a, b) => new Date(b.modified) - new Date(a.modified));
  return found;
}

export { listPlanModePlans, planModePath, readPlanModePlan, listTrackedProgress };
