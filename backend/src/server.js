const http = require('node:http');
const { loadData } = require('./data');
const { createRecommendationService } = require('./recommendations');

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function createServer({ data = loadData(), env = process.env, ranker, now = () => new Date() } = {}) {
  const recommend = createRecommendationService({ ranker, env });
  const configuredOrigin = env.FRONTEND_ORIGIN || '';

  return http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    const corsHeaders = { Vary: 'Origin' };
    if (configuredOrigin && origin === configuredOrigin) {
      corsHeaders['Access-Control-Allow-Origin'] = configuredOrigin;
      corsHeaders['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
      corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type';
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }

    if (request.method !== 'GET') {
      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } }, corsHeaders);
      return;
    }

    let url;
    try {
      url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api/health') {
        sendJson(response, 200, { status: 'ok' }, corsHeaders);
        return;
      }
      if (url.pathname === '/api/students') {
        sendJson(response, 200, { students: data.students.map(({ id, name, interests }) => ({ id, name, interests })) }, corsHeaders);
        return;
      }
      if (url.pathname === '/api/activities') {
        sendJson(response, 200, { activities: data.activities }, corsHeaders);
        return;
      }

      const match = /^\/api\/students\/([^/]+)\/recommendations$/.exec(url.pathname);
      if (match) {
        let studentId;
        try { studentId = decodeURIComponent(match[1]); }
        catch { sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } }, corsHeaders); return; }
        const student = data.students.find((item) => item.id === studentId);
        if (!student) {
          sendJson(response, 404, { error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found.' } }, corsHeaders);
          return;
        }
        const rawLimit = url.searchParams.get('limit');
        const limit = rawLimit === null ? 5 : Number(rawLimit);
        if ((rawLimit !== null && !/^\d+$/.test(rawLimit)) || !Number.isInteger(limit) || limit < 1 || limit > 20) {
          sendJson(response, 400, { error: { code: 'INVALID_LIMIT', message: 'Limit must be an integer from 1 to 20.' } }, corsHeaders);
          return;
        }
        const result = await recommend({ ...data, student, limit, now: now() });
        sendJson(response, 200, { studentId, ...result }, corsHeaders);
        return;
      }
      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } }, corsHeaders);
    } catch {
      sendJson(response, 500, { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } }, corsHeaders);
    }
  });
}

if (require.main === module) {
  let data;
  try {
    data = loadData();
  } catch (error) {
    process.stderr.write(`Backend startup failed: ${error.message}\n`);
    process.exitCode = 1;
  }
  if (data) {
    const port = Number(process.env.PORT || 3001);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stderr.write('Backend startup failed: PORT must be an integer from 1 to 65535.\n');
      process.exitCode = 1;
    } else {
      createServer({ data }).listen(port, () => process.stdout.write(`LboroConnect backend listening on http://localhost:${port}\n`));
    }
  }
}

module.exports = { createServer };
