const assert = require('node:assert/strict');
const test = require('node:test');
const { buildEndpoint, createGemmaRanker, parseModelContent } = require('../src/gemma');

test('builds an OpenAI-compatible chat completions endpoint', () => {
  assert.equal(buildEndpoint('https://model.example/v1'), 'https://model.example/v1/chat/completions');
  assert.equal(buildEndpoint('https://model.example/v1/chat/completions'), 'https://model.example/v1/chat/completions');
  assert.throws(() => buildEndpoint('ftp://model.example/v1'), /HTTP or HTTPS/);
});

test('parses only the expected JSON recommendation response', () => {
  assert.deepEqual(parseModelContent('{"recommendations":[{"activityId":"a1","reason":"Matches running."}]}'), [{ activityId: 'a1', reason: 'Matches running.' }]);
  assert.deepEqual(parseModelContent('[{"activityId":"a1","reason":"Matches running."}]'), [{ activityId: 'a1', reason: 'Matches running.' }]);
  assert.throws(() => parseModelContent('not json'));
  assert.throws(() => parseModelContent('{"other":[]}'));
});

test('sends only the supplied candidates and optional bearer key', async () => {
  let request;
  const rank = createGemmaRanker({
    baseUrl: 'https://model.example/v1', model: 'gemma-test', apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"recommendations":[{"activityId":"a1","reason":"A grounded match."}]}' } }] }) };
    },
  });
  const result = await rank({ student: { id: 's1', interests: ['running'] }, pastTags: ['fitness'], candidates: [{ id: 'a1', name: 'Run', tags: ['running'] }] });
  assert.equal(request.url, 'https://model.example/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(request.body.model, 'gemma-test');
  assert.deepEqual(result, [{ activityId: 'a1', reason: 'A grounded match.' }]);
});

test('returns null without complete provider configuration', () => {
  assert.equal(createGemmaRanker({ baseUrl: '', model: 'gemma' }), null);
  assert.equal(createGemmaRanker({ baseUrl: 'https://model.example/v1', model: '' }), null);
});

test('rejects non-success provider responses and times out after the configured bound', async () => {
  const failed = createGemmaRanker({ baseUrl: 'https://model.example/v1', model: 'gemma', fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(() => failed({ student: { interests: [] }, pastTags: [], candidates: [{ id: 'a1' }] }), /Model request failed/);

  const timeout = createGemmaRanker({
    baseUrl: 'https://model.example/v1', model: 'gemma', timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })),
  });
  await assert.rejects(() => timeout({ student: { interests: [] }, pastTags: [], candidates: [{ id: 'a1' }] }), /aborted/);
});

test('rejects invalid JSON returned by the provider', async () => {
  const rank = createGemmaRanker({
    baseUrl: 'https://model.example/v1', model: 'gemma',
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'not json' } }] }) }),
  });
  await assert.rejects(() => rank({ student: { interests: [] }, pastTags: [], candidates: [{ id: 'a1' }] }));
});
