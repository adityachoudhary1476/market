import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { routeRequest } from '../http'
import { resolveServerEnv, type ServerEnv } from '../env'
import type { LLMResult } from '../../agent/types'

function fakeReq(opts: { method: string; url: string; headers?: Record<string, string>; body?: string; remoteAddress?: string }): IncomingMessage {
  const emitter = new EventEmitter()
  const req = {
    method: opts.method,
    url: opts.url,
    headers: opts.headers ?? {},
    socket: { remoteAddress: opts.remoteAddress ?? '127.0.0.1' },
    on: emitter.on.bind(emitter),
    removeAllListeners: emitter.removeAllListeners.bind(emitter),
  } as unknown as IncomingMessage
  const raw = opts.body ?? ''
  queueMicrotask(() => {
    const chunkSize = 1000
    for (let i = 0; i < raw.length; i += chunkSize) {
      emitter.emit('data', Buffer.from(raw.slice(i, i + chunkSize), 'utf8'))
    }
    emitter.emit('end')
  })
  return req
}

interface FakeRes {
  status: number
  headers: Record<string, string | number>
  body: string
}

function fakeRes(): ServerResponse & { out: FakeRes } {
  const out: FakeRes = { status: 0, headers: {}, body: '' }
  const res = {
    out,
    headersSent: false,
    writableEnded: false,
    writeHead(status: number, headers: Record<string, string | number>) {
      out.status = status
      if (headers) Object.assign(out.headers, headers)
    },
    setHeader(k: string, v: string | number) {
      out.headers[k] = v
    },
    end(payload?: unknown) {
      if (typeof payload === 'string') out.body = payload
      out.status = out.status || 200
    },
  } as unknown as ServerResponse & { out: FakeRes }
  return res
}

function env(overrides: Record<string, string> = {}): ServerEnv {
  const resolved = resolveServerEnv({ FINOVA_LLM_API_KEY: 'sk-test-secret', ...overrides })
  assert.ok(resolved)
  return resolved
}

const provider = {
  name: 'http-test-provider',
  async generate(): Promise<LLMResult> {
    return { content: '{"intent":"ask"}', toolCalls: [] }
  },
}

test('OPTIONS preflight returns 204 with CORS headers', async () => {
  const req = fakeReq({ method: 'OPTIONS', url: '/api/analyze' })
  const res = fakeRes()
  await routeRequest(req, res, { env: env() })
  assert.equal(res.out.status, 204)
  assert.equal(res.out.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS')
})

test('non-POST methods are rejected with 405', async () => {
  const req = fakeReq({ method: 'GET', url: '/api/analyze' })
  const res = fakeRes()
  await routeRequest(req, res, { env: env() })
  assert.equal(res.out.status, 405)
  assert.ok(JSON.parse(res.out.body).error.code === 'invalid-request')
})

test('unknown paths are rejected with 404', async () => {
  const req = fakeReq({ method: 'POST', url: '/api/other' })
  const res = fakeRes()
  await routeRequest(req, res, { env: env() })
  assert.equal(res.out.status, 404)
})

test('oversized content-length is rejected with 413', async () => {
  const req = fakeReq({ method: 'POST', url: '/api/analyze', headers: { 'content-length': '999999999' } })
  const res = fakeRes()
  await routeRequest(req, res, { env: env() })
  assert.equal(res.out.status, 413)
})

test('malformed JSON body is rejected with 400', async () => {
  const req = fakeReq({ method: 'POST', url: '/api/analyze', body: '{not json' })
  const res = fakeRes()
  await routeRequest(req, res, { env: env() })
  assert.equal(res.out.status, 400)
  assert.ok(JSON.parse(res.out.body).error.code === 'invalid-request')
})

test('unconfigured gateway returns 503 provider-not-configured', async () => {
  const req = fakeReq({ method: 'POST', url: '/api/analyze', body: JSON.stringify({ system: 's', messages: [{ role: 'user', content: 'hi' }] }) })
  const res = fakeRes()
  await routeRequest(req, res, { env: null })
  assert.equal(res.out.status, 503)
  assert.equal(JSON.parse(res.out.body).error.code, 'provider-not-configured')
})

// --- Phase 3C.1 — /api/search route -----------------------------------------

test('POST /api/search with no search env returns 503 provider-not-configured', async () => {
  const req = fakeReq({ method: 'POST', url: '/api/search', body: JSON.stringify({ query: 'NIFTY news', maxResults: 5 }) })
  const res = fakeRes()
  await routeRequest(req, res, { env: null, searchEnv: null })
  assert.equal(res.out.status, 503)
  const body = JSON.parse(res.out.body) as { error: { code: string } }
  assert.equal(body.error.code, 'provider-not-configured')
})

test('POST /api/search rejects an invalid query with 400 before any provider call', async () => {
  const req = fakeReq({ method: 'POST', url: '/api/search', body: JSON.stringify({ query: 'x'.repeat(401) }) })
  const res = fakeRes()
  await routeRequest(req, res, { env: null, searchEnv: null })
  assert.equal(res.out.status, 400)
  const body = JSON.parse(res.out.body) as { error: { code: string } }
  assert.equal(body.error.code, 'invalid-request')
})

test('a working request returns the provider result', async () => {
  const req = fakeReq({
    method: 'POST',
    url: '/api/analyze',
    body: JSON.stringify({ system: 's', messages: [{ role: 'user', content: 'hi' }], tools: [] }),
  })
  const res = fakeRes()
  await routeRequest(req, res, { env: env(), provider })
  assert.equal(res.out.status, 200)
  assert.equal(JSON.parse(res.out.body).content, '{"intent":"ask"}')
})

test('rate limit guard returns 429 with Retry-After when exceeded', async () => {
  // Unique config so the process-level limiter is isolated for this test.
  const e = env({ FINOVA_GATEWAY_RATE_LIMIT: '1', FINOVA_GATEWAY_RATE_LIMIT_WINDOW_MS: '90000' })
  const body = JSON.stringify({ system: 's', messages: [{ role: 'user', content: 'hi' }], tools: [] })
  const first = fakeReq({ method: 'POST', url: '/api/analyze', body, remoteAddress: '10.0.0.9' })
  const res1 = fakeRes()
  await routeRequest(first, res1, { env: e, provider })
  assert.equal(res1.out.status, 200)

  const second = fakeReq({ method: 'POST', url: '/api/analyze', body, remoteAddress: '10.0.0.9' })
  const res2 = fakeRes()
  await routeRequest(second, res2, { env: e, provider })
  assert.equal(res2.out.status, 429)
  assert.ok(res2.out.headers['Retry-After'] !== undefined)
  assert.equal(JSON.parse(res2.out.body).error.code, 'rate-limit')
})