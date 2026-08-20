// ---------------------------------------------------------------------------
// Retrieval-cost optimization — session-level evidence retrieval
//
// CLIENT-SAFE, no network by itself. A small cache-first seam over the
// existing WebSearchTransport (which reaches the /api/search gateway and, on
// a miss, the Tavily/Brave provider). The agent orchestrator calls
// retrieveEvidence(...) instead of touching the transport directly, so:
//
//   - duplicate/equivalent searches WITHIN one request are served from the
//     session evidence cache (no repeated Tavily calls);
//   - existing evidence is reused through caching (TTL-bounded, LRU-bounded);
//   - the transport — and therefore the Tavily provider — remains the fallback
//     whenever the cache has no usable entry.
//
// Honesty is unchanged: a cached entry IS a real, validated provider response
// (it was cached exactly as the transport returned it). Nothing is fabricated,
// and cached news is re-processed against the current clock by the caller so
// freshness stays honest.
// ---------------------------------------------------------------------------

import type { SearchProviderId, WebSearchQuery, WebSearchResponse, WebSearchTransport } from './types'
import type { SearchCache } from './cache'
import { WEBSEARCH_LIMITS, normalizeQueryKey } from './limits'

/** The two search tools that go through the retrieval seam. */
export type SearchToolId = 'searchWeb' | 'searchNews'

/**
 * Canonical session-level cache key for one search request. Normalized so
 * equivalent phrasings of the same query share one entry, and scoped by tool
 * so a news search and a web search for the same text never collide. The
 * provider is intentionally NOT part of the key: any real validated result is
 * reusable evidence regardless of which provider produced it.
 */
export function searchSessionCacheKey(query: WebSearchQuery, tool: SearchToolId): string {
  return `${tool}|${normalizeQueryKey(query.query)}|${query.maxResults ?? WEBSEARCH_LIMITS.defaultResults}|${query.recencyDays ?? ''}|${query.domainFilter ?? ''}`
}

export type RetrievalEvent =
  | { type: 'hit'; key: string }
  | { type: 'miss'; key: string }
  | { type: 'fetch'; key: string; provider: SearchProviderId }

export interface RetrieveEvidenceOptions {
  /** The session transport (gateway + Tavily/Brave on a miss). */
  transport: WebSearchTransport
  /** The validated query to satisfy. */
  query: WebSearchQuery
  /** Which search tool requested it (scopes the cache key). */
  tool: SearchToolId
  /** Optional session evidence cache. Absent = always fetch from transport. */
  cache?: SearchCache
  /** Optional dev observability hook (cache hit/miss, live provider call). */
  onEvent?: (event: RetrievalEvent) => void
}

export interface RetrieveEvidenceResult {
  /** The response to use as evidence (from cache or a fresh transport call). */
  response: WebSearchResponse
  /** True when served from the session evidence cache. */
  fromCache: boolean
  /** The canonical session cache key used (for logging). */
  key: string
}

/**
 * Cache-first retrieval. Checks the session evidence cache; on a hit it
 * returns the cached response immediately (no transport call, no Tavily). On
 * a miss it falls back to the transport, stores the validated response for
 * reuse and reports which provider actually served it.
 */
export async function retrieveEvidence(options: RetrieveEvidenceOptions): Promise<RetrieveEvidenceResult> {
  const key = searchSessionCacheKey(options.query, options.tool)

  const cached = options.cache?.get(key)
  if (cached) {
    options.onEvent?.({ type: 'hit', key })
    return { response: { ...cached, cached: true }, fromCache: true, key }
  }

  options.onEvent?.({ type: 'miss', key })
  const response = await options.transport.search(options.query)
  options.onEvent?.({ type: 'fetch', key, provider: response.provider })
  options.cache?.set(key, response)
  return { response, fromCache: false, key }
}