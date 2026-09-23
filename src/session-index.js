// Session-list index: scans ~/.claude/projects into the SQLite cache in db.js
// and serves the sidebar from it. Cold starts use a plain synchronous loop
// (populateCacheSync) — a CLI can afford to block briefly, so no worker
// threads. hiddenProjects/disabledHarnesses settings are honored.
import fs from 'fs';
import path from 'path';
import { getFolderIndexMtimeMs } from './folder-index-state.js';
import { encodeProjectPath } from './encode-project-path.js';
import * as claude from './harness-claude.js';
import * as db from './db.js';

const PROJECTS_DIR = claude.sessionsRoot();

function resolveFolderPath(folder) {
  return path.join(PROJECTS_DIR, folder);
}

function listAllFolders() {
  const global = db.getSetting('global') || {};
  const disabled = new Set(global.disabledHarnesses || []);
  if (disabled.has('claude')) return [];
  try {
    return fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '.git')
      .map(d => d.name);
  } catch {
    return [];
  }
}

/** Refresh a single folder incrementally: only re-read changed/new transcripts. */
function refreshFolder(folder) {
  const folderPath = resolveFolderPath(folder);
  if (!fs.existsSync(folderPath)) {
    db.deleteCachedFolder(folder);
    return;
  }
  const indexMtimeMs = getFolderIndexMtimeMs(folderPath);
  const folderProject = claude.deriveProjectPath(folderPath);
  if (!folderProject) {
    db.setFolderMeta(folder, null, indexMtimeMs);
    return;
  }

  const cachedSessions = db.getCachedByFolder(folder);
  const cachedMap = new Map(); // sessionId -> fileMtime ISO string
  for (const row of cachedSessions) cachedMap.set(row.sessionId, row.fileMtime);

  const transcripts = claude.listTranscripts(folderPath);
  const currentIds = new Set();
  const sessionsToUpsert = [];
  const namesToSet = [];
  const sessionsToDelete = [];

  for (const filePath of transcripts) {
    const sessionId = claude.sessionIdFromPath(filePath);
    if (!sessionId) continue;
    currentIds.add(sessionId);

    let fileMtime;
    try { fileMtime = fs.statSync(filePath).mtime.toISOString(); } catch { continue; }
    if (cachedMap.has(sessionId) && cachedMap.get(sessionId) === fileMtime) continue;

    const cachedRow = db.getCachedSession(sessionId);
    const sess = claude.readSessionFile(filePath, folder, folderProject, cachedRow);
    if (sess) {
      sessionsToUpsert.push(sess);
      // Only a JSONL custom-title (genuine /title rename) promotes to the DB
      // name column — an AI title must never overwrite a user's rename.
      if (sess.customTitle) namesToSet.push({ id: sess.sessionId, name: sess.customTitle });
    }
  }

  for (const sessionId of cachedMap.keys()) {
    if (!currentIds.has(sessionId)) sessionsToDelete.push(sessionId);
  }

  if (sessionsToUpsert.length > 0) db.upsertCachedSessions(sessionsToUpsert);
  for (const { id, name } of namesToSet) db.setName(id, name);
  for (const sessionId of sessionsToDelete) db.deleteCachedSession(sessionId);

  db.setFolderMeta(folder, folderProject, indexMtimeMs);
}

/** Re-index only folders that are new or whose newest .jsonl changed since last index. */
function reconcileCacheFromFilesystem() {
  const metaMap = db.getAllFolderMeta();
  for (const folder of listAllFolders()) {
    try {
      const meta = metaMap.get(folder);
      const folderPath = resolveFolderPath(folder);
      if (!meta || getFolderIndexMtimeMs(folderPath) > (meta.indexMtimeMs || 0)) {
        refreshFolder(folder);
      }
    } catch (err) {
      // One unreadable folder must not stop the rest.
      console.error('Error reconciling folder', folder, err);
    }
  }
}

/** Cold-start full scan, synchronous (see file header). */
function populateCacheSync(onProgress) {
  const folders = listAllFolders();
  for (let i = 0; i < folders.length; i++) {
    if (onProgress) onProgress(i + 1, folders.length);
    try { refreshFolder(folders[i]); } catch (err) {
      console.error('Error indexing folder', folders[i], err);
    }
  }
}

/** Build the sidebar-style project/session list from the cache. */
function buildProjectsFromCache(showArchived) {
  const metaMap = db.getAllMeta();
  const cachedRows = db.getAllCached();
  const global = db.getSetting('global') || {};
  const hiddenProjects = new Set(global.hiddenProjects || []);
  const disabledHarnesses = new Set(global.disabledHarnesses || []);

  const projectMap = new Map();
  for (const row of cachedRows) {
    if (!row.projectPath) continue;
    if (hiddenProjects.has(row.projectPath)) continue;
    if (disabledHarnesses.has(row.runtime || 'claude')) continue;
    const meta = metaMap.get(row.sessionId);
    const s = {
      sessionId: row.sessionId,
      summary: row.summary,
      firstPrompt: row.firstPrompt,
      created: row.created,
      modified: row.modified,
      messageCount: row.messageCount,
      projectPath: row.projectPath,
      slug: row.slug || null,
      aiTitle: row.aiTitle || null,
      runtime: row.runtime || 'claude',
      sessionFile: row.sessionFile || null,
      folder: row.folder,
      name: meta?.name || null,
      starred: meta?.starred || 0,
      archived: meta?.archived || 0,
    };
    if (!showArchived && s.archived) continue;
    if (!projectMap.has(row.projectPath)) {
      projectMap.set(row.projectPath, {
        folder: encodeProjectPath(row.projectPath),
        projectPath: row.projectPath,
        sessions: [],
      });
    }
    projectMap.get(row.projectPath).sessions.push(s);
  }

  const projects = [];
  for (const proj of projectMap.values()) {
    proj.sessions.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    projects.push(proj);
  }

  projects.sort((a, b) => {
    const aDate = a.sessions[0]?.modified || '';
    const bDate = b.sessions[0]?.modified || '';
    return new Date(bDate) - new Date(aDate);
  });

  return projects;
}

export {
  PROJECTS_DIR, listAllFolders, refreshFolder, reconcileCacheFromFilesystem,
  populateCacheSync, buildProjectsFromCache,
};
