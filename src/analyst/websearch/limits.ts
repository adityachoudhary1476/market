// ---------------------------------------------------------------------------
// Phase 3C.1 — Web search evidence layer: approved limits + validation
//
// CLIENT-SAFE, pure. Every approved Phase 3C.1 limit lives here once and is
// enforced on BOTH sides:
//   - server: the /api/search gateway validates the request body
//   - client: the searchWeb tool validates the model's arguments
//
// Approved limits (authoritative):
//   query <=400 chars · maxResults <=8 · recencyDays <=3650 · max 1 domain
//   filter · snippet <=500 chars · <=12,000 evidence chars per search
//   <=4 web searches per session · client timeout 30s · provider timeout 15s
//   one transient retry · cache TTL 300s · cache max 100 entries
// ---------------------------------------------------------------------------

import type { SearchProviderId, WebSearchQuery, WebSearchResult } from './types'

export const WEBSEARCH_LIMITS = {
  /** Max query length (approved). */
  maxQueryChars: 400,
  minQueryChars: 1,
  /** Max results returned per search (approved). */
  maxResults: 8,
  minResults: 1,
  defaultResults: 5,
  /** Max recency window in days (approved). */
  maxRecencyDays: 3_650,
  minRecencyDays: 1,
  /** Max domain filters per search (approved). */
  maxDomainFilters: 1,
  maxDomainFilterChars: 128,
  /** Snippet cap (approved). */
  maxSnippetChars: 500,
  /** Title cap (bounded field). */
  maxTitleChars: 200,
  /** URL cap (bounded field). */
  maxUrlChars: 2_048,
  /** Total evidence chars per search (approved). */
  maxEvidenceChars: 12_000,
  /** Web searches per agent session (approved). */
  maxSearchesPerSession: 4,
  /** Client-side transport timeout (approved). */
  clientTimeoutMs: 30_000,
  /** Server-side provider timeout (approved). */
  providerTimeoutMs: 15_000,
  /** Server cache TTL (approved). */
  cacheTtlMs: 300_000,
  /** Server cache capacity (approved). */
  cacheMaxEntries: 100,
} as const

export type WebSearchQueryValidation =
  | { ok: true; query: WebSearchQuery }
  | { ok: false; error: string }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function fail(error: string): WebSearchQueryValidation {
  return { ok: false, error }
}

/**
 * Validate + normalize an untrusted search request (from the LLM via the
 * searchWeb tool, or from the browser via /api/search). Pure and strict:
 * every field is type-checked and bounded; out-of-range values are rejected,
 * never silently clamped (the LLM must learn the real limits).
 */
export function validateWebSearchQuery(input: unknown): WebSearchQueryValidation {
  if (!isRecord(input)) return fail('Search request must be an object.')

  const query = typeof input.query === 'string' ? input.query.trim() : ''
  if (query.length < WEBSEARCH_LIMITS.minQueryChars) {
    return fail('"query" is required and must be a non-empty string.')
  }
  if (query.length > WEBSEARCH_LIMITS.maxQueryChars) {
    return fail(`"query" exceeds the ${WEBSEARCH_LIMITS.maxQueryChars}-character limit.`)
  }

  let maxResults: number = WEBSEARCH_LIMITS.defaultResults
  if (input.maxResults !== undefined && input.maxResults !== null) {
    if (typeof input.maxResults !== 'number' || !Number.isInteger(input.maxResults)) {
      return fail('"maxResults" must be an integer.')
    }
    if (input.maxResults < WEBSEARCH_LIMITS.minResults || input.maxResults > WEBSEARCH_LIMITS.maxResults) {
      return fail(`"maxResults" must be between ${WEBSEARCH_LIMITS.minResults} and ${WEBSEARCH_LIMITS.maxResults}.`)
    }
    maxResults = input.maxResults
  }

  let recencyDays: number | undefined
  if (input.recencyDays !== undefined && input.recencyDays !== null) {
    if (typeof input.recencyDays !== 'number' || !Number.isInteger(input.recencyDays)) {
      return fail('"recencyDays" must be an integer.')
    }
    if (input.recencyDays < WEBSEARCH_LIMITS.minRecencyDays || input.recencyDays > WEBSEARCH_LIMITS.maxRecencyDays) {
      return fail(`"recencyDays" must be between ${WEBSEARCH_LIMITS.minRecencyDays} and ${WEBSEARCH_LIMITS.maxRecencyDays}.`)
    }
    recencyDays = input.recencyDays
  }

  let domainFilter: string | undefined
  if (input.domainFilter !== undefined && input.domainFilter !== null) {
    if (typeof input.domainFilter !== 'string') return fail('"domainFilter" must be a string.')
    domainFilter = input.domainFilter.trim()
    if (domainFilter.length === 0 || domainFilter.length > WEBSEARCH_LIMITS.maxDomainFilterChars) {
      return fail(`"domainFilter" must be between 1 and ${WEBSEARCH_LIMITS.maxDomainFilterChars} characters.`)
    }
    if (/[\s/\\:]/.test(domainFilter)) {
      return fail('"domainFilter" must be a bare domain (no scheme, path, port or whitespace).')
    }
  }

  return {
    ok: true,
    query: {
      query,
      maxResults,
      ...(recencyDays !== undefined ? { recencyDays } : {}),
      ...(domainFilter !== undefined ? { domainFilter } : {}),
    },
  }
}

/** Defensive client check that a result is well-formed evidence. */
export function isValidWebSearchResult(v: unknown): v is WebSearchResult {
  if (!isRecord(v)) return false
  if (typeof v.title !== 'string' || v.title.length === 0 || v.title.length > WEBSEARCH_LIMITS.maxTitleChars) return false
  if (typeof v.url !== 'string' || v.url.length === 0 || v.url.length > WEBSEARCH_LIMITS.maxUrlChars) return false
  try {
    const parsed = new URL(v.url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    if (!parsed.hostname) return false
  } catch {
    return false
  }
  if (typeof v.snippet !== 'string' || v.snippet.length > WEBSEARCH_LIMITS.maxSnippetChars) return false
  if (typeof v.source !== 'string' || v.source.length === 0 || v.source.length > 128) return false
  if (v.publishedAt !== null && typeof v.publishedAt !== 'string') return false
  if (typeof v.publishedAt === 'string' && !Number.isFinite(Date.parse(v.publishedAt))) return false
  if (v.provider !== 'tavily' && v.provider !== 'brave') return false
  return true
}

/**
 * Normalized query text for cache/dedup keys: case-insensitive and
 * whitespace-insensitive, so equivalent phrasings of the same search collapse
 * to ONE key ("NIFTY news" === "nifty news"). Pure and deterministic.
 */
export function normalizeQueryKey(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Stable cache key for one search (normalized query + options + provider). */
export function searchCacheKey(query: WebSearchQuery, provider: SearchProviderId): string {
  return `${provider}|${normalizeQueryKey(query.query)}|${query.maxResults ?? WEBSEARCH_LIMITS.defaultResults}|${query.recencyDays ?? ''}|${query.domainFilter ?? ''}`
}