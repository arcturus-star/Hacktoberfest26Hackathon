const assert = require('node:assert/strict');
const test = require('node:test');
const { hasValidTimezoneDate, validateData } = require('../src/data');

function fixture() {
  return {
    students: [{ id: 's1', name: 'Alex', interests: ['running'] }],
    activities: [{ id: 'a1', name: 'Run', description: 'Demo run', tags: ['running'], start: '2026-11-01T10:00:00Z', end: '2026-11-01T11:00:00Z', location: 'Campus', source: 'synthetic' }],
    attendance: [{ studentId: 's1', activityId: 'a1' }],
  };
}

test('validates sample data and returns the same records', () => {
  const data = fixture();
  assert.deepEqual(validateData(data), data);
});

test('rejects duplicate student and activity IDs', () => {
  const duplicateStudent = fixture();
  duplicateStudent.students.push({ ...duplicateStudent.students[0] });
  assert.throws(() => validateData(duplicateStudent), /duplicate id/);

  const duplicateActivity = fixture();
  duplicateActivity.activities.push({ ...duplicateActivity.activities[0] });
  assert.throws(() => validateData(duplicateActivity), /duplicate id/);
});

test('rejects invalid string arrays and attendance references', () => {
  const badInterests = fixture();
  badInterests.students[0].interests = ['running', 3];
  assert.throws(() => validateData(badInterests), /interests must be an array/);

  const badStudentRef = fixture();
  badStudentRef.attendance[0].studentId = 'missing';
  assert.throws(() => validateData(badStudentRef), /unknown student/);

  const badActivityRef = fixture();
  badActivityRef.attendance[0].activityId = 'missing';
  assert.throws(() => validateData(badActivityRef), /unknown activity/);
});

test('requires valid timezone-bearing dates and an end after start', () => {
  assert.equal(hasValidTimezoneDate('2026-11-01T10:00:00Z'), true);
  assert.equal(hasValidTimezoneDate('2026-11-01T10:00:00+01:00'), true);
  assert.equal(hasValidTimezoneDate('2026-11-01T10:00:00'), false);
  assert.equal(hasValidTimezoneDate('2026-02-30T10:00:00Z'), false);

  const badDate = fixture();
  badDate.activities[0].start = '2026-11-01T10:00:00';
  assert.throws(() => validateData(badDate), /timezone/);

  const badOrder = fixture();
  badOrder.activities[0].end = badOrder.activities[0].start;
  assert.throws(() => validateData(badOrder), /end must be after start/);
});
