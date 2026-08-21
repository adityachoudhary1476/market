// ---------------------------------------------------------------------------
// Phase 3B — Analyst API gateway: HTTP framing
//
// A zero-dependency Node HTTP adapter shared by:
//   - server.ts   — local dev/self-hosted server
//   - handler.ts  — serverless function entry (Vercel-style Node signature)
//
// Responsibilities:
//   - route + method + CORS preflight handling
//   - capped request-body reading (413 on overflow)
//   - optional in-memory per-IP rate limiting (429 + Retry-After)
//   - hard per-request deadline (504)
//   - JSON framing of the gateway result
//
// No framework. No auth system. No secrets on the wire.
// ---------------------------------------------------------------------------

import type { IncomingMessage, ServerResponse } from 'node:http'
import { ANALYST_GATEWAY_PATH, SEARCH_GATEWAY_PATH, MARKET_DATA_PATH } from '../api/contract'
import type { ServerEnv } from './env'
import { GATEWAY_LIMITS } from './limits'
import { handleAnalystRequest } from './gateway'
import { handleSearchRequest } from '../websearch/server/searchGateway'
import type { SearchEnv } from '../websearch/server/env'
import { createRateLimiter } from './rateLimit'
import { logAgent } from '../agent/logger'
import { handleMarketDataRequest } from './marketDataGateway'

export interface HttpGatewayDeps {
  env: ServerEnv | null
  /** Injectable provider for tests (bypasses env wiring). */
  provider?: Parameters<typeof handleAnalystRequest>[1]['provider']
  /** Server-side web-search env (Phase 3C.1). null = not configured. */
  searchEnv?: SearchEnv | null
  /** Optional free EIA key; independent of LLM configuration. */
  marketDataApiKey?: string | null
}

const JSON_TYPE = 'application/json; charset=utf-8'

// Rate-limit defaults applied when the LLM gateway env is absent but the
// search route is still served (same per-IP fixed-window policy).
const FALLBACK_RATE_LIMIT = { max: 60, windowMs: 60_000 } as const

// Process-level limiter (per-process fixed window). Created lazily on first
// use so every request shares the same window state.
let sharedLimiter: ((key: string) => ReturnType<ReturnType<typeof createRateLimiter>>) | null = null
let limiterKey = ''

function limiterFor(max: number, windowMs: number): (key: string) => ReturnType<ReturnType<typeof createRateLimiter>> {
  const key = `${max}:${windowMs}`
  if (!sharedLimiter || limiterKey !== key) {
    sharedLimiter = createRateLimiter({ max, windowMs })
    limiterKey = key
  }
  return sharedLimiter
}

function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent || res.writableEnded) return
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': JSON_TYPE, 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

function applyCors(req: IncomingMessage, res: ServerResponse, corsOrigin: string): void {
  if (corsOrigin === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*')
  } else {
    const origin = req.headers.origin
    if (origin === corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
}

/**
 * Read a request body with a hard byte cap. Returns the raw UTF-8 text or a
 * failure that has already been answered with the appropriate status.
 */
function readBody(
  req: IncomingMessage,
  res: ServerResponse,
  maxBytes: number,
): Promise<{ ok: true; raw: string } | { ok: false }> {
  return new Promise((resolve) => {
    const declared = Number(req.headers['content-length'] ?? 0)
    if (Number.isFinite(declared) && declared > maxBytes) {
      send(res, 413, { error: { code: 'request-too-large', message: 'Request body exceeds the size limit.' } })
      resolve({ ok: false })
      return
    }

    const chunks: Buffer[] = []
    let total = 0
    let finished = false

    const finish = (result: { ok: true; raw: string } | { ok: false }): void => {
      if (finished) return
      finished = true
      resolve(result)
    }

    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        send(res, 413, { error: { code: 'request-too-large', message: 'Request body exceeds the size limit.' } })
        req.removeAllListeners('data')
        req.removeAllListeners('end')
        req.removeAllListeners('error')
        finish({ ok: false })
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      finish({ ok: true, raw: Buffer.concat(chunks).toString('utf8') })
    })
    req.on('error', () => {
      finish({ ok: false })
    })
  })
}

/**
 * Route one HTTP request through the gateway.
 * Returns nothing — all outcomes are written to `res`.
 */
export async function routeRequest(req: IncomingMessage, res: ServerResponse, deps: HttpGatewayDeps): Promise<void> {
  const { env, searchEnv } = deps
  const url = new URL(req.url ?? '/', 'http://localhost')
  const corsOrigin = env?.corsOrigin ?? '*'

  applyCors(req, res, corsOrigin)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    send(res, 405, { error: { code: 'invalid-request', message: 'Method not allowed. Use POST.' } })
    return
  }

  const isAnalyze = url.pathname === ANALYST_GATEWAY_PATH
  const isSearch = url.pathname === SEARCH_GATEWAY_PATH
  const isMarketData = url.pathname === MARKET_DATA_PATH
  if (!isAnalyze && !isSearch && !isMarketData) {
    send(res, 404, {
      error: { code: 'invalid-request', message: `Not found. Use POST ${ANALYST_GATEWAY_PATH} or ${SEARCH_GATEWAY_PATH}.` },
    })
    return
  }

  // Per-IP fixed-window guard (when enabled). The search route keeps the same
  // protection even when the LLM gateway env is absent.
  const rateLimitMax = env?.rateLimitMax ?? (searchEnv ? FALLBACK_RATE_LIMIT.max : 0)
  const rateLimitWindowMs = env?.rateLimitWindowMs ?? FALLBACK_RATE_LIMIT.windowMs
  if (rateLimitMax > 0) {
    const limiter = limiterFor(rateLimitMax, rateLimitWindowMs)
    const key = req.socket.remoteAddress ?? 'unknown'
    const decision = limiter(key)
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(Math.ceil(decision.retryAfterMs / 1000)))
      send(res, 429, { error: { code: 'rate-limit', message: 'Too many requests. Try again shortly.' } })
      return
    }
  }

  // Hard deadline so a hung upstream can never hold a socket forever.
  const deadline = setTimeout(() => {
    if (!res.writableEnded) {
      send(res, 504, { error: { code: 'timeout', message: 'The request exceeded the gateway deadline.' } })
    }
  }, GATEWAY_LIMITS.maxRequestDeadlineMs)
  const clearDeadline = (): void => clearTimeout(deadline)

  try {
    const read = await readBody(req, res, GATEWAY_LIMITS.maxBodyBytes)
    if (!read.ok) return

    let body: unknown
    try {
      body = JSON.parse(read.raw) as unknown
    } catch {
      send(res, 400, { error: { code: 'invalid-request', message: 'Request body must be valid JSON.' } })
      return
    }

    const result = isSearch
      ? await handleSearchRequest(body, { searchEnv: searchEnv ?? null })
      : isMarketData
        ? await handleMarketDataRequest(body, { apiKey: deps.marketDataApiKey ?? env?.eiaApiKey ?? null })
        : await handleAnalystRequest(body, { env, provider: deps.provider })
    send(res, result.status, result.body)
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : 'Unexpected HTTP failure'
    logAgent({ kind: 'gateway-error', category: 'internal', message })
    if (!res.writableEnded) {
      send(res, 500, { error: { code: 'internal', message: 'The Analyst gateway hit an unexpected internal error.' } })
    }
  } finally {
    clearDeadline()
  }
}