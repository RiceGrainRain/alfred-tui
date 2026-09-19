// Vendored + trimmed (ESM-converted) from switchboard/harnesses/claude.js.
//
// Owns everything specific to how the `claude` CLI stores sessions on disk:
//   - transcript layout: ~/.claude/projects/<encoded-project>/<sessionId>.jsonl
//   - transcript format: one JSON object per line
//
// Launch-flag building, activity signalling (OSC title/notification parsing),
// and fork-detection are switchboard concerns (launching/monitoring a live
// PTY session) that alfred-tui, a passive read/archive viewer, doesn't need
// and has deliberately not vendored.
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { scanLines } from './jsonl-scan.js';

// Overridable so tests can point at a fixture directory instead of the
// user's real ~/.claude/projects, mirroring db.js's SWITCHBOARD_DATA_DIR.
function sessionsRoot() {
  if (process.env.ALFRED_TUI_CLAUDE_PROJECTS_DIR) {
    return path.resolve(process.env.ALFRED_TUI_CLAUDE_PROJECTS_DIR);
  }
  return path.join(os.homedir(), '.claude', 'projects');
}

function listFolders() {
  try {
    return fs.readdirSync(sessionsRoot(), { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '.git')
      .map(d => d.name);
  } catch {
    return [];
  }
}

function folderPath(folder) {
  return path.join(sessionsRoot(), folder);
}

/** Transcript files inside a folder directory, as absolute paths. */
function listTranscripts(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => path.join(dir, f));
  } catch {
    return [];
  }
}

/** Claude names each transcript after its session id. */
function sessionIdFromPath(filePath) {
  return path.basename(filePath, '.jsonl');
}

/**
 * Absolute transcript path for a cached row. `sessionFile` is authoritative
 * when present; rows written before that column existed reconstruct the path
 * from folder + sessionId, which is exactly how Claude names its files.
 */
function transcriptPath({ sessionId, folder, sessionFile }) {
  if (sessionFile) return sessionFile;
  return path.join(folderPath(folder), sessionId + '.jsonl');
}

// --- Project path derivation ---

function extractCwdFromJsonl(filePath) {
  let cwd = null;
  const readCwd = (line) => {
    try {
      const entry = JSON.parse(line);
      if (entry.cwd) { cwd = entry.cwd; return false; }
    } catch {}
  };
  try {
    const { tail } = scanLines(filePath, 0, readCwd);
    if (!cwd && tail) readCwd(tail);
  } catch { return null; }
  return cwd;
}

/** The project a folder belongs to, read out of any transcript it contains. */
function deriveProjectPath(folderPath) {
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.jsonl')) {
        const cwd = extractCwdFromJsonl(path.join(folderPath, e.name));
        if (cwd) return cwd;
      }
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const subDir = path.join(folderPath, e.name);
      try {
        const subFiles = fs.readdirSync(subDir, { withFileTypes: true });
        for (const sf of subFiles) {
          let jsonlPath;
          if (sf.isFile() && sf.name.endsWith('.jsonl')) {
            jsonlPath = path.join(subDir, sf.name);
          } else if (sf.isDirectory() && sf.name === 'subagents') {
            const agentFiles = fs.readdirSync(path.join(subDir, 'subagents')).filter(f => f.endsWith('.jsonl'));
            if (agentFiles.length > 0) jsonlPath = path.join(subDir, 'subagents', agentFiles[0]);
          }
          if (jsonlPath) {
            const cwd = extractCwdFromJsonl(jsonlPath);
            if (cwd) return cwd;
          }
        }
      } catch {}
    }
  } catch {}
  return null;
}

// --- Transcript parsing ---

const HEAD_BYTES = 4096; // guard window for append-only transcripts

function hashHead(fd, stat) {
  const n = Math.min(HEAD_BYTES, stat.size);
  if (n === 0) return '';
  const buf = Buffer.allocUnsafe(n);
  if (fs.readSync(fd, buf, 0, n, 0) !== n) throw new Error('JSONL head changed during read');
  return 'v3:' + crypto.createHash('sha1')
    .update(`${stat.dev}:${stat.ino}:`).update(buf).digest('hex');
}

/** Accumulator. Every field is either a first-occurrence or a running total,
 *  which is what makes resuming mid-file valid. */
function emptyState() {
  return { summary: '', messageCount: 0, textParts: [], slug: null, customTitle: null, aiTitle: null, firstTimestamp: null, lastTimestamp: null };
}

function stateFrom(prev) {
  return {
    summary: prev.summary || '',
    messageCount: prev.messageCount || 0,
    textParts: prev.textContent ? [prev.textContent] : [],
    slug: prev.slug || null,
    customTitle: prev.customTitle || null,
    aiTitle: prev.aiTitle || null,
    firstTimestamp: prev.firstTimestamp || null,
    lastTimestamp: prev.lastTimestamp || null,
  };
}

/** Extract the plain-text content of one transcript line's message, if any. */
function textOf(msg) {
  return typeof msg === 'string' ? msg :
    (typeof msg?.content === 'string' ? msg.content :
    (Array.isArray(msg?.content) ? msg.content
      .filter(block => block?.type === 'text' && typeof block.text === 'string')
      .map(block => block.text).join('\n') : ''));
}

function applyLine(line, st) {
  let entry;
  try { entry = JSON.parse(line); } catch { return; }

  if (entry.timestamp) {
    if (!st.firstTimestamp || entry.timestamp < st.firstTimestamp) st.firstTimestamp = entry.timestamp;
    if (!st.lastTimestamp || entry.timestamp > st.lastTimestamp) st.lastTimestamp = entry.timestamp;
  }

  if (entry.slug && !st.slug) st.slug = entry.slug;
  if (entry.type === 'custom-title' && entry.customTitle) st.customTitle = entry.customTitle;
  if (entry.type === 'ai-title' && entry.aiTitle) st.aiTitle = entry.aiTitle;

  const isConversationMessage = entry.type === 'user' || entry.type === 'assistant' ||
    (entry.type === 'message' && (entry.role === 'user' || entry.role === 'assistant'));
  if (isConversationMessage) {
    st.messageCount++;
  }

  const text = textOf(entry.message);

  if (!st.summary && (entry.type === 'user' || (entry.type === 'message' && entry.role === 'user'))) {
    if (text && !/<bash-input>|<bash-stdout>|<local-command-caveat>/.test(text)) {
      const taskMatch = text.match(/<scheduled-task\s+name="([^"]+)"/);
      st.summary = taskMatch ? 'Scheduled: ' + taskMatch[1] : text.slice(0, 120);
    }
  }

  if (isConversationMessage && text) st.textParts.push(text);
}

/**
 * Parse metadata in bounded chunks. A cached row lets append-only transcripts
 * resume at the previous newline instead of re-reading their entire history.
 */
function readSessionFile(filePath, folder, projectPath, prev = null) {
  const sessionId = path.basename(filePath, '.jsonl');
  let fd = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    const fileMtime = stat.mtime.toISOString();
    const headHash = hashHead(fd, stat);
    const canResume = !!prev && !!headHash
      && prev.runtime === 'claude' && prev.sessionId === sessionId
      && prev.sessionFile === filePath && prev.headHash === headHash
      && Number.isSafeInteger(prev.indexedBytes) && prev.indexedBytes > 0
      && prev.indexedBytes <= stat.size
      && (prev.indexedBytes < stat.size || prev.fileMtime === fileMtime);
    const st = canResume ? stateFrom(prev) : emptyState();
    const start = canResume ? prev.indexedBytes : 0;
    const { consumed, read, tail } = scanLines(fd, start, line => applyLine(line, st), stat.size);
    if (tail) applyLine(tail, st);
    const after = fs.fstatSync(fd);
    if (after.size < stat.size || (after.size === stat.size && after.mtimeMs !== stat.mtimeMs)) return null;
    if (!st.summary || st.messageCount < 1) return null;
    return {
      sessionId, folder, projectPath, runtime: 'claude', sessionFile: filePath,
      summary: st.summary, firstPrompt: st.summary,
      created: st.firstTimestamp || stat.birthtime.toISOString(),
      modified: st.lastTimestamp || fileMtime,
      fileMtime,
      messageCount: st.messageCount, textContent: st.textParts.join('\n'),
      slug: st.slug, customTitle: st.customTitle, aiTitle: st.aiTitle,
      firstTimestamp: st.firstTimestamp, lastTimestamp: st.lastTimestamp,
      headHash,
      indexedBytes: tail ? 0 : consumed,
      bytesRead: read + Math.min(HEAD_BYTES, stat.size),
    };
  } catch {
    return null;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
  }
}

export {
  sessionsRoot, listFolders, folderPath, listTranscripts, sessionIdFromPath,
  transcriptPath, deriveProjectPath, readSessionFile, textOf,
};
