const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../backend/src/server');
const root = path.resolve(__dirname, '../frontend/dist');
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Build frontend first: cd frontend && npm install && npm run build');
const api = createServer();
const handler = api.listeners('request')[0];
api.removeAllListeners('request');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
api.on('request', (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/api/')) return handler(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405);return res.end();}
  let decoded;
  try {decoded=decodeURIComponent(pathname);} catch {res.writeHead(400);return res.end();}
  const file=path.resolve(root,'.'+(decoded==='/'?'/index.html':decoded));
  if (!file.startsWith(root+path.sep)) {res.writeHead(403);return res.end();}
  fs.readFile(file,(error,body)=>{if(error){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);});
});
const port=Number(process.env.PORT||3001);
api.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Demo: http://localhost:${port}`));
