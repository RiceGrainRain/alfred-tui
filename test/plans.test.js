import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const plansDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-tui-plans-'));
process.env.ALFRED_TUI_CLAUDE_PLANS_DIR = plansDir;

const { listPlanModePlans, readPlanModePlan, listTrackedProgress } = await import('../src/plans.js');

test('listPlanModePlans titles from first # line, sorted by mtime desc', async () => {
  fs.writeFileSync(path.join(plansDir, 'a.md'), '# First Plan\n\nbody');
  await new Promise(r => setTimeout(r, 5));
  fs.writeFileSync(path.join(plansDir, 'b.md'), 'no heading here');

  const plans = listPlanModePlans();
  assert.equal(plans.length, 2);
  assert.equal(plans[0].filename, 'b.md');
  assert.equal(plans[0].title, 'b'); // falls back to filename without extension
  assert.equal(plans[1].filename, 'a.md');
  assert.equal(plans[1].title, 'First Plan');
});

test('readPlanModePlan returns raw file content', () => {
  const content = readPlanModePlan('a.md');
  assert.match(content, /# First Plan/);
});

test('listTrackedProgress finds plan-tracker.md/todos.md next to a known project path', () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-tui-project-'));
  fs.writeFileSync(path.join(projectDir, 'plan-tracker.md'), '## Phase 1\n- [x] done thing\n- [ ] open thing\n');
  fs.writeFileSync(path.join(projectDir, 'todos.md'), '- [ ] a todo\n');

  const found = listTrackedProgress([projectDir, '/nonexistent/path']);
  assert.equal(found.length, 1);
  assert.equal(found[0].projectPath, projectDir);
  assert.equal(found[0].plan.total, 1);
  assert.equal(found[0].todos.length, 1);

  fs.rmSync(projectDir, { recursive: true, force: true });
});

test.after(() => {
  fs.rmSync(plansDir, { recursive: true, force: true });
});
