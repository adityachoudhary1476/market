import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createOpenAICompatibleProvider, createApiBoundaryProvider, deriveAnalystEndpoint } from '../openaiCompatible'
import { ProviderError } from '../types'

function jsonResponse(init: { ok?: boolean; status?: number; body: unknown }) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    async json() {
      return init.body
    },
  }
}

const OPENAI_TOOL_RESPONSE = {
  choices: [
    {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'getTechnicalAnalysis', arguments: '{"instrument":"nifty-50"}' },
          },
        ],
      },
      finish_reason: 'tool_calls',
    },
  ],
}

test('OpenAI provider maps tool_calls into LLMToolCall objects', async () => {
  const captured: { url: string; body: string } = { url: '', body: '' }
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-test',
    apiKey: 'secret',
    fetchImpl: async (url, init) => {
      captured.url = url
      captured.body = init.body
      return jsonResponse({ body: OPENAI_TOOL_RESPONSE })
    },
  })
  const result = await provider.generate({
    system: 'sys',
    messages: [{ role: 'user', content: 'hi' }],
    tools: [{ name: 'getTechnicalAnalysis', description: 'desc', parameters: { type: 'object', properties: {}, required: [] } }],
  })
  assert.equal(result.toolCalls.length, 1)
  assert.equal(result.toolCalls[0].name, 'getTechnicalAnalysis')
  assert.deepEqual(result.toolCalls[0].arguments, { instrument: 'nifty-50' })
  assert.equal(result.stopReason, 'tool_calls')
  assert.ok(captured.url.endsWith('/chat/completions'))
  const body = JSON.parse(captured.body) as { model: string; messages: unknown[]; tools: unknown[] }
  assert.equal(body.model, 'gpt-test')
  assert.equal(body.messages.length, 2) // system + user
  assert.equal(body.tools.length, 1)
})

test('OpenAI provider maps plain content responses', async () => {
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-test',
    fetchImpl: async () =>
      jsonResponse({ body: { choices: [{ message: { role: 'assistant', content: '{"intent":"ask"}' }, finish_reason: 'stop' }] } }),
  })
  const result = await provider.generate({ system: 'sys', messages: [] })
  assert.equal(result.content, '{"intent":"ask"}')
  assert.equal(result.toolCalls.length, 0)
  assert.equal(result.stopReason, 'stop')
})

test('OpenAI provider maps HTTP 429 to a retryable rate-limit error', async () => {
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-test',
    fetchImpl: async () => jsonResponse({ ok: false, status: 429, body: { error: { message: 'slow down' } } }),
  })
  await assert.rejects(
    () => provider.generate({ system: 'sys', messages: [] }),
    (err: unknown) => err instanceof ProviderError && err.kind === 'rate-limit' && err.retryable === true,
  )
})

test('OpenAI provider maps HTTP 401 to a non-retryable auth error', async () => {
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-test',
    fetchImpl: async () => jsonResponse({ ok: false, status: 401, body: { error: { message: 'bad key' } } }),
  })
  await assert.rejects(
    () => provider.generate({ system: 'sys', messages: [] }),
    (err: unknown) => err instanceof ProviderError && err.kind === 'auth' && err.retryable === false,
  )
})

test('OpenAI provider maps network failures to network errors', async () => {
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-test',
    fetchImpl: async () => {
      throw new Error('ECONNRESET')
    },
  })
  await assert.rejects(
    () => provider.generate({ system: 'sys', messages: [] }),
    (err: unknown) => err instanceof ProviderError && err.kind === 'network' && err.retryable === true,
  )
})

test('OpenAI provider rejects malformed tool arguments', async () => {
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-test',
    fetchImpl: async () =>
      jsonResponse({
        body: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  { id: 'x', type: 'function', function: { name: 'getTechnicalAnalysis', arguments: '{oops' } },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      }),
  })
  await assert.rejects(
    () => provider.generate({ system: 'sys', messages: [] }),
    (err: unknown) => err instanceof ProviderError && err.kind === 'invalid-response',
  )
})

test('OpenAI provider maps a Gemini model-retired 404 to a non-retryable bad-request error', async () => {
  // Regression (live-verified): Gemini's OpenAI-compatible endpoint reports
  // errors as a top-level ARRAY ([{ error: { message } }]), not the OpenAI
  // object shape. The retired model id gemini-2.5-flash triggers exactly this
  // HTTP 404. A rejected request must be classified as bad-request — NOT
  // invalid-response — so it is never reported as a "malformed response".
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    apiKey: 'secret',
    fetchImpl: async () =>
      jsonResponse({
        ok: false,
        status: 404,
        body: [
          {
            error: {
              code: 404,
              message: 'This model models/gemini-2.5-flash is no longer available. Please update your code to use models/gemini-3.6-flash.',
              status: 'NOT_FOUND',
            },
          },
        ],
      }),
  })
  await assert.rejects(
    () => provider.generate({ system: 'sys', messages: [] }),
    (err: unknown) =>
      err instanceof ProviderError &&
      err.kind === 'bad-request' &&
      err.retryable === false &&
      err.message.includes('no longer available'),
  )
})

test('OpenAI provider maps HTTP 400 to a non-retryable bad-request error', async () => {
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-test',
    fetchImpl: async () => jsonResponse({ ok: false, status: 400, body: { error: { message: 'invalid request payload' } } }),
  })
  await assert.rejects(
    () => provider.generate({ system: 'sys', messages: [] }),
    (err: unknown) => err instanceof ProviderError && err.kind === 'bad-request' && err.retryable === false,
  )
})

test('API boundary provider posts the prompt to the server endpoint', async () => {
  const captured: { url: string; body: string } = { url: '', body: '' }
  const provider = createApiBoundaryProvider({
    endpoint: 'https://analyst.example.com/api/analyze',
    fetchImpl: async (url, init) => {
      captured.url = url
      captured.body = init.body
      return jsonResponse({ body: { content: '{"intent":"ask"}', toolCalls: [] } })
    },
  })
  const result = await provider.generate({ system: 'sys', messages: [{ role: 'user', content: 'hello' }] })
  assert.equal(result.content, '{"intent":"ask"}')
  assert.equal(captured.url, 'https://analyst.example.com/api/analyze')
  const body = JSON.parse(captured.body) as { system: string; messages: unknown[]; tools: unknown[] }
  assert.equal(body.system, 'sys')
  assert.equal(body.messages.length, 1)
  assert.deepEqual(body.tools, [])
  // The request payload must NOT contain any api key field.
  assert.ok(!('apiKey' in body), 'no apiKey ever leaves the browser')
})

test('API boundary provider surfaces server errors as typed ProviderErrors', async () => {
  const provider = createApiBoundaryProvider({
    endpoint: 'https://analyst.example.com/api/analyze',
    fetchImpl: async () => jsonResponse({ ok: false, status: 503, body: { error: { message: 'busy' } } }),
  })
  await assert.rejects(
    () => provider.generate({ system: 'sys', messages: [] }),
    (err: unknown) => err instanceof ProviderError && err.kind === 'unavailable',
  )
})

test('deriveAnalystEndpoint: a path-less base URL becomes /api/analyze on the same origin', () => {
  assert.equal(deriveAnalystEndpoint('http://localhost:8787'), 'http://localhost:8787/api/analyze')
  assert.equal(deriveAnalystEndpoint('https://gateway.test/'), 'https://gateway.test/api/analyze')
})

test('deriveAnalystEndpoint: a URL already ending in /api/analyze is preserved', () => {
  assert.equal(deriveAnalystEndpoint('https://gateway.test/api/analyze'), 'https://gateway.test/api/analyze')
  assert.equal(deriveAnalystEndpoint('https://gateway.test/api/analyze/'), 'https://gateway.test/api/analyze')
})

test('deriveAnalystEndpoint: existing unrelated path behavior follows the search-endpoint contract', () => {
  assert.equal(deriveAnalystEndpoint('https://gateway.test/api/search'), 'https://gateway.test/api/analyze')
  assert.equal(deriveAnalystEndpoint('https://gateway.test/custom/search'), 'https://gateway.test/custom/analyze')
  assert.equal(deriveAnalystEndpoint('https://gateway.test/other'), 'https://gateway.test/api/analyze')
})

test('API boundary provider posts to /api/analyze rather than / for a path-less base URL', async () => {
  const captured: { url: string } = { url: '' }
  const provider = createApiBoundaryProvider({
    endpoint: 'http://localhost:8787',
    fetchImpl: async (url) => {
      captured.url = url
      return jsonResponse({ body: { content: '{"intent":"ask"}', toolCalls: [] } })
    },
  })
  await provider.generate({ system: 'sys', messages: [{ role: 'user', content: 'hello' }] })
  assert.equal(captured.url, 'http://localhost:8787/api/analyze')
})