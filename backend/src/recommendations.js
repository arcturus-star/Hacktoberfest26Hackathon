const { createGemmaRanker } = require('./gemma');

function normalise(value) {
  return String(value).trim().toLowerCase();
}

function uniqueNormalised(values) {
  return [...new Set(values.map(normalise).filter(Boolean))];
}

function displayTags(originalValues, matches) {
  const byNormalised = new Map(originalValues.map((value) => [normalise(value), value.trim()]));
  return matches.map((tag) => byNormalised.get(tag) || tag);
}

function getPastTags(studentId, activities, attendance, nowMs) {
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  return uniqueNormalised(attendance
    .filter((item) => item.studentId === studentId)
    .map((item) => activityById.get(item.activityId))
    .filter((activity) => activity && Date.parse(activity.end) <= nowMs)
    .flatMap((activity) => activity.tags));
}

function selectCandidates({ student, activities, attendance, now = new Date() }) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error('now must be a valid date.');
  const attendedIds = new Set(attendance.filter((item) => item.studentId === student.id).map((item) => item.activityId));
  const pastTags = getPastTags(student.id, activities, attendance, nowMs);
  const interestTags = uniqueNormalised(student.interests);

  return activities
    .filter((activity) => Date.parse(activity.start) > nowMs && !attendedIds.has(activity.id))
    .map((activity) => {
      const tags = uniqueNormalised(activity.tags);
      const interestMatches = interestTags.filter((tag) => tags.includes(tag));
      const attendanceMatches = pastTags.filter((tag) => tags.includes(tag));
      const score = interestMatches.length * 2 + attendanceMatches.length;
      const reasons = [];
      if (interestMatches.length) reasons.push(`Matches your interest${interestMatches.length === 1 ? '' : 's'} in ${displayTags(activity.tags, interestMatches).join(', ')}.`);
      if (attendanceMatches.length) reasons.push(`Related to your past attendance in ${displayTags(activity.tags, attendanceMatches).join(', ')}.`);
      return { activityId: activity.id, reason: reasons.join(' '), score, start: activity.start };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(a.start) - Date.parse(b.start) || a.activityId.localeCompare(b.activityId));
}

function createRecommendationService({ ranker, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  let gemmaRanker = ranker;
  let providerConfigurationInvalid = false;
  if (!gemmaRanker) {
    try {
      gemmaRanker = createGemmaRanker({
        baseUrl: env.GEMMA_BASE_URL,
        model: env.GEMMA_MODEL,
        apiKey: env.GEMMA_API_KEY,
        fetchImpl,
      });
    } catch {
      providerConfigurationInvalid = true;
    }
  }

  return async function recommend({ student, activities, attendance, limit = 5, now = new Date() }) {
    const candidates = selectCandidates({ student, activities, attendance, now });
    const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
    const fallback = candidates.slice(0, limit).map(({ activityId, reason }) => ({ activityId, reason }));
    if (!candidates.length) return { recommendations: [], mode: 'fallback', notice: null };
    if (!gemmaRanker) {
      const notice = providerConfigurationInvalid
        ? 'AI ranking is not configured correctly; showing interest and attendance-based recommendations.'
        : 'Using interest and attendance-based recommendations.';
      return { recommendations: fallback, mode: 'fallback', notice };
    }

    try {
      const ranked = await gemmaRanker({
        student: { id: student.id, interests: student.interests },
        pastTags: getPastTags(student.id, activities, attendance, nowMs),
        candidates: candidates.slice(0, 20).map(({ activityId, reason, score }) => {
          const activity = activities.find((item) => item.id === activityId);
          return { id: activity.id, name: activity.name, description: activity.description, tags: activity.tags, start: activity.start, end: activity.end, location: activity.location, fallbackReason: reason, score };
        }),
      });
      if (!Array.isArray(ranked) || !ranked.length) throw new Error('Invalid model response.');
      const permittedIds = new Set(candidates.slice(0, 20).map((candidate) => candidate.activityId));
      const seen = new Set();
      for (const item of ranked) {
        if (!item || typeof item.activityId !== 'string' || !permittedIds.has(item.activityId) || seen.has(item.activityId)) throw new Error('Invalid model response.');
        if (typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 500) throw new Error('Invalid model response.');
        seen.add(item.activityId);
      }
      return { recommendations: ranked.slice(0, limit).map(({ activityId, reason }) => ({ activityId, reason: reason.trim() })), mode: 'gemma', notice: null };
    } catch {
      return { recommendations: fallback, mode: 'fallback', notice: 'AI ranking is unavailable; showing interest and attendance-based recommendations.' };
    }
  };
}

module.exports = { createRecommendationService, selectCandidates };
