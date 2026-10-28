const assert = require('node:assert/strict');
const test = require('node:test');
const { createServer } = require('../src/server');
const { loadData } = require('../src/data');

async function withServer(options, callback) {
  const server = createServer({ env: {}, data: loadData(), now: () => new Date('2026-10-28T12:00:00Z'), ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try { await callback(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('health, student and activity endpoints return the documented shapes', async () => {
  await withServer({}, async (base) => {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const students = await fetch(`${base}/api/students`);
    assert.ok((await students.json()).students.length >= 3);

    const activities = await fetch(`${base}/api/activities`);
    const body = await activities.json();
    assert.ok(body.activities.length >= 3);
    assert.ok(body.activities.every((activity) => activity.source === 'synthetic'));
  });
});

test('recommendations resolve to synthetic event records and honor the limit', async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/api/students/S001/recommendations?limit=3`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.studentId, 'S001');
    assert.equal(body.mode, 'fallback');
    assert.ok(body.recommendations.length <= 3);
    const activities = (await (await fetch(`${base}/api/activities`)).json()).activities;
    const ids = new Set(activities.map((activity) => activity.id));
    assert.ok(body.recommendations.every((item) => ids.has(item.activityId) && item.reason));
  });
});

test('validates limits, unknown students, methods and routes', async () => {
  await withServer({}, async (base) => {
    for (const limit of ['0', '21', '-1', 'abc', '1.5']) {
      const response = await fetch(`${base}/api/students/S001/recommendations?limit=${encodeURIComponent(limit)}`);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'INVALID_LIMIT');
    }
    const unknownStudent = await fetch(`${base}/api/students/missing/recommendations`);
    assert.equal(unknownStudent.status, 404);
    assert.equal((await unknownStudent.json()).error.code, 'STUDENT_NOT_FOUND');
    const unknownRoute = await fetch(`${base}/api/missing`);
    assert.equal(unknownRoute.status, 404);
    assert.equal((await unknownRoute.json()).error.code, 'NOT_FOUND');
    const wrongMethod = await fetch(`${base}/api/health`, { method: 'POST' });
    assert.equal(wrongMethod.status, 404);
  });
});

test('responds to preflight and only exposes the configured frontend origin', async () => {
  await withServer({ env: { FRONTEND_ORIGIN: 'http://localhost:5173' } }, async (base) => {
    const options = await fetch(`${base}/api/health`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const denied = await fetch(`${base}/api/health`, { headers: { Origin: 'https://other.example' } });
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  });
});


test('valid provider ranking is exposed through HTTP and respects requested limit', async () => {
  let supplied;
  await withServer({ ranker: async ({ candidates }) => {
    supplied = candidates;
    return candidates.slice().reverse().map(c => ({ activityId: c.id, reason: 'A supplied candidate match.' }));
  } }, async base => {
    const response = await fetch(base + '/api/students/S001/recommendations?limit=2');
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.mode, 'gemma');
    assert.equal(result.notice, null);
    assert.equal(result.recommendations.length, 2);
    assert.deepEqual(result.recommendations.map(r => r.activityId), supplied.slice().reverse().slice(0, 2).map(c => c.id));
  });
});

test('provider failure returns a safe HTTP fallback; empty results skip provider', async () => {
  await withServer({ ranker: async () => { throw new Error('secret-provider-detail'); } }, async base => {
    const response = await fetch(base + '/api/students/S001/recommendations');
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.mode, 'fallback');
    assert.ok(result.recommendations.length > 0);
    assert.doesNotMatch(JSON.stringify(result), /secret-provider-detail/);
  });
  let called = false;
  await withServer({ now: () => new Date('2026-11-20T00:00:00Z'), ranker: async () => { called = true; } }, async base => {
    const response = await fetch(base + '/api/students/S001/recommendations');
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).recommendations, []);
    assert.equal(called, false);
  });
});
