// SQLite store for archive/star state and the session-list cache
// (~/.alfred/alfred.db, overridable via ALFRED_DATA_DIR).
//
// The migration array and schema-reconciliation block below are kept
// UNMODIFIED (including steps that only affect tables alfred doesn't create,
// guarded by try/catch) so databases carried over by the legacy import below
// keep a consistent `db_version`.
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const DATA_DIR = process.env.ALFRED_DATA_DIR
  ? path.resolve(process.env.ALFRED_DATA_DIR)
  : path.join(os.homedir(), '.alfred');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'alfred.db');

// One-time import: earlier versions kept their data in a different location.
// On the first run with the default data dir, copy that database over so
// existing stars/archives carry forward. VACUUM INTO folds any pending WAL
// into a single consistent file; the legacy file itself is left untouched.
const LEGACY_DB_PATH = path.join(os.homedir(), '.switchboard', 'switchboard.db');
if (!process.env.ALFRED_DATA_DIR && !fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
  try {
    const legacy = new Database(LEGACY_DB_PATH, { readonly: true, fileMustExist: true });
    legacy.prepare('VACUUM INTO ?').run(DB_PATH);
    legacy.close();
  } catch {
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  }
}

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS session_meta (
    sessionId TEXT PRIMARY KEY,
    name TEXT,
    starred INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS session_cache (
    sessionId TEXT PRIMARY KEY,
    folder TEXT NOT NULL,
    projectPath TEXT,
    summary TEXT,
    firstPrompt TEXT,
    created TEXT,
    modified TEXT,
    messageCount INTEGER DEFAULT 0,
    slug TEXT,
    aiTitle TEXT,
    fileMtime TEXT,
    runtime TEXT NOT NULL DEFAULT 'claude',
    sessionFile TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS cache_meta (
    folder TEXT PRIMARY KEY,
    projectPath TEXT,
    indexMtimeMs REAL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_session_cache_folder ON session_cache(folder)');
db.exec('CREATE INDEX IF NOT EXISTS idx_session_cache_slug ON session_cache(slug)');

// --- Migrations (kept verbatim — see note above) ---
const migrations = [
  () => {},
  (db) => {
    try { db.exec('DELETE FROM session_cache'); } catch {}
    try { db.exec('DELETE FROM cache_meta'); } catch {}
    try { db.exec('DELETE FROM search_map'); } catch {}
    try { db.exec('DROP TABLE IF EXISTS search_fts'); } catch {}
  },
  (db) => {
    try { db.exec('ALTER TABLE session_cache ADD COLUMN aiTitle TEXT'); } catch {}
    try { db.exec('DELETE FROM session_cache'); } catch {}
    try { db.exec('DELETE FROM cache_meta'); } catch {}
  },
  () => {},
];

const currentDbVersion = (() => {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'db_version'").get();
    return row ? JSON.parse(row.value) : 0;
  } catch { return 0; }
})();

for (let i = currentDbVersion; i < migrations.length; i++) {
  migrations[i](db);
}
if (migrations.length > currentDbVersion) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('db_version', ?)").run(JSON.stringify(migrations.length));
}

// --- Schema reconciliation (copied verbatim — column presence, not db_version) ---
{
  const cols = new Set(db.prepare('PRAGMA table_info(session_cache)').all().map(c => c.name));
  if (!cols.has('aiTitle')) db.exec('ALTER TABLE session_cache ADD COLUMN aiTitle TEXT');
  if (!cols.has('fileMtime')) {
    db.exec('ALTER TABLE session_cache ADD COLUMN fileMtime TEXT');
    db.exec('DELETE FROM session_cache');
    db.exec('DELETE FROM cache_meta');
  }
  if (!cols.has('runtime')) db.exec("ALTER TABLE session_cache ADD COLUMN runtime TEXT DEFAULT 'claude'");
  if (!cols.has('sessionFile')) db.exec('ALTER TABLE session_cache ADD COLUMN sessionFile TEXT');
  for (const col of [
    'customTitle TEXT', 'textContent TEXT', 'headHash TEXT',
    'indexedBytes INTEGER DEFAULT 0', 'firstTimestamp TEXT', 'lastTimestamp TEXT',
  ]) {
    if (!cols.has(col.split(' ')[0])) db.exec(`ALTER TABLE session_cache ADD COLUMN ${col}`);
  }
}

const stmts = {
  get: db.prepare('SELECT * FROM session_meta WHERE sessionId = ?'),
  getAll: db.prepare('SELECT * FROM session_meta'),
  upsertArchived: db.prepare(`
    INSERT INTO session_meta (sessionId, archived) VALUES (?, ?)
    ON CONFLICT(sessionId) DO UPDATE SET archived = excluded.archived
  `),
  upsertName: db.prepare(`
    INSERT INTO session_meta (sessionId, name) VALUES (?, ?)
    ON CONFLICT(sessionId) DO UPDATE SET name = excluded.name
  `),
  upsertStar: db.prepare(`
    INSERT INTO session_meta (sessionId, starred) VALUES (?, 1)
    ON CONFLICT(sessionId) DO UPDATE SET starred = CASE WHEN starred = 1 THEN 0 ELSE 1 END
  `),
  cacheCount: db.prepare('SELECT COUNT(*) as cnt FROM session_cache'),
  cacheGetAll: db.prepare(`
    SELECT sessionId, folder, projectPath, summary, firstPrompt, created, modified,
           messageCount, slug, aiTitle, fileMtime, runtime, sessionFile
    FROM session_cache
  `),
  cacheUpsert: db.prepare(`
    INSERT INTO session_cache (sessionId, folder, projectPath, summary, firstPrompt, created, modified, messageCount, slug, aiTitle, fileMtime, runtime, sessionFile, customTitle, textContent, headHash, indexedBytes, firstTimestamp, lastTimestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sessionId) DO UPDATE SET
      folder = excluded.folder, projectPath = excluded.projectPath,
      summary = excluded.summary, firstPrompt = excluded.firstPrompt,
      created = excluded.created, modified = excluded.modified,
      messageCount = excluded.messageCount, slug = excluded.slug,
      aiTitle = excluded.aiTitle, fileMtime = excluded.fileMtime,
      runtime = excluded.runtime, sessionFile = excluded.sessionFile,
      customTitle = excluded.customTitle, textContent = excluded.textContent,
      headHash = excluded.headHash, indexedBytes = excluded.indexedBytes,
      firstTimestamp = excluded.firstTimestamp, lastTimestamp = excluded.lastTimestamp
  `),
  cacheGetByFolder: db.prepare('SELECT sessionId, fileMtime FROM session_cache WHERE folder = ?'),
  cacheGetSession: db.prepare('SELECT * FROM session_cache WHERE sessionId = ?'),
  cacheDeleteSession: db.prepare('DELETE FROM session_cache WHERE sessionId = ?'),
  cacheDeleteFolder: db.prepare('DELETE FROM session_cache WHERE folder = ?'),
  metaGet: db.prepare('SELECT * FROM cache_meta WHERE folder = ?'),
  metaGetAll: db.prepare('SELECT * FROM cache_meta'),
  metaUpsert: db.prepare(`
    INSERT INTO cache_meta (folder, projectPath, indexMtimeMs)
    VALUES (?, ?, ?)
    ON CONFLICT(folder) DO UPDATE SET
      projectPath = excluded.projectPath, indexMtimeMs = excluded.indexMtimeMs
  `),
  metaDelete: db.prepare('DELETE FROM cache_meta WHERE folder = ?'),
  settingsGet: db.prepare('SELECT value FROM settings WHERE key = ?'),
  settingsUpsert: db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `),
};

function getMeta(sessionId) {
  return stmts.get.get(sessionId) || null;
}

function getAllMeta() {
  const rows = stmts.getAll.all();
  const map = new Map();
  for (const row of rows) map.set(row.sessionId, row);
  return map;
}

function setName(sessionId, name) {
  stmts.upsertName.run(sessionId, name);
}

function setArchived(sessionId, archived) {
  stmts.upsertArchived.run(sessionId, archived ? 1 : 0);
}

function toggleStar(sessionId) {
  stmts.upsertStar.run(sessionId);
  const row = stmts.get.get(sessionId);
  return row.starred;
}

function isCachePopulated() {
  return stmts.cacheCount.get().cnt > 0;
}

function getAllCached() {
  return stmts.cacheGetAll.all();
}

const upsertCachedSessionsBatch = db.transaction((sessions) => {
  for (const s of sessions) {
    stmts.cacheUpsert.run(
      s.sessionId, s.folder, s.projectPath, s.summary,
      s.firstPrompt, s.created, s.modified, s.messageCount || 0,
      s.slug || null, s.aiTitle || null, s.fileMtime || null,
      s.runtime || 'claude', s.sessionFile || null,
      s.customTitle || null, s.textContent || null, s.headHash || null,
      s.indexedBytes || 0, s.firstTimestamp || null, s.lastTimestamp || null
    );
  }
});

function upsertCachedSessions(sessions) {
  upsertCachedSessionsBatch(sessions);
}

function getCachedByFolder(folder) {
  return stmts.cacheGetByFolder.all(folder);
}

function getCachedSession(sessionId) {
  return stmts.cacheGetSession.get(sessionId) || null;
}

function deleteCachedSession(sessionId) {
  stmts.cacheDeleteSession.run(sessionId);
}

function deleteCachedFolder(folder) {
  stmts.cacheDeleteFolder.run(folder);
  stmts.metaDelete.run(folder);
}

function getAllFolderMeta() {
  const rows = stmts.metaGetAll.all();
  const map = new Map();
  for (const row of rows) map.set(row.folder, row);
  return map;
}

function setFolderMeta(folder, projectPath, indexMtimeMs) {
  stmts.metaUpsert.run(folder, projectPath, indexMtimeMs);
}

function getSetting(key) {
  const row = stmts.settingsGet.get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function setSetting(key, value) {
  stmts.settingsUpsert.run(key, JSON.stringify(value));
}

function closeDb() {
  try { db.close(); } catch {}
}

export {
  getMeta, getAllMeta, setName, setArchived, toggleStar,
  isCachePopulated, getAllCached, getCachedByFolder, getCachedSession, upsertCachedSessions,
  deleteCachedSession, deleteCachedFolder,
  getAllFolderMeta, setFolderMeta,
  getSetting, setSetting,
  closeDb,
};
