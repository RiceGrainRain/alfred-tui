// Vendored verbatim (ESM-converted) from switchboard/encode-project-path.js.
//
// Mirrors Claude CLI's project-folder naming so this matches the folder names
// the CLI itself writes under ~/.claude/projects for a given cwd.
// Reverse-engineered from claude CLI 2.1.126.
function encodeProjectPath(projectPath) {
  const sanitized = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
  if (sanitized.length <= 200) return sanitized;
  let h = 0;
  for (let i = 0; i < projectPath.length; i++) {
    h = (h << 5) - h + projectPath.charCodeAt(i) | 0;
  }
  return sanitized.slice(0, 200) + '-' + Math.abs(h).toString(36);
}

export { encodeProjectPath };
