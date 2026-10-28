const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const port = Number(process.env.FRONTEND_PORT || 5173);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.stderr.write('Frontend startup failed: FRONTEND_PORT must be an integer from 1 to 65535.\n');
  process.exit(1);
}

http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400); response.end('Bad request'); return; }
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) { response.writeHead(403); response.end('Forbidden'); return; }

  fs.stat(file, (statError, stat) => {
    if (statError || !stat.isFile()) { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found'); return; }
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; connect-src 'self' http://localhost:3001; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    if (request.method === 'HEAD') { response.end(); return; }
    fs.createReadStream(file).pipe(response);
  });
}).listen(port, '127.0.0.1', () => process.stdout.write(`LboroConnect frontend listening on http://localhost:${port}\n`));
