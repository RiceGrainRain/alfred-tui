// Builds a self-contained fake HOME for recording the README demo:
// ~/.claude/projects transcripts, ~/.claude/plans, a few git repos with
// pending changes, a stub `claude` on PATH, and a neutral tmux/zsh config.
// Nothing here reads from the real HOME.
//
//   node docs/demo/make-fixtures.mjs <root>
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const root = path.resolve(process.argv[2] || '/tmp/alfred-demo');
const home = path.join(root, 'home');
fs.rmSync(root, { recursive: true, force: true });

const write = (p, s, mode) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, mode ? { mode } : undefined);
};
const minsAgo = (m) => new Date(Date.now() - m * 60_000);

// ── Projects + sessions ──────────────────────────────────────────────────
const projects = {
  'acme/api': [
    {
      ago: 2, title: 'Add rate limiting to /v1/orders',
      turns: [
        ['user', 'The /v1/orders endpoint is getting hammered by one client. Can you add per-API-key rate limiting?'],
        ['assistant', "I'll add a token-bucket limiter keyed on the API key.\n\n## Plan\n\n1. Add a `RateLimiter` middleware backed by Redis\n2. Apply it to `/v1/orders` at **100 req/min**\n3. Return `429` with a `Retry-After` header\n\n```ts\napp.use('/v1/orders', rateLimit({ perMinute: 100, key: req => req.apiKey }));\n```"],
        ['user', 'Looks good. Make the limit configurable per plan tier.'],
        ['assistant', 'Done — limits now come from `config/tiers.yaml`:\n\n| Tier | Requests/min |\n| --- | --- |\n| free | 60 |\n| pro | 600 |\n| enterprise | 6000 |\n\nAll 48 tests pass.'],
      ],
    },
    {
      ago: 95, title: 'Fix flaky payment webhook test',
      turns: [
        ['user', 'test/webhooks/payment.test.ts fails about 1 in 10 runs on CI. Can you find out why?'],
        ['assistant', 'The test relies on wall-clock time for signature expiry. I replaced `Date.now()` with an injected clock so the signature window is deterministic.'],
      ],
    },
    {
      ago: 60 * 26, title: 'Migrate orders table to UUID keys',
      turns: [
        ['user', 'Plan a zero-downtime migration of orders.id from serial to UUID.'],
        ['assistant', 'Three-phase approach: add a `uuid` column with a default, backfill in batches, then swap the primary key behind a feature flag.'],
      ],
    },
  ],
  'acme/web': [
    {
      ago: 18, title: 'Dark mode for settings page',
      turns: [
        ['user', 'Add dark mode support to the settings page using our existing CSS variables.'],
        ['assistant', 'I mapped the settings components onto the `--surface-*` and `--text-*` tokens and added a `prefers-color-scheme` media query plus a manual toggle.'],
      ],
    },
    {
      ago: 60 * 5, title: 'Speed up product grid rendering',
      turns: [
        ['user', 'The product grid drops frames when scrolling 500+ items.'],
        ['assistant', 'Virtualized the grid with a windowed list — scroll now stays at 60fps with 5,000 items.'],
      ],
    },
  ],
  'side/dotfiles': [
    {
      ago: 60 * 50, title: 'Tidy up zsh startup time',
      turns: [
        ['user', 'My shell takes 1.2s to start. Help me profile it.'],
        ['assistant', 'Most of the time is `nvm` initialization. Lazy-loading it brings startup to ~90ms.'],
      ],
    },
  ],
};

for (const [rel, sessions] of Object.entries(projects)) {
  const cwd = path.join(home, 'code', rel);
  fs.mkdirSync(cwd, { recursive: true });
  const folder = path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  for (const s of sessions) {
    const sessionId = crypto.randomUUID();
    const start = minsAgo(s.ago + s.turns.length);
    const lines = [{ type: 'ai-title', aiTitle: s.title, sessionId }];
    s.turns.forEach(([role, text], i) => {
      const timestamp = new Date(start.getTime() + i * 60_000).toISOString();
      lines.push(role === 'user'
        ? { type: 'user', sessionId, cwd, timestamp, message: { role: 'user', content: text } }
        : { type: 'assistant', sessionId, cwd, timestamp, message: { role: 'assistant', content: [{ type: 'text', text }] } });
    });
    write(path.join(folder, `${sessionId}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  }
}

// ── Plans ────────────────────────────────────────────────────────────────
write(path.join(home, '.claude', 'plans', 'rate-limiting.md'), `# Per-key rate limiting for the orders API

## Context
One client is sending bursts that starve everyone else.

## Steps
- [x] Token-bucket middleware backed by Redis
- [x] Per-tier limits from \`config/tiers.yaml\`
- [ ] Dashboard panel for 429 rates
- [ ] Document limits in the public API reference
`);
write(path.join(home, '.claude', 'plans', 'uuid-migration.md'), `# Zero-downtime UUID migration

1. Add nullable \`uuid\` column with default \`gen_random_uuid()\`
2. Backfill in batches of 10k
3. Dual-write, then swap the primary key behind a flag
`);
write(path.join(home, 'code', 'acme', 'web', 'plan-tracker.md'), `# Web app polish

## Phase 1: Theming
- [x] Audit colour tokens
- [x] Dark mode for settings

## Phase 2: Performance
- [x] Virtualize product grid
- [ ] Lazy-load hero images

## Phase 3: Accessibility
- [ ] Keyboard navigation audit
- [ ] Screen-reader labels on icon buttons
`);

// ── Git repos with pending changes ───────────────────────────────────────
const gitEnv = {
  ...process.env, HOME: home,
  GIT_AUTHOR_NAME: 'Demo', GIT_AUTHOR_EMAIL: 'demo@example.com',
  GIT_COMMITTER_NAME: 'Demo', GIT_COMMITTER_EMAIL: 'demo@example.com',
};
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: gitEnv, stdio: 'ignore' });
const repo = (rel, files, changes) => {
  const cwd = path.join(home, 'code', rel);
  for (const [f, s] of Object.entries(files)) write(path.join(cwd, f), s);
  git(cwd, 'init', '-q', '-b', 'main');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'Initial commit');
  for (const [f, s] of Object.entries(changes)) write(path.join(cwd, f), s);
};
repo('acme/api', {
  'README.md': '# acme api\n',
  'package.json': '{ "name": "acme-api", "version": "1.4.0" }\n',
  'src/server.ts': "import express from 'express';\nimport { orders } from './routes/orders';\n\nconst app = express();\napp.use('/v1/orders', orders);\napp.listen(3000);\n",
  'src/routes/orders.ts': "import { Router } from 'express';\nexport const orders = Router();\norders.get('/', (req, res) => res.json([]));\n",
  'test/orders.test.ts': "test('lists orders', () => {});\n",
}, {
  'src/server.ts': "import express from 'express';\nimport { orders } from './routes/orders';\nimport { rateLimit } from './middleware/rate-limit';\n\nconst app = express();\napp.use('/v1/orders', rateLimit({ perMinute: 100 }), orders);\napp.listen(3000);\n",
  'src/middleware/rate-limit.ts': "export function rateLimit({ perMinute }: { perMinute: number }) {\n  return (req, res, next) => next();\n}\n",
  'config/tiers.yaml': 'free: 60\npro: 600\nenterprise: 6000\n',
});
repo('acme/web', {
  'index.html': '<!doctype html>\n<title>acme</title>\n',
  'src/settings.css': ':root { --surface-1: #fff; }\n',
}, {
  'src/settings.css': ':root { --surface-1: #fff; }\n@media (prefers-color-scheme: dark) { :root { --surface-1: #111; } }\n',
});
repo('side/dotfiles', { '.zshrc': 'export EDITOR=nvim\n' }, {});

// ── Stub `claude`, neutral shell + tmux config ───────────────────────────
write(path.join(root, 'bin', 'claude'), `#!/bin/sh
clear
printf '\\033[38;5;173m╭──────────────────────────────────────────╮\\033[0m\\n'
printf '\\033[38;5;173m│\\033[0m ✻ Welcome to Claude Code                  \\033[38;5;173m│\\033[0m\\n'
printf '\\033[38;5;173m│\\033[0m   cwd: %-34s\\033[38;5;173m│\\033[0m\\n' "$(basename "$(pwd)")"
printf '\\033[38;5;173m╰──────────────────────────────────────────╯\\033[0m\\n\\n'
case "$1" in
  --resume) printf '\\033[2m  Resumed session %s\\033[0m\\n\\n' "$(echo "$2" | cut -c1-8)"
            printf '> Make the limit configurable per plan tier.\\n\\n'
            printf '\\033[38;5;173m⏺\\033[0m Done — limits now come from config/tiers.yaml.\\n'
            printf '  All 48 tests pass.\\n\\n' ;;
esac
printf '\\033[2m──────────────────────────────────────────\\033[0m\\n> '
exec cat >/dev/null
`, 0o755);
write(path.join(home, '.zshrc'), "PROMPT='%F{blue}%1~%f %# '\nunsetopt PROMPT_SP\n");
write(path.join(home, '.tmux.conf'), [
  'set -g default-shell /bin/zsh',
  'set -g default-terminal "tmux-256color"',
  'set -g status off',
  'set -g pane-border-lines heavy',
  'set -g pane-active-border-style fg=colour173',
  '',
].join('\n'));

console.log(root);
