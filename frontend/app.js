const API_BASE = 'http://localhost:3001';
const form = document.querySelector('#finder-form');
const studentSelect = document.querySelector('#student-select');
const findButton = document.querySelector('#find-button');
const apiStatus = document.querySelector('#api-status');
const apiStatusText = document.querySelector('#api-status-text');
const resultsSection = document.querySelector('#results-section');
const resultsTitle = document.querySelector('#results-title');
const resultCount = document.querySelector('#result-count');
const notice = document.querySelector('#notice');
const cards = document.querySelector('#cards');
const messagePanel = document.querySelector('#message-panel');

let students = [];

function setApiStatus(state, message) {
  apiStatus.classList.toggle('is-online', state === 'online');
  apiStatus.classList.toggle('is-error', state === 'error');
  apiStatusText.textContent = message;
}

async function getJson(path) {
  const response = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } });
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error('The demo API returned an unreadable response.'); }
  if (!response.ok) throw new Error(payload?.error?.message || `The demo API returned ${response.status}.`);
  return payload;
}

function showMessage(message, kind = '') {
  messagePanel.hidden = !message;
  messagePanel.className = `message-panel ${kind}`.trim();
  messagePanel.textContent = message || '';
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
  }).format(date);
}

function createActivityCard(activity, recommendation) {
  const card = element('article', 'activity-card');
  const top = element('div', 'card-top');
  const tagList = element('div', 'category-list');
  for (const tag of (activity.tags || []).slice(0, 3)) tagList.append(element('span', 'tag', tag));
  top.append(tagList, element('span', 'source-label', 'Demo event'));
  const title = element('h3', '', activity.name || 'Untitled activity');
  const description = element('p', 'description', activity.description || 'Explore this example activity.');
  const metadata = element('div', 'event-meta');
  const time = element('span', 'meta-item');
  time.append(element('span', 'meta-icon', '◷'), document.createTextNode(formatTime(activity.start)));
  const location = element('span', 'meta-item');
  location.append(element('span', 'meta-icon', '⌖'), document.createTextNode(activity.location || 'Location unavailable'));
  metadata.append(time, location);
  const reason = element('p', 'reason');
  reason.append(element('strong', '', 'Why this fits  '), document.createTextNode(recommendation.reason));
  card.append(top, title, description, metadata, reason);
  return card;
}

async function loadStudents() {
  try {
    const [health, payload] = await Promise.all([getJson('/api/health'), getJson('/api/students')]);
    if (health.status !== 'ok' || !Array.isArray(payload.students)) throw new Error('The demo API response is incomplete.');
    students = payload.students;
    studentSelect.replaceChildren(new Option('Select a demo student', ''));
    for (const student of students) studentSelect.add(new Option(`${student.name} · ${student.interests.join(', ')}`, student.id));
    studentSelect.disabled = students.length === 0;
    findButton.disabled = students.length === 0;
    setApiStatus('online', `Demo API connected · ${students.length} fictional students`);
  } catch (error) {
    studentSelect.replaceChildren(new Option('Demo API unavailable', ''));
    setApiStatus('error', 'Demo API is offline');
    showMessage(`${error.message} Start the backend first (see backend/README.md), then refresh this page.`, 'error');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const student = students.find((item) => item.id === studentSelect.value);
  if (!student) return;
  findButton.disabled = true;
  findButton.querySelector('span').textContent = 'Finding…';
  resultsSection.hidden = true;
  showMessage('Finding activities that match this demo profile…');
  try {
    const encodedId = encodeURIComponent(student.id);
    const [activityPayload, recommendationPayload] = await Promise.all([
      getJson('/api/activities'),
      getJson(`/api/students/${encodedId}/recommendations?limit=5`),
    ]);
    const byId = new Map(activityPayload.activities.map((activity) => [activity.id, activity]));
    const matched = recommendationPayload.recommendations.map((item) => ({ item, activity: byId.get(item.activityId) }));
    if (matched.some(({ activity }) => !activity)) throw new Error('A recommendation referenced an activity that was not returned by the demo API.');

    cards.replaceChildren();
    for (const { item, activity } of matched) cards.append(createActivityCard(activity, item));
    resultsTitle.textContent = `Activities for ${student.name.split(' ')[0]}`;
    resultCount.textContent = `${matched.length} ${matched.length === 1 ? 'match' : 'matches'}`;
    notice.hidden = !recommendationPayload.notice;
    notice.textContent = recommendationPayload.notice || '';
    notice.classList.toggle('ai', recommendationPayload.mode === 'gemma');
    resultsSection.hidden = false;
    showMessage(matched.length ? '' : 'No activities match this profile right now. Try another demo student or check again later.', matched.length ? '' : 'empty');
    if (matched.length) resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showMessage(`${error.message} Check that the backend is running at http://localhost:3001.`, 'error');
  } finally {
    findButton.disabled = false;
    findButton.querySelector('span').textContent = 'Find activities';
  }
});

loadStudents();
