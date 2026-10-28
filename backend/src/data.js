const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read valid JSON from ${filePath}: ${error.message}`);
  }
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a nonempty string.`);
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} must be an array of nonempty strings.`);
  }
}

function hasValidTimezoneDate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', , zone, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return false;
  if (zone !== 'Z') {
    const offsetHours = Number(offsetHourText), offsetMinutes = Number(offsetMinuteText);
    if (offsetHours > 14 || offsetMinutes > 59 || (offsetHours === 14 && offsetMinutes !== 0)) return false;
  }
  return Number.isFinite(Date.parse(value));
}

function uniqueRecords(records, label) {
  const ids = new Set();
  for (const record of records) {
    requireText(record?.id, `${label} id`);
    if (ids.has(record.id)) throw new Error(`${label} contains duplicate id "${record.id}".`);
    ids.add(record.id);
  }
  return ids;
}

function validateData(data) {
  const students = requireArray(data.students, 'students');
  const activities = requireArray(data.activities, 'activities');
  const attendance = requireArray(data.attendance, 'attendance');
  const studentIds = uniqueRecords(students, 'students');
  const activityIds = uniqueRecords(activities, 'activities');

  for (const student of students) {
    requireText(student.name, `student ${student.id} name`);
    requireStringArray(student.interests, `student ${student.id} interests`);
  }
  for (const activity of activities) {
    for (const field of ['name', 'description', 'location', 'source']) requireText(activity[field], `activity ${activity.id} ${field}`);
    requireStringArray(activity.tags, `activity ${activity.id} tags`);
    if (!hasValidTimezoneDate(activity.start)) throw new Error(`activity ${activity.id} start must be a valid ISO 8601 datetime with a timezone.`);
    if (!hasValidTimezoneDate(activity.end)) throw new Error(`activity ${activity.id} end must be a valid ISO 8601 datetime with a timezone.`);
    if (Date.parse(activity.end) <= Date.parse(activity.start)) throw new Error(`activity ${activity.id} end must be after start.`);
  }
  for (const record of attendance) {
    requireText(record?.studentId, 'attendance studentId');
    requireText(record?.activityId, 'attendance activityId');
    if (!studentIds.has(record.studentId)) throw new Error(`attendance references unknown student "${record.studentId}".`);
    if (!activityIds.has(record.activityId)) throw new Error(`attendance references unknown activity "${record.activityId}".`);
  }
  return { students, activities, attendance };
}

function loadData(dataDir = path.join(__dirname, '..', 'data')) {
  return validateData({
    students: readJson(path.join(dataDir, 'students.json')),
    activities: readJson(path.join(dataDir, 'activities.json')),
    attendance: readJson(path.join(dataDir, 'attendance.json')),
  });
}

module.exports = { hasValidTimezoneDate, loadData, validateData };
