// ---------------------------------------------------------------------------
// Phase 3C.1 — Web search gateway: /api/search core handler
//
// SERVER-ONLY, framework-independent. Receives a decoded request body,
// validates it against the approved limits, calls the configured
// Tavily/Brave provider through the provider-agnostic seam, normalizes and
// deduplicates results, enforces the evidence budget and caches responses.
// HTTP framing (body cap, rate limit, deadline, CORS) lives in
// src/analyst/server/http.ts; tests drive this function directly with
// injected providers/caches.
//
// Security model:
//   - Provider API keys live ONLY in SearchEnv (server-side); they are never
//     returned, logged or echoed to the client.
//   - Every provider error maps to a sanitized { code, message } shape —
//     fixed, generic client text; provider messages are logged (redacted)
//     server-side only.
//   - Results are normalized + deduplicated + budgeted (12,000 chars) and
//     every URL is validated — the gateway never invents sources.
//   - One transient retry per request; then the mapped error is returned.
// ---------------------------------------------------------------------------

import type { SearchGatewayError, SearchGatewayErrorCode, SearchGatewayResponseBody, SearchProviderResult, WebSearchProvider, SearchProviderId } from '../types'
import { validateWebSearchQuery, WEBSEARCH_LIMITS, searchCacheKey } from '../limits'
import { finalizeSearchResults } from '../normalize'
import { createSearchCache, type SearchCache } from '../cache'
import { SearchProviderError } from '../providers/errors'
import { createWebSearchProvider, createRssProvider } from '../providers'
import type { SearchEnv } from './env'
import { logAgent } from '../../agent/logger'

export interface SearchGatewayDeps {
  /** Server-side search env. null means web search is not configured. */
  searchEnv: SearchEnv | null
  /** Injectable provider for tests; defaults to the env-wired provider. */
  provider?: WebSearchProvider
  /** Injectable cache for tests; defaults to a module-level cache. */
  cache?: SearchCache
  now?: () => number
}

export interface SearchGatewayResult {
  status: number
  body: SearchGatewayResponseBody
}

function errorBody(code: SearchGatewayErrorCode, message: string): { error: SearchGatewayError } {
  return { error: { code, message } }
}

/** Redact any secret that could theoretically appear inside a provider message. */
function redact(text: string, secrets: readonly string[]): string {
  let out = text
  for (const secret of secrets) {
    if (secret.length > 0) out = out.split(secret).join('[redacted]')
  }
  return out.slice(0, 300)
}

function mapProviderError(err: SearchProviderError): { status: number; body: { error: SearchGatewayError } } {
  // Client-facing messages are deliberately generic and fixed — provider text
  // can contain internal paths, request ids or other internals.
  switch (err.kind) {
    case 'rate-limit':
      return { status: 429, body: errorBody('rate-limit', 'The search provider rate-limited this request. Try again shortly.') }
    case 'timeout':
      return { status: 504, body: errorBody('timeout', 'The search provider timed out.') }
    case 'auth':
      return {
        status: 502,
        body: errorBody('provider-error', 'The search provider rejected the server credentials. Check the provider API key on the server.'),
      }
    case 'network':
      return { status: 502, body: errorBody('provider-error', 'The search provider is unreachable.') }
    case 'invalid-response':
      return { status: 502, body: errorBody('provider-error', 'The search provider returned a malformed response.') }
    case 'unavailable':
      return { status: 503, body: errorBody('provider-error', 'The search provider is unavailable.') }
  }
}

/**
 * The one shared response cache across requests (bounded: env TTL/max,
 * defaults 300s / 100 entries). Created lazily so tests can inject their own.
 */
let sharedCache: SearchCache | null = null

function defaultCache(searchEnv: SearchEnv): SearchCache {
  if (!sharedCache) {
    sharedCache = createSearchCache({
      maxEntries: searchEnv.cacheMaxEntries,
      ttlMs: searchEnv.cacheTtlMs,
    })
  }
  return sharedCache
}

/**
 * Handle one /api/search request. Never throws: every outcome is a
 * status + body.
 */
export async function handleSearchRequest(body: unknown, deps: SearchGatewayDeps): Promise<SearchGatewayResult> {
  const now = deps.now ?? (() => Date.now())
  const started = now()
  const secrets = deps.searchEnv ? [deps.searchEnv.apiKey] : []

  const validation = validateWebSearchQuery(body)
  if (!validation.ok) {
    logAgent({ kind: 'gateway-error', category: 'invalid-request', message: validation.error })
    return { status: 400, body: errorBody('invalid-request', validation.error) }
  }
  const query = validation.query

  if (!deps.searchEnv) {
    logAgent({ kind: 'gateway-error', category: 'provider-not-configured', message: 'search gateway not configured' })
    return {
      status: 503,
      body: errorBody(
        'provider-not-configured',
        'Web search is not configured on the server. Set FINOVA_WEB_SEARCH_PROVIDER and FINOVA_WEB_SEARCH_API_KEY.',
      ),
    }
  }

  const searchEnv = deps.searchEnv
  const configuredProvider = deps.provider ?? createWebSearchProvider({
    provider: searchEnv.provider,
    apiKey: searchEnv.apiKey,
    timeoutMs: searchEnv.timeoutMs,
    ...(searchEnv.baseUrl !== undefined ? { baseUrl: searchEnv.baseUrl } : {}),
  })
  const cache = deps.cache ?? defaultCache(searchEnv)
  const cacheKey = searchCacheKey(query, configuredProvider.name)

  const cached = cache.get(cacheKey)
  if (cached) {
    logAgent({ kind: 'search-response', provider: configuredProvider.name, cached: true, results: cached.results.length })
    return { status: 200, body: { ...cached, cached: true } }
  }

  // Phase 2 — RSS-first provider fallback: try the free RSS/Atom provider
  // before falling back to Tavily/Brave. RSS is key-less and free; it never
  // blocks the configured provider. If RSS returns usable results they are
  // used; otherwise the configured provider is attempted.
  const rssProvider: WebSearchProvider = createRssProvider({
    feedUrls: searchEnv.baseUrl?.split(',').map((u) => u.trim()).filter(Boolean),
    timeoutMs: searchEnv.timeoutMs,
  })

  async function tryRss(): Promise<SearchProviderResult | null> {
    try {
      const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(searchEnv.timeoutMs)
        : undefined
      const raw = await rssProvider.search({
        query: query.query,
        maxResults: query.maxResults ?? WEBSEARCH_LIMITS.defaultResults,
        ...(query.recencyDays !== undefined ? { recencyDays: query.recencyDays } : {}),
        ...(query.domainFilter !== undefined ? { domainFilter: query.domainFilter } : {}),
        ...(signal ? { signal } : {}),
      })
      if (raw.results.length > 0) {
        logAgent({ kind: 'search-response', provider: 'rss', results: raw.results.length })
        return raw
      }
    } catch {
      // RSS feed unavailable — fall back to the configured provider.
    }
    return null
  }

  let attempt = 0
  for (;;) {
    try {
      const rssResult = await tryRss()
      let raw: SearchProviderResult | null = rssResult
      let providerId: SearchProviderId = 'rss'

      if (!rssResult) {
        const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(searchEnv.timeoutMs)
          : undefined
        raw = await configuredProvider.search({
          query: query.query,
          maxResults: query.maxResults ?? WEBSEARCH_LIMITS.defaultResults,
          ...(query.recencyDays !== undefined ? { recencyDays: query.recencyDays } : {}),
          ...(query.domainFilter !== undefined ? { domainFilter: query.domainFilter } : {}),
          ...(signal ? { signal } : {}),
        })
        providerId = configuredProvider.name as SearchProviderId
        logAgent({ kind: 'search-response', provider: providerId, results: raw.results.length })
      }

      if (!raw) {
        return { status: 503, body: errorBody('provider-error', 'All search providers returned no results.') }
      }

      const finalized = finalizeSearchResults(raw.results, {
        provider: providerId,
        maxResults: query.maxResults ?? WEBSEARCH_LIMITS.defaultResults,
      })
      const response = {
        query: query.query,
        provider: providerId,
        results: finalized.results,
        totalResults: finalized.totalResults,
        truncated: finalized.truncated,
        durationMs: now() - started,
      }
      if (finalized.dropped > 0 || finalized.deduplicated > 0) {
        logAgent({
          kind: 'search-response',
          provider: providerId,
          results: finalized.results.length,
          dropped: finalized.dropped,
          deduplicated: finalized.deduplicated,
          truncated: finalized.truncated,
        })
      } else {
        logAgent({ kind: 'search-response', provider: providerId, results: finalized.results.length })
      }
      cache.set(cacheKey, response)
      return { status: 200, body: response }
    } catch (thrown) {
      const err = thrown instanceof SearchProviderError
        ? thrown
        : new SearchProviderError('unavailable', thrown instanceof Error ? thrown.message : 'Unknown search provider failure')
      attempt += 1
      logAgent({ kind: 'gateway-error', category: err.kind, message: redact(err.message, secrets) })
      // Approved: exactly ONE transient retry.
      if (attempt <= 1 && err.retryable) continue
      return mapProviderError(err)
    }
  }
}
