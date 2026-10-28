const assert = require('node:assert/strict');
const { createServer } = require('../backend/src/server');
const { loadData } = require('../backend/src/data');
(async () => {
  const data = loadData();
  for (const clock of ['2026-10-28T12:00:00Z', '2026-11-06T16:00:00Z', '2026-11-20T00:00:00Z']) {
    const server = createServer({ data, env: {}, now: () => new Date(clock) });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      for (const student of data.students) {
        const url = `${base}/api/students/${student.id}/recommendations?limit=20`;
        const response = await fetch(url);
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.mode, 'fallback');
        assert.deepEqual(result, await (await fetch(url)).json());
        for (const rec of result.recommendations) {
          const activity = data.activities.find(a => a.id === rec.activityId);
          assert(activity && Date.parse(activity.start) > Date.parse(clock));
          assert(!data.attendance.some(a => a.studentId === student.id && a.activityId === rec.activityId));
          assert(rec.reason.trim());
        }
        if (clock.startsWith('2026-11-20')) assert.deepEqual(result.recommendations, []);
        if (student.id === 'S003' && clock.startsWith('2026-10-28')) {
          const football = result.recommendations.find(r => r.activityId === 'activity-e001');
          assert(football && football.reason.includes('past attendance'));
          assert(!football.reason.includes('your interest'));
        }
        console.log(`${clock} ${student.id}: ${result.recommendations.slice(0, 5).map(r => r.activityId).join(', ') || '[]'} PASS`);
      }
    } finally { await new Promise(resolve => server.close(resolve)); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
