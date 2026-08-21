// ---------------------------------------------------------------------------
// Phase 3C.1 — Web search evidence layer: client transport
//
// CLIENT-SAFE. The injectable seam between the agent orchestrator (and the
// searchWeb tool) and the server-side /api/search gateway. The browser only
// knows the public gateway origin (the same FINOVA_ANALYST_API_URL the LLM
// boundary uses); every provider credential stays on the server.
//
// Honesty contract: the transport either returns real normalized results or
// throws a typed SearchTransportError — it never fabricates evidence. The
// client timeout is the approved 30s.
// ---------------------------------------------------------------------------

import type { SearchGatewayErrorCode, WebSearchQuery, WebSearchResponse, WebSearchTransport } from './types'
import { isValidWebSearchResult, WEBSEARCH_LIMITS } from './limits'

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

export interface HttpWebSearchTransportOptions {
  /** Public /api/search endpoint (client-safe). */
  endpoint: string
  /** Approved client timeout: 30s. */
  timeoutMs?: number
  fetchImpl?: FetchLike
}

/** Typed client-side transport failure — sanitized, no server internals. */
export class SearchTransportError extends Error {
  readonly code: SearchGatewayErrorCode

  constructor(code: SearchGatewayErrorCode, message: string) {
    super(message)
    this.name = 'SearchTransportError'
    this.code = code
  }

  /** Failures worth surfacing as "try again later" to the LLM. */
  get retryable(): boolean {
    return this.code === 'timeout' || this.code === 'rate-limit' || this.code === 'internal'
  }
}

const GATEWAY_ERROR_CODES: readonly SearchGatewayErrorCode[] = [
  'invalid-request',
  'request-too-large',
  'provider-not-configured',
  'provider-error',
  'rate-limit',
  'timeout',
  'internal',
]

/** Normalize an untrusted body error code to a known sanitized code. */
function normalizeErrorCode(v: unknown): SearchGatewayErrorCode {
  return typeof v === 'string' && (GATEWAY_ERROR_CODES as readonly string[]).includes(v)
    ? (v as SearchGatewayErrorCode)
    : 'provider-error'
}

function mapStatusToCode(status: number, bodyCode: string | undefined): SearchGatewayErrorCode {
  if (bodyCode !== undefined && (GATEWAY_ERROR_CODES as readonly string[]).includes(bodyCode)) {
    return bodyCode as SearchGatewayErrorCode
  }
  if (status === 429) return 'rate-limit'
  if (status === 504) return 'timeout'
  if (status === 503) return 'provider-error'
  if (status >= 500) return 'internal'
  if (status === 413) return 'request-too-large'
  return 'invalid-request'
}

/**
 * HTTP transport to the server-side search gateway. Injectable fetch for
 * deterministic tests (locked decision 9 — never live APIs).
 */
export function createHttpWebSearchTransport(options: HttpWebSearchTransportOptions): WebSearchTransport {
  const { endpoint, timeoutMs = WEBSEARCH_LIMITS.clientTimeoutMs, fetchImpl = fetch as unknown as FetchLike } = options

  return {
    async search(query: WebSearchQuery): Promise<WebSearchResponse> {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
      const timer =
        timeoutMs > 0 && controller
          ? setTimeout(() => {
              controller.abort()
            }, timeoutMs)
          : undefined

      let res: { ok: boolean; status: number; json(): Promise<unknown> }
      try {
        res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(query),
          ...(controller ? { signal: controller.signal as unknown as never } : {}),
        })
      } catch (thrown) {
        const message = thrown instanceof Error ? thrown.message : 'Network error'
        if (thrown instanceof DOMException && thrown.name === 'AbortError') {
          throw new SearchTransportError('timeout', `The search gateway timed out after ${timeoutMs}ms.`)
        }
        throw new SearchTransportError('provider-error', message)
      } finally {
        if (timer) clearTimeout(timer)
      }

      if (!res.ok) {
        let msg = `The search gateway returned HTTP ${res.status}.`
        let code: string | undefined
        try {
          const parsed = (await res.json()) as { error?: { code?: string; message?: string } }
          if (parsed?.error?.message) msg = parsed.error.message
          code = parsed?.error?.code
        } catch {
          // ignore body parse failure
        }
        throw new SearchTransportError(mapStatusToCode(res.status, code), msg)
      }

      let parsed: unknown
      try {
        parsed = await res.json()
      } catch {
        throw new SearchTransportError('provider-error', 'The search gateway returned a non-JSON response.')
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new SearchTransportError('provider-error', 'The search gateway returned a malformed response.')
      }
      const body = parsed as {
        error?: { code?: unknown; message?: unknown }
        results?: unknown
        query?: unknown
        provider?: unknown
        totalResults?: unknown
        truncated?: unknown
        cached?: unknown
      }
      if (body.error) {
        throw new SearchTransportError(
          normalizeErrorCode(body.error.code),
          typeof body.error.message === 'string' ? body.error.message : 'The search gateway reported an error.',
        )
      }
      if (!Array.isArray(body.results)) {
        throw new SearchTransportError('provider-error', 'The search gateway returned a malformed response.')
      }

      // Defensive client-side validation: never hand untrusted shapes to the
      // orchestrator as evidence.
      const results = body.results.filter((r) => isValidWebSearchResult(r))
      return {
        query: typeof body.query === 'string' ? body.query : query.query,
        provider: body.provider === 'tavily' || body.provider === 'brave' || body.provider === 'rss' ? body.provider : 'tavily',
        results,
        totalResults: typeof body.totalResults === 'number' ? body.totalResults : results.length,
        truncated: body.truncated === true,
        ...(body.cached === true ? { cached: true } : {}),
      }
    },
  }
}

/**
 * Derive the search endpoint from the client-safe FINOVA_ANALYST_API_URL:
 * the gateway serves /api/analyze AND /api/search on the same origin, and
 * FINOVA_ANALYST_API_URL is the only FINOVA_* variable Vite exposes (the
 * envPrefix security test enforces that).
 */
export function deriveSearchEndpoint(analystApiUrl: string): string {
  try {
    const url = new URL(analystApiUrl.trim())
    url.pathname = url.pathname.replace(/\/analyze\/?$/, '/search')
    if (!url.pathname.endsWith('/search')) url.pathname = '/api/search'
    return url.toString()
  } catch {
    return analystApiUrl.trim()
  }
}

function readViteEnv(): Record<string, string | undefined> {
  try {
    // Direct import.meta.env access — required for Vite's static replacement.
    // An aliased `const meta = import.meta` would defeat it and return
    // undefined in the browser.
    return (import.meta.env as Record<string, string | undefined> | undefined) ?? {}
  } catch {
    return {}
  }
}

/**
 * The default browser transport: wired to the same gateway as the LLM
 * boundary. Returns null when no gateway is configured — the searchWeb tool
 * then reports not-configured honestly (locked decision 8).
 */
export function createDefaultWebSearchTransport(): WebSearchTransport | null {
  const analystApiUrl = readViteEnv().FINOVA_ANALYST_API_URL
  if (!analystApiUrl || analystApiUrl.trim().length === 0) return null
  return createHttpWebSearchTransport({ endpoint: deriveSearchEndpoint(analystApiUrl) })
}