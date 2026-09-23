import { execFileSync } from 'child_process';

export function copyToClipboard(text) {
  if (process.platform === 'darwin') {
    execFileSync('pbcopy', [], { input: text, encoding: 'utf8', stdio: ['pipe', 'ignore', 'ignore'] });
  } else {
    execFileSync('xclip', ['-selection', 'clipboard'], { input: text, encoding: 'utf8', stdio: ['pipe', 'ignore', 'ignore'] });
  }
}
