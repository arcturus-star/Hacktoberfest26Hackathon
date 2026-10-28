import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOCK_STUDENTS,
  MOCK_ACTIVITIES,
  generateMockRecommendations
} from '../src/services/mockData.js';

test('mock students have required fields', () => {
  assert.ok(MOCK_STUDENTS.length >= 3);
  for (const student of MOCK_STUDENTS) {
    assert.ok(student.id, 'Student must have an id');
    assert.ok(student.name, 'Student must have a name');
    assert.ok(Array.isArray(student.interests), 'Student interests must be an array');
  }
});

test('mock activities have required fields and valid ISO dates', () => {
  assert.ok(MOCK_ACTIVITIES.length >= 3);
  for (const act of MOCK_ACTIVITIES) {
    assert.ok(act.id, 'Activity must have an id');
    assert.ok(act.name, 'Activity must have a name');
    assert.ok(act.location, 'Activity must have a location');
    assert.ok(Array.isArray(act.tags), 'Activity tags must be an array');
    assert.ok(new Date(act.start).getTime() > 0, 'Start must be a valid timestamp');
    assert.ok(new Date(act.end).getTime() >= new Date(act.start).getTime(), 'End must be >= start');
  }
});

test('generateMockRecommendations returns ranked recommendations for Alex', () => {
  const result = generateMockRecommendations('student-1', 5);
  assert.equal(result.studentId, 'student-1');
  assert.ok(Array.isArray(result.recommendations));
  assert.ok(result.recommendations.length > 0);
  assert.ok(result.recommendations[0].activityId);
  assert.ok(result.recommendations[0].reason);
  assert.equal(result.mode, 'fallback');
  assert.ok(result.notice.includes('Mock Mode'));
});

test('generateMockRecommendations handles empty matches profile gracefully', () => {
  const result = generateMockRecommendations('student-empty', 5);
  assert.equal(result.studentId, 'student-empty');
  assert.deepEqual(result.recommendations, []);
});

test('generateMockRecommendations throws 404 for unknown student', () => {
  assert.throws(() => {
    generateMockRecommendations('non-existent-student', 5);
  }, /Student not found/);
});
