const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../backend/src/server');
const frontendRoot = path.resolve(__dirname, '../frontend');
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const api = createServer();
const handler = api.listeners('request')[0];
api.removeAllListeners('request');
api.on('request', (req, res) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('Bad request'); return; }
    if (pathname === '/') pathname = '/index.html';
    const file = path.resolve(frontendRoot, `.${pathname}`);
    if (file !== frontendRoot && !file.startsWith(`${frontendRoot}${path.sep}`)) { res.writeHead(403); res.end('Forbidden'); return; }
    if (contentTypes[path.extname(file)]) {
      fs.stat(file, (error, stat) => {
        if (error || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, {
          'Content-Type': contentTypes[path.extname(file)],
          'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'self'; connect-src 'self' http://localhost:3001; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
          'X-Content-Type-Options': 'nosniff',
        });
        if (req.method === 'HEAD') { res.end(); return; }
        fs.createReadStream(file).pipe(res);
      });
      return;
    }
  }
  handler(req, res);
});
api.listen(Number(process.env.PORT || 3001), '127.0.0.1', () => console.log('Demo: http://localhost:' + (process.env.PORT || 3001)));
