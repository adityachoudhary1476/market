import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleAnalystRequest } from '../gateway'
import { resolveServerEnv, type ServerEnv } from '../env'
import { createOpenAICompatibleProvider, createApiBoundaryProvider } from '../../agent/openaiCompatible'
import { ProviderError, type LLMResult } from '../../agent/types'
import { createAgentAnalystEngine } from '../../agent/agentEngine'
import { createDefaultAnalystToolRegistry } from '../../tools/registry'
import { createDefaultToolContext } from '../../tools/context'
import { buildAnalystContext } from '../../buildContext'
import { localAnalystEngine } from '../../engine'
import { validateStructuredResponse } from '../../agent/responseValidator'

function jsonResponse(init: { ok?: boolean; status?: number; body: unknown }) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    async json() {
      return init.body
    },
  }
}

function env(overrides: Record<string, string> = {}): ServerEnv {
  const resolved = resolveServerEnv({ FINOVA_LLM_API_KEY: 'sk-test-secret', FINOVA_LLM_MODEL: 'test-model', ...overrides })
  assert.ok(resolved, 'test env must resolve')
  return resolved
}

function validRequest(): Record<string, unknown> {
  return {
    system: 'You are Finova\'s AI Market Analyst.',
    messages: [{ role: 'user', content: 'Why is NIFTY weak today?' }],
    tools: [
      {
        name: 'getMarketSnapshot',
        description: 'Whole-market regime snapshot.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    ],
    temperature: 0,
  }
}

const NOW = 1_720_000_000_000

// 1. valid request
test('valid request reaches the provider and returns 200', async () => {
  const calls: unknown[] = []
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    model: 'test-model',
    apiKey: 'sk-test-secret',
    fetchImpl: async (_url, init) => {
      calls.push(JSON.parse(init.body) as unknown)
      return jsonResponse({
        body: { choices: [{ message: { role: 'assistant', content: '{"intent":"ask"}' }, finish_reason: 'stop' }] },
      })
    },
  })
  const result = await handleAnalystRequest(validRequest(), { env: env(), provider })
  assert.equal(result.status, 200)
  const body = result.body as { content: string; toolCalls: unknown[] }
  assert.equal(body.content, '{"intent":"ask"}')
  assert.deepEqual(body.toolCalls, [])
  assert.equal(calls.length, 1)
})

// 2. invalid request
test('invalid request (missing system) returns 400 invalid-request', async () => {
  const result = await handleAnalystRequest({ messages: [], tools: [] }, { env: env() })
  assert.equal(result.status, 400)
  assert.equal('error' in result.body ? result.body.error.code : '', 'invalid-request')
})

test('unknown tool in the catalog is rejected with 400', async () => {
  const body = { ...validRequest(), tools: [{ name: 'evil_tool', description: 'x', parameters: { type: 'object', properties: {}, required: [] } }] }
  const result = await handleAnalystRequest(body, { env: env() })
  assert.equal(result.status, 400)
  const code = 'error' in result.body ? result.body.error.code : ''
  assert.equal(code, 'invalid-request')
})

// 3. successful provider response
test('successful provider response is forwarded with tool calls intact', async () => {
  const provider = {
    name: 'test-provider',
    async generate(): Promise<LLMResult> {
      return {
        content: '',
        toolCalls: [{ id: 'call_1', name: 'getMarketSnapshot', arguments: {} }],
        stopReason: 'tool_calls',
      }
    },
  }
  const result = await handleAnalystRequest(validRequest(), { env: env(), provider })
  assert.equal(result.status, 200)
  const body = result.body as { content: string; toolCalls: Array<{ id: string; name: string; arguments: unknown }> }
  assert.equal(body.toolCalls.length, 1)
  assert.equal(body.toolCalls[0].name, 'getMarketSnapshot')
  assert.deepEqual(body.toolCalls[0].arguments, {})
})

// 4. provider timeout
test('provider timeout maps to 504 timeout', async () => {
  const provider = {
    name: 'slow-provider',
    async generate(): Promise<LLMResult> {
      throw new ProviderError('timeout', 'provider timed out')
    },
  }
  const result = await handleAnalystRequest(validRequest(), { env: env(), provider })
  assert.equal(result.status, 504)
  assert.ok('error' in result.body)
  assert.equal(result.body.error.code, 'timeout')
})

// 5. provider rate limit
test('provider rate limit maps to 429 rate-limit', async () => {
  const provider = {
    name: 'rate-limited',
    async generate(): Promise<LLMResult> {
      throw new ProviderError('rate-limit', 'slow down')
    },
  }
  const result = await handleAnalystRequest(validRequest(), { env: env(), provider })
  assert.equal(result.status, 429)
  assert.ok('error' in result.body)
  assert.equal(result.body.error.code, 'rate-limit')
})

// 6. provider 500
test('provider HTTP 500 maps to a sanitized 503 provider-error', async () => {
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    model: 'test-model',
    apiKey: 'sk-test-secret',
    fetchImpl: async () =>
      jsonResponse({ ok: false, status: 500, body: { error: { message: 'internal server error with trace /var/www/app' } } }),
  })
  const result = await handleAnalystRequest(validRequest(), { env: env(), provider })
  assert.equal(result.status, 503)
  const body = JSON.stringify(result.body)
  assert.ok(!body.includes('/var/www/app'), 'no internal server path may leak')
  assert.ok(!body.includes('sk-test-secret'), 'no API key may leak')
  assert.ok('error' in result.body)
  assert.equal(result.body.error.code, 'provider-error')
})

// 7. malformed provider response
test('malformed provider response maps to 502 provider-error', async () => {
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    model: 'test-model',
    apiKey: 'sk-test-secret',
    fetchImpl: async () => jsonResponse({ body: { choices: [] } }),
  })
  const result = await handleAnalystRequest(validRequest(), { env: env(), provider })
  assert.equal(result.status, 502)
  assert.ok('error' in result.body)
  assert.equal(result.body.error.code, 'provider-error')
})

test('Gemini model-retired 404 (array error body) maps to a sanitized 502 that points at the model config', async () => {
  // Regression: the live Gemini OpenAI-compatible gateway returned HTTP 404
  // with an ARRAY error body ([{ error: { message } }]) for the retired model
  // id gemini-2.5-flash. This is a REJECTED REQUEST (bad-request), so the
  // client must get an honest pointer to the server config — never the
  // misleading "malformed response" wording, and never the real reason or key.
  const KEY = 'sk-test-secret'
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    apiKey: KEY,
    fetchImpl: async () =>
      jsonResponse({
        ok: false,
        status: 404,
        body: [
          {
            error: {
              code: 404,
              message: `This model models/gemini-2.5-flash is no longer available. ${KEY}`,
              status: 'NOT_FOUND',
            },
          },
        ],
      }),
  })
  const result = await handleAnalystRequest(validRequest(), { env: env(), provider })
  assert.equal(result.status, 502)
  assert.ok('error' in result.body)
  assert.equal(result.body.error.code, 'provider-error')
  const body = JSON.stringify(result.body)
  assert.ok(!body.includes('no longer available'), 'the real provider reason stays server-side')
  assert.ok(!body.includes(KEY), 'the key must never appear in the client response')
  const message = 'error' in result.body ? result.body.error.message : ''
  assert.ok(!message.includes('malformed'), 'a rejected request is never reported as malformed')
  assert.ok(message.includes('FINOVA_LLM_MODEL'), 'the client is pointed at the server-side model config')
})

test('provider content exceeding the size limit is rejected with 502', async () => {
  const provider = {
    name: 'blabber',
    async generate(): Promise<LLMResult> {
      return { content: 'x'.repeat(70_000), toolCalls: [] }
    },
  }
  const result = await handleAnalystRequest(validRequest(), { env: env(), provider })
  assert.equal(result.status, 502)
})

test('unknown tool name in provider tool calls is rejected with 502', async () => {
  const provider = {
    name: 'rogue',
    async generate(): Promise<LLMResult> {
      return { content: '', toolCalls: [{ id: 'c1', name: 'deleteEverything', arguments: {} }] }
    },
  }
  const result = await handleAnalystRequest(validRequest(), { env: env(), provider })
  assert.equal(result.status, 502)
  const message = 'error' in result.body ? result.body.error.message : ''
  assert.ok(message.includes('deleteEverything'), 'names the offending tool, never a secret')
})

// 8. missing server API key
test('missing server API key returns 503 provider-not-configured (no secrets)', async () => {
  const result = await handleAnalystRequest(validRequest(), { env: null })
  assert.equal(result.status, 503)
  assert.ok('error' in result.body)
  assert.equal(result.body.error.code, 'provider-not-configured')
  const body = JSON.stringify(result.body)
  assert.ok(!body.includes('apiKey'), 'never references the key value')
  assert.ok(!body.includes('Bearer'), 'never builds an Authorization header')
})

// 9. tool call forwarding
test('tool calls are forwarded to the client with names and arguments', async () => {
  const provider = {
    name: 'tooling',
    async generate(): Promise<LLMResult> {
      return {
        content: '',
        toolCalls: [
          { id: 'call_a', name: 'getTechnicalAnalysis', arguments: { instrument: 'nifty-50' } },
          { id: 'call_b', name: 'getMarketBreadth', arguments: {} },
        ],
      }
    },
  }
  const result = await handleAnalystRequest(validRequest(), { env: env(), provider })
  assert.equal(result.status, 200)
  const body = result.body as { toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }
  assert.equal(body.toolCalls.length, 2)
  assert.equal(body.toolCalls[0].name, 'getTechnicalAnalysis')
  assert.deepEqual(body.toolCalls[0].arguments, { instrument: 'nifty-50' })
})

// 10. no secret leakage (including redaction of provider messages)
test('provider error details are never forwarded to the client', async () => {
  const KEY = 'sk-super-secret-xyz'
  const e = env({ FINOVA_LLM_API_KEY: KEY })
  const provider = {
    name: 'leaky',
    async generate(): Promise<LLMResult> {
      throw new ProviderError('network', `cannot reach host using key ${KEY}`)
    },
  }
  const result = await handleAnalystRequest(validRequest(), { env: e, provider })
  assert.equal(result.status, 502)
  const body = JSON.stringify(result.body)
  assert.ok(!body.includes(KEY), 'the key must never appear in any response field')
  assert.ok(!body.includes('cannot reach host'), 'raw provider text is never forwarded')
  assert.ok(!body.includes('sk-'), 'no key-shaped value may leak')
})

test('auth failures carry a generic message that never echoes the key', async () => {
  const KEY = 'sk-wrong-key-000'
  const e = env({ FINOVA_LLM_API_KEY: KEY })
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    model: 'test-model',
    apiKey: KEY,
    fetchImpl: async () => jsonResponse({ ok: false, status: 401, body: { error: { message: `bad key ${KEY}` } } }),
  })
  const result = await handleAnalystRequest(validRequest(), { env: e, provider })
  assert.equal(result.status, 502)
  const body = JSON.stringify(result.body)
  assert.ok(!body.includes(KEY), 'the key must never appear')
  assert.ok(!body.includes('Authorization'), 'no auth header shape leaks')
})

// 11. deterministic fallback through a failing API boundary
test('a failing API boundary falls back to the deterministic engine', async () => {
  const boundary = createApiBoundaryProvider({
    endpoint: 'https://analyst.invalid/api/analyze',
    fetchImpl: async () =>
      jsonResponse({ ok: false, status: 503, body: { error: { code: 'provider-not-configured', message: 'not configured' } } }),
  })
  const engine = createAgentAnalystEngine({
    provider: boundary,
    registry: createDefaultAnalystToolRegistry(),
    toolContext: createDefaultToolContext(NOW),
    fallback: localAnalystEngine,
  })
  const response = await engine.generate({ text: 'Why is NIFTY weak?', context: buildAnalystContext() })
  assert.equal(response.intent, 'explain', 'deterministic engine classified the question')
  assert.equal(validateStructuredResponse(response).ok, true)
})

// 12. structured response validation preserved through the boundary
test('structured response validation is preserved through the API boundary', async () => {
  const content = JSON.stringify({
    intent: 'explain',
    title: 'Boundary answer',
    summary: 'Answer routed through the gateway.',
    sections: [{ heading: 'Evidence', kind: 'fact', body: 'Tool evidence.' }],
    findings: [{ kind: 'fact', title: 'Trend', detail: 'up' }],
    confidence: 'High',
  })
  const boundary = createApiBoundaryProvider({
    endpoint: 'https://analyst.invalid/api/analyze',
    fetchImpl: async () => jsonResponse({ body: { content, toolCalls: [] } }),
  })
  const engine = createAgentAnalystEngine({
    provider: boundary,
    registry: createDefaultAnalystToolRegistry(),
    toolContext: createDefaultToolContext(NOW),
  })
  const response = await engine.generate({ text: 'hi', context: buildAnalystContext() })
  assert.equal(response.title, 'Boundary answer')
  assert.equal(validateStructuredResponse(response).ok, true)
})

// request-limit guardrails (Step 13)
test('oversized question is rejected with 413 request-too-large', async () => {
  const body = {
    ...validRequest(),
    messages: [{ role: 'user', content: 'x'.repeat(9_000) }],
  }
  const result = await handleAnalystRequest(body, { env: env() })
  assert.equal(result.status, 413)
  assert.ok('error' in result.body)
  assert.equal(result.body.error.code, 'request-too-large')
})

test('too many messages are rejected', async () => {
  const body = {
    ...validRequest(),
    messages: Array.from({ length: 60 }, () => ({ role: 'user' as const, content: 'hi' })),
  }
  const result = await handleAnalystRequest(body, { env: env() })
  assert.equal(result.status, 413)
  assert.equal('error' in result.body ? result.body.error.code : '', 'request-too-large')
})

test('invalid message role is rejected', async () => {
  const body = { ...validRequest(), messages: [{ role: 'guest', content: 'hi' }] }
  const result = await handleAnalystRequest(body, { env: env() })
  assert.equal(result.status, 400)
  assert.equal('error' in result.body ? result.body.error.code : '', 'invalid-request')
})

test('invalid temperature is rejected', async () => {
  const body = { ...validRequest(), temperature: 9 }
  const result = await handleAnalystRequest(body, { env: env() })
  assert.equal(result.status, 400)
})

test('excessively large tool-argument object in a provider call is rejected', async () => {
  const provider = {
    name: 'huge-args',
    async generate(): Promise<LLMResult> {
      return {
        content: '',
        toolCalls: [{ id: 'c1', name: 'getTechnicalAnalysis', arguments: { instrument: 'nifty-50', padding: 'y'.repeat(9_000) } }],
      }
    },
  }
  const result = await handleAnalystRequest(validRequest(), { env: env(), provider })
  assert.equal(result.status, 502)
})