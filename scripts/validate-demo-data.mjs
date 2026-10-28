import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

// Reads Git objects only; never converts or modifies the team's source data.
const ref = process.argv[2] ?? 'origin/sample-data-bases';
const read = name => execFileSync('git', ['show', `${ref}:${name}`], { encoding: 'utf8' });
const csvProblems = [];
function csv(text, label) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (c === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  assert(!quoted, 'Unclosed CSV quote');
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const headers = rows.shift();
  return rows.filter(r => r.some(Boolean)).map((r, i) => {
    if (r.length !== headers.length) {
      csvProblems.push(`${label} row ${i + 2} (${r[0]}): ${r.length} fields; expected ${headers.length}`);
      // Inspection-only recovery for the known event schema, never saved to disk.
      assert(label === 'events' && r.length > headers.length, 'Cannot inspect malformed row safely');
      r = [...r.slice(0, 5), r.slice(5, -3).join(','), ...r.slice(-3)];
    }
    return Object.fromEntries(headers.map((h, j) => [h, r[j]]));
  });
}
const students = csv(read('studentdatabase.csv'), 'students');
const events = csv(read('eventsdatabase.csv'), 'events');
const calendar = csv(read('googlecaldatabase'), 'calendar');
for (const [records, key] of [[students, 'student_id'], [events, 'event_id']]) {
  assert(records.every(r => r[key]?.trim()), `Empty ${key}`);
  assert.equal(new Set(records.map(r => r[key])).size, records.length, `Duplicate ${key}`);
}
for (const s of students) {
  assert(s.name.trim());
  for (const key of Object.keys(s).filter(k => k.endsWith('_interest'))) assert(['High', 'Medium', 'Low'].includes(s[key]));
}
for (const e of events) {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(e.event_date));
  assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(e.event_time));
  const iso = `${e.event_date}T${e.event_time}:00Z`;
  assert.equal(new Date(iso).toISOString(), iso.replace('Z', '.000Z'));
  assert(e.event_name.trim() && e.description.trim() && e.location.trim());
  assert(e.tags.split(';').every(t => t.trim()));
  assert(Number.isInteger(Number(e.capacity)) && Number(e.capacity) > 0);
  assert(Number.isInteger(Number(e.attendees)) && Number(e.attendees) >= 0 && Number(e.attendees) <= Number(e.capacity));
}
console.log(`CHECKED: ${students.length} unique students, ${events.length} unique events, ${calendar.length} calendar rows; ratings, event dates/times, required text, tags and capacity counts pass after inspection-only event description recovery.`);
for (const problem of csvProblems) console.log(`FAIL: ${problem}`);
console.log('GAPS: no attendance relationships; no event end/timezone/source fields; interest rating-to-array policy and synthetic provenance need owner confirmation. Calendar excluded from core demo.');
console.log('CONDITIONAL EXPECTATIONS ONLY: High ratings -> interests; London local event starts -> UTC; no attendance; proposed deterministic selector. Not backend/API results.');
for (const id of ['S004', 'S018', 'S007']) {
  const s = students.find(s => s.student_id === id);
  assert(s, `Missing scenario student ${id}`);
  const interests = Object.keys(s).filter(k => k.endsWith('_interest') && s[k] === 'High').map(k => k.replace('_interest', ''));
  for (const now of ['2026-10-28T12:00:00Z', '2026-11-06T16:00:00Z', '2026-11-20T00:00:00Z']) {
    const ranked = events.map(e => ({ e, score: 2 * new Set(e.tags.split(';').filter(t => interests.includes(t.trim().toLowerCase()))).size }))
      .filter(({ e, score }) => score > 0 && `${e.event_date}T${e.event_time}:00Z` > now)
      .sort((a, b) => b.score - a.score || `${a.e.event_date}T${a.e.event_time}`.localeCompare(`${b.e.event_date}T${b.e.event_time}`) || a.e.event_id.localeCompare(b.e.event_id))
      .slice(0, 5);
    console.log(`${id} [${interests.join(', ')}] at ${now}: ${ranked.map(x => `${x.e.event_id}(${x.score})`).join(', ') || '[]'}`);
  }
}
if (csvProblems.length) process.exitCode = 1;
