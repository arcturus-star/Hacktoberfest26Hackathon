const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../backend/src/server');
const api = createServer();
const handler = api.listeners('request')[0];
api.removeAllListeners('request');
api.on('request', (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    res.end(fs.readFileSync(path.join(__dirname, '../frontend/index.html')));
  } else handler(req, res);
});
api.listen(Number(process.env.PORT || 3001), '127.0.0.1', () => console.log('Demo: http://localhost:' + (process.env.PORT || 3001)));
