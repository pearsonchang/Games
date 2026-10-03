'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {configuredStore} = require('../server/store.cjs');
const {createHandler} = require('../server/http.cjs');
const root = path.resolve(__dirname, '../dist');
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Run npm run build first');
const store = configuredStore();
const api = createHandler(() => store);
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpeg': 'image/jpeg'};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/playroom') return api(req, res);
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  let relative;
  try { relative = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
  if (relative.split('/').some(part => part.startsWith('.') && part !== '')) { res.writeHead(404).end(); return; }
  if (relative.endsWith('/')) relative += 'index.html';
  else if (!path.extname(relative)) relative += '.html';
  const file = path.resolve(root, '.' + relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
});
server.listen(Number(process.env.PORT || 8765), '127.0.0.1', () => console.log(`PLAYROOM: http://127.0.0.1:${server.address().port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => { store.close?.(); process.exit(0); }));
