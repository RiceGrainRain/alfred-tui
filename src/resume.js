// Resuming a session is a single spawn — see harness-claude.js's
// buildLaunchArgs in switchboard for the full flag set; alfred-tui only
// needs the plain resume case, not fork/schedule/allowedTools launches.
import { spawn } from 'child_process';

/** Spawn `claude --resume <sessionId>` with the terminal handed over, resolving on exit. */
function resumeInClaude(sessionId) {
  return new Promise((resolve) => {
    const child = spawn('claude', ['--resume', sessionId], { stdio: 'inherit' });
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });
}

export { resumeInClaude };
