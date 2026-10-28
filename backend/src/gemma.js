function buildEndpoint(baseUrl) {
  const url = new URL(baseUrl);
  if (!/^https?:$/.test(url.protocol)) throw new Error('GEMMA_BASE_URL must use HTTP or HTTPS.');
  if (!url.pathname.endsWith('/chat/completions')) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`;
  }
  return url.toString();
}

function parseModelContent(content) {
  if (typeof content !== 'string') throw new Error('Invalid model response.');
  const value = JSON.parse(content);
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.recommendations)) return value.recommendations;
  throw new Error('Invalid model response.');
}

function createGemmaRanker({ baseUrl, model, apiKey, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  if (!baseUrl || !model || typeof fetchImpl !== 'function') return null;
  const endpoint = buildEndpoint(baseUrl);
  return async function rank({ student, pastTags, candidates }) {
    if (!candidates.length) return [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            { role: 'system', content: 'Rank suitable activities for the synthetic student. Reply only with JSON: {"recommendations":[{"activityId":"...","reason":"..."}]}. Use only candidate IDs and facts supplied; do not invent dates, venues, friends, or details.' },
            { role: 'user', content: JSON.stringify({ interests: student.interests, pastAttendanceTags: pastTags, candidates }) },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Model request failed.');
      const payload = await response.json();
      return parseModelContent(payload?.choices?.[0]?.message?.content);
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = { buildEndpoint, createGemmaRanker, parseModelContent };
