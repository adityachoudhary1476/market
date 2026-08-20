import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHttpWebSearchTransport, deriveSearchEndpoint, SearchTransportError } from '../transport'
import type { WebSearchResult } from '../types'

function jsonOk(body: unknown) {
  return { ok: true, status: 200, async json() { return body } }
}

function jsonError(status: number, body: unknown) {
  return { ok: false, status, async json() { return body } }
}

const RESULT: WebSearchResult = {
  title: 'Headline',
  url: 'https://news.example.com/a',
  snippet: 'Body.',
  source: 'news.example.com',
  publishedAt: '2026-01-01T00:00:00.000Z',
  provider: 'tavily',
}

test('transport: posts the query and returns validated results', async () => {
  let captured: { url: string; init: { method: string; headers: Record<string, string>; body: string } } | null = null
  const transport = createHttpWebSearchTransport({
    endpoint: 'https://gateway.test/api/search',
    fetchImpl: async (url, init) => {
      captured = { url, init }
      return jsonOk({
        query: 'NIFTY news',
        provider: 'tavily',
        results: [RESULT, { ...RESULT, url: 'javascript:bad' }],
        totalResults: 2,
        truncated: false,
      })
    },
  })
  const response = await transport.search({ query: 'NIFTY news', maxResults: 5 })
  assert.equal(captured!.url, 'https://gateway.test/api/search')
  assert.equal(captured!.init.method, 'POST')
  const body = JSON.parse(captured!.init.body) as Record<string, unknown>
  assert.deepEqual(body, { query: 'NIFTY news', maxResults: 5 })
  assert.equal(response.results.length, 1, 'untrusted shapes are filtered defensively')
  assert.equal(response.results[0].title, 'Headline')
})

test('transport: sanitized gateway errors become typed failures', async () => {
  const transport = createHttpWebSearchTransport({
    endpoint: 'https://gateway.test/api/search',
    fetchImpl: async () => jsonError(503, { error: { code: 'provider-not-configured', message: 'Web search is not configured on the server.' } }),
  })
  await assert.rejects(
    () => transport.search({ query: 'q' }),
    (err: unknown) => err instanceof SearchTransportError && err.code === 'provider-not-configured',
  )
  const rateLimited = createHttpWebSearchTransport({
    endpoint: 'https://gateway.test/api/search',
    fetchImpl: async () => jsonError(429, { error: { code: 'rate-limit', message: 'Slow down.' } }),
  })
  await assert.rejects(
    () => rateLimited.search({ query: 'q' }),
    (err: unknown) => err instanceof SearchTransportError && err.code === 'rate-limit' && err.retryable === true,
  )
})

test('transport: HTTP-only errors map from status codes', async () => {
  const transport = createHttpWebSearchTransport({
    endpoint: 'https://gateway.test/api/search',
    fetchImpl: async () => jsonError(504, {}),
  })
  await assert.rejects(
    () => transport.search({ query: 'q' }),
    (err: unknown) => err instanceof SearchTransportError && err.code === 'timeout',
  )
})

test('transport: malformed success responses are rejected, not trusted', async () => {
  const transport = createHttpWebSearchTransport({
    endpoint: 'https://gateway.test/api/search',
    fetchImpl: async () => jsonOk({ results: 'not-an-array' }),
  })
  await assert.rejects(
    () => transport.search({ query: 'q' }),
    (err: unknown) => err instanceof SearchTransportError && err.code === 'provider-error',
  )
  const errorBody = createHttpWebSearchTransport({
    endpoint: 'https://gateway.test/api/search',
    fetchImpl: async () => jsonOk({ error: { code: 'internal', message: 'boom' } }),
  })
  await assert.rejects(
    () => errorBody.search({ query: 'q' }),
    (err: unknown) => err instanceof SearchTransportError && err.code === 'internal',
  )
})

test('transport: network failures surface as provider-error', async () => {
  const transport = createHttpWebSearchTransport({
    endpoint: 'https://gateway.test/api/search',
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED')
    },
  })
  await assert.rejects(
    () => transport.search({ query: 'q' }),
    (err: unknown) => err instanceof SearchTransportError && err.code === 'provider-error',
  )
})

test('transport: cached responses pass the flag through', async () => {
  const transport = createHttpWebSearchTransport({
    endpoint: 'https://gateway.test/api/search',
    fetchImpl: async () => jsonOk({ query: 'q', provider: 'tavily', results: [RESULT], totalResults: 1, truncated: false, cached: true }),
  })
  const response = await transport.search({ query: 'q' })
  assert.equal(response.cached, true)
})

test('deriveSearchEndpoint: /api/analyze maps to /api/search on the same origin', () => {
  assert.equal(deriveSearchEndpoint('https://gateway.test/api/analyze'), 'https://gateway.test/api/search')
  assert.equal(deriveSearchEndpoint('https://gateway.test/api/analyze/'), 'https://gateway.test/api/search')
  assert.equal(deriveSearchEndpoint('https://gateway.test/custom/path/analyze'), 'https://gateway.test/custom/path/search')
  assert.equal(deriveSearchEndpoint('https://gateway.test/other'), 'https://gateway.test/api/search')
})