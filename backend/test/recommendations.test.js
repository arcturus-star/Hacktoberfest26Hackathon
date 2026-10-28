const assert = require('node:assert/strict');
const test = require('node:test');
const { createRecommendationService, selectCandidates } = require('../src/recommendations');

const now = new Date('2026-10-28T12:00:00Z');
const student = { id: 's1', name: 'Alex', interests: [' Running ', 'art', 'running'] };
const activities = [
  { id: 'past', name: 'Past Run', tags: ['running'], start: '2026-10-01T10:00:00Z', end: '2026-10-01T11:00:00Z' },
  { id: 'attended-upcoming', name: 'Already Attended', tags: ['running'], start: '2026-11-01T10:00:00Z', end: '2026-11-01T11:00:00Z' },
  { id: 'run', name: 'Future Run', tags: ['running', 'RUNNING'], start: '2026-11-02T10:00:00Z', end: '2026-11-02T11:00:00Z' },
  { id: 'art', name: 'Art Workshop', tags: ['art'], start: '2026-11-01T10:00:00Z', end: '2026-11-01T11:00:00Z' },
  { id: 'history', name: 'Similar Workshop', tags: ['painting'], start: '2026-11-03T10:00:00Z', end: '2026-11-03T11:00:00Z' },
  { id: 'unrelated', name: 'Unrelated', tags: ['football'], start: '2026-11-02T10:00:00Z', end: '2026-11-02T11:00:00Z' },
  { id: 'tie-a', name: 'Tie A', tags: ['art'], start: '2026-11-04T10:00:00Z', end: '2026-11-04T11:00:00Z' },
  { id: 'tie-b', name: 'Tie B', tags: ['art'], start: '2026-11-04T10:00:00Z', end: '2026-11-04T11:00:00Z' },
];
const attendance = [
  { studentId: 's1', activityId: 'past' },
  { studentId: 's1', activityId: 'attended-upcoming' },
  { studentId: 's1', activityId: 'history-past' },
  { studentId: 's1', activityId: 'past' },
];
const allActivities = [...activities, { id: 'history-past', name: 'Past Painting', tags: ['painting'], start: '2026-10-05T10:00:00Z', end: '2026-10-05T11:00:00Z' }];

test('filters past and already attended activities, scores interests and history deterministically', () => {
  const result = selectCandidates({ student, activities: allActivities, attendance, now });
  assert.deepEqual(result.map((item) => item.activityId), ['run', 'art', 'tie-a', 'tie-b', 'history']);
  assert.equal(result[0].score, 3);
  assert.match(result.find((item) => item.activityId === 'history').reason, /past attendance/);
  assert.equal(result.some((item) => item.activityId === 'unrelated'), false);
  assert.equal(result.some((item) => item.activityId === 'attended-upcoming'), false);
  assert.equal(result.some((item) => item.activityId === 'past'), false);
});

test('returns empty candidates when nothing future matches', () => {
  const result = selectCandidates({ student: { id: 'x', interests: ['no-match'] }, activities, attendance: [], now });
  assert.deepEqual(result, []);
});

test('returns stable, bounded recommendations with a clear offline mode', async () => {
  const recommend = createRecommendationService({ env: {} });
  const args = { student, activities: allActivities, attendance, now, limit: 2 };
  const first = await recommend(args);
  const second = await recommend(args);
  assert.deepEqual(first, second);
  assert.equal(first.mode, 'fallback');
  assert.equal(first.recommendations.length, 2);
  assert.match(first.notice, /interest and attendance-based/);
});

test('uses safe fallback when configured model URL is invalid', async () => {
  const recommend = createRecommendationService({ env: { GEMMA_BASE_URL: 'file:///not-allowed', GEMMA_MODEL: 'gemma' } });
  const result = await recommend({ student, activities: allActivities, attendance, now });
  assert.equal(result.mode, 'fallback');
  assert.match(result.notice, /not configured correctly/);
});

test('rejects hallucinated IDs, duplicate IDs, blank or oversized reasons, and provider failures', async () => {
  const invalidResponses = [
    [{ activityId: 'ghost', reason: 'Unknown candidate.' }],
    [{ activityId: 'run', reason: 'Valid.' }, { activityId: 'run', reason: 'Duplicate.' }],
    [{ activityId: 'run', reason: '   ' }],
    [{ activityId: 'run', reason: 'x'.repeat(501) }],
    null,
  ];
  for (const invalidResponse of invalidResponses) {
    const recommend = createRecommendationService({ ranker: async () => invalidResponse });
    const result = await recommend({ student, activities: allActivities, attendance, now, limit: 2 });
    assert.equal(result.mode, 'fallback');
    assert.ok(result.recommendations.every((item) => item.activityId !== 'ghost'));
  }
  const failedProvider = createRecommendationService({ ranker: async () => { throw new Error('private provider detail'); } });
  const fallback = await failedProvider({ student, activities: allActivities, attendance, now, limit: 2 });
  assert.equal(fallback.mode, 'fallback');
  assert.doesNotMatch(fallback.notice, /private provider detail/);
});

test('limits model candidates to 20 and rejects malformed model output as a whole', async () => {
  const manyActivities = Array.from({ length: 25 }, (_, i) => ({ id: `a${i}`, name: `A${i}`, description: 'x', tags: ['running'], start: `2026-11-${String(i + 1).padStart(2, '0')}T10:00:00Z`, end: `2026-11-${String(i + 1).padStart(2, '0')}T11:00:00Z`, location: 'Campus' }));
  let candidateCount = 0;
  const recommend = createRecommendationService({ ranker: async ({ candidates }) => { candidateCount = candidates.length; return [{ activityId: 'a0', reason: 'Grounded reason.' }, { activityId: 'ghost', reason: 'Hallucination.' }]; } });
  const result = await recommend({ student, activities: manyActivities, attendance: [], limit: 5, now });
  assert.equal(candidateCount, 20);
  assert.equal(result.mode, 'fallback');
  assert.equal(result.recommendations[0].activityId, 'a0');
  assert.match(result.notice, /AI ranking is unavailable/);
});

test('skips model requests when there are no eligible candidates', async () => {
  let called = false;
  const recommend = createRecommendationService({ ranker: async () => { called = true; return []; } });
  const result = await recommend({ student: { id: 's1', interests: ['none'] }, activities: allActivities, attendance: [], now });
  assert.equal(called, false);
  assert.deepEqual(result, { recommendations: [], mode: 'fallback', notice: null });
});
