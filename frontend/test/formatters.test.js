import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateTimeRange, truncateText } from '../src/utils/formatters.js';

test('formatDateTimeRange formats start and end times cleanly', () => {
  const result = formatDateTimeRange('2026-11-01T14:00:00Z', '2026-11-01T16:00:00Z');
  assert.ok(result.includes('2026'));
  assert.ok(result.includes('14:00'));
  assert.ok(result.includes('16:00'));
});

test('formatDateTimeRange handles null or invalid inputs gracefully', () => {
  assert.equal(formatDateTimeRange(null), 'Time not specified');
  assert.equal(formatDateTimeRange(''), 'Time not specified');
  assert.equal(formatDateTimeRange('invalid-date'), 'invalid-date');
});

test('truncateText truncates longer text and leaves short text untouched', () => {
  assert.equal(truncateText('Short text', 20), 'Short text');
  const long = 'A'.repeat(50);
  const truncated = truncateText(long, 20);
  assert.equal(truncated.length, 21); // 20 chars + '…'
  assert.ok(truncated.endsWith('…'));
});
