import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Fixture dirs must exist before db.js/harness-claude.js are imported, since
// they resolve their (overridable) paths at module load time.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-tui-db-'));
const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-tui-projects-'));
process.env.ALFRED_DATA_DIR = dataDir;
process.env.ALFRED_TUI_CLAUDE_PROJECTS_DIR = projectsDir;

const db = await import('../src/db.js');
const sessionIndex = await import('../src/session-index.js');
const { encodeProjectPath } = await import('../src/encode-project-path.js');

function writeSession(folder, sessionId, cwd, text, timestamp) {
  const folderPath = path.join(projectsDir, folder);
  fs.mkdirSync(folderPath, { recursive: true });
  const line = JSON.stringify({
    type: 'user', cwd, timestamp,
    message: { role: 'user', content: text },
  });
  fs.writeFileSync(path.join(folderPath, `${sessionId}.jsonl`), line + '\n', 'utf8');
}

test('populateCacheSync indexes fixture transcripts into projects/sessions', () => {
  const projectPath = '/tmp/fixture-project';
  const folder = encodeProjectPath(projectPath);
  writeSession(folder, 'session-a', projectPath, 'hello from a', '2026-01-01T00:00:00.000Z');
  writeSession(folder, 'session-b', projectPath, 'hello from b', '2026-01-02T00:00:00.000Z');

  sessionIndex.populateCacheSync();

  const projects = sessionIndex.buildProjectsFromCache(false);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].projectPath, projectPath);
  assert.equal(projects[0].sessions.length, 2);
  // Sorted by modified desc.
  assert.equal(projects[0].sessions[0].sessionId, 'session-b');
});

test('archiving a session hides it from the default list and shows it with showArchived', () => {
  db.setArchived('session-a', true);

  const withoutArchived = sessionIndex.buildProjectsFromCache(false);
  const ids = withoutArchived[0].sessions.map(s => s.sessionId);
  assert.ok(!ids.includes('session-a'));

  const withArchived = sessionIndex.buildProjectsFromCache(true);
  const archivedRow = withArchived[0].sessions.find(s => s.sessionId === 'session-a');
  assert.ok(archivedRow);
  assert.equal(archivedRow.archived, 1);

  db.setArchived('session-a', false);
  const restored = sessionIndex.buildProjectsFromCache(false);
  assert.ok(restored[0].sessions.map(s => s.sessionId).includes('session-a'));
});

test('hiddenProjects setting excludes a project entirely', () => {
  const projectPath = '/tmp/fixture-project';
  db.setSetting('global', { hiddenProjects: [projectPath] });

  const projects = sessionIndex.buildProjectsFromCache(true);
  assert.equal(projects.length, 0);

  db.setSetting('global', {});
});

test.after(() => {
  db.closeDb();
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(projectsDir, { recursive: true, force: true });
});
