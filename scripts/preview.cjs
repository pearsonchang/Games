'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ico': 'image/x-icon'};

function createPreviewHandler(directory) {
  const root = path.resolve(directory);
  return async (request, response) => {
    // Local previews change in place. Always return a complete current asset,
    // including to frames reusing a script previously loaded by the lobby.
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, {Allow: 'GET, HEAD'}); response.end(); return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let filename = path.resolve(root, '.' + pathname);
      if (filename !== root && !filename.startsWith(root + path.sep)) throw Error('Outside preview directory');
      if (pathname.endsWith('/')) filename = path.join(filename, 'index.html');
      else if (!path.extname(filename)) filename += '.html';
      const real = await fs.realpath(filename);
      if (!real.startsWith(root + path.sep)) throw Error('Outside preview directory');
      const body = await fs.readFile(real);
      response.writeHead(200, {'Content-Type': types[path.extname(real).toLowerCase()] || 'application/octet-stream', 'Content-Length': body.length});
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
      response.end(request.method === 'HEAD' ? undefined : 'Preview file not found. Run npm run build first.');
    }
  };
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..', process.argv.includes('--source') ? 'src' : 'dist');
  const port = Number(process.env.PLAYROOM_PREVIEW_PORT || 8765);
  const server = http.createServer(createPreviewHandler(root));
  server.on('error', error => { console.error(`Preview could not start: ${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`PLAYROOM preview: http://127.0.0.1:${port}/ (${path.basename(root)}, cache disabled)`));
}
module.exports = {createPreviewHandler};
