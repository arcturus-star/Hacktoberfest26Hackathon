import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRecommendationsWithActivities,
  fetchStudents,
  fetchActivities,
  fetchRecommendations,
  getApiBaseUrl,
  setApiBaseUrl
} from '../src/services/api.js';

test('resolveRecommendationsWithActivities merges activityId with full activity details', () => {
  const recommendations = [
    { activityId: 'act-1', reason: 'Fits your interest in football.' },
    { activityId: 'act-unknown', reason: 'Some recommendation.' }
  ];
  const activities = [
    {
      id: 'act-1',
      name: 'Football Social',
      start: '2026-11-01T10:00:00Z',
      end: '2026-11-01T12:00:00Z',
      location: 'Stadium',
      tags: ['sport', 'football'],
      description: 'Fun scrimmage'
    }
  ];

  const resolved = resolveRecommendationsWithActivities(recommendations, activities);
  assert.equal(resolved.length, 2);

  // First should be resolved
  assert.equal(resolved[0].activityId, 'act-1');
  assert.equal(resolved[0].isResolved, true);
  assert.equal(resolved[0].activity.name, 'Football Social');
  assert.equal(resolved[0].activity.location, 'Stadium');

  // Second should have placeholder details and isResolved = false
  assert.equal(resolved[1].activityId, 'act-unknown');
  assert.equal(resolved[1].isResolved, false);
  assert.equal(resolved[1].activity.name, 'Activity act-unknown');
});

test('fetchStudents in mock mode returns mock students list', async () => {
  const data = await fetchStudents({ mockMode: true });
  assert.ok(data.students);
  assert.ok(data.students.length >= 3);
  assert.equal(data.students[0].id, 'student-1');
});

test('fetchActivities in mock mode returns mock activities list', async () => {
  const data = await fetchActivities({ mockMode: true });
  assert.ok(data.activities);
  assert.ok(data.activities.length >= 3);
});

test('fetchRecommendations in mock mode returns mock recommendations', async () => {
  const data = await fetchRecommendations('student-1', 5, { mockMode: true });
  assert.equal(data.studentId, 'student-1');
  assert.ok(data.recommendations.length > 0);
  assert.equal(data.mode, 'fallback');
  assert.ok(data.notice);
});

// Integration defaults must use the backend rather than silently serving fixtures.
test('defaults to live backend mode', async () => {
  const { getIsMockMode } = await import('../src/services/api.js');
  assert.equal(getIsMockMode(), false);
});
