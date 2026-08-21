// ---------------------------------------------------------------------------
// Phase 3C.1 — Web search gateway: server-side environment
//
// SERVER-ONLY. Reads the web-search provider credentials that the browser
// must never see. Never import this module from the client graph — the
// security tests verify unreachability.
//
// Independent from the LLM gateway env: web search can be configured (or not)
// with or without an LLM key. All FINOVA_WEB_SEARCH_* variables are
// server-only by construction (Vite's envPrefix exposes only
// FINOVA_ANALYST_API_URL).
// ---------------------------------------------------------------------------

import { WEBSEARCH_LIMITS } from '../limits'
import { CURATED_RSS_FEEDS } from '../providers/rss'

export const SUPPORTED_SEARCH_PROVIDERS = ['tavily', 'brave', 'rss'] as const
export type SupportedSearchProvider = (typeof SUPPORTED_SEARCH_PROVIDERS)[number]

export interface SearchEnv {
  /** Provider seam id: 'tavily', 'brave' or 'rss'. */
  provider: SupportedSearchProvider
  /** Provider API key — exists ONLY here, server-side. */
  apiKey: string
  /** Upstream provider call timeout in ms (approved: 15s default). */
  timeoutMs: number
  /** Optional override of the provider's default endpoint (self-hosted). */
  baseUrl?: string
  /** Response cache TTL in ms (approved: 300s default). */
  cacheTtlMs: number
  /** Response cache capacity (approved: 100 entries default). */
  cacheMaxEntries: number
}

const DEFAULTS = {
  provider: 'tavily' as const,
  timeoutMs: WEBSEARCH_LIMITS.providerTimeoutMs,
  cacheTtlMs: WEBSEARCH_LIMITS.cacheTtlMs,
  cacheMaxEntries: WEBSEARCH_LIMITS.cacheMaxEntries,
}

function parsePositiveInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw === null) return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * Resolve and validate the server-side web-search configuration.
 * Returns null when web search is NOT configured (no API key, or an
 * unsupported provider) — /api/search then answers 503 provider-not-configured
 * and the searchWeb tool reports unavailable honestly.
 */
export function resolveSearchEnv(env: Record<string, string | undefined>): SearchEnv | null {
  const provider = (env.FINOVA_WEB_SEARCH_PROVIDER ?? DEFAULTS.provider).trim().toLowerCase()
  if (!SUPPORTED_SEARCH_PROVIDERS.includes(provider as SupportedSearchProvider)) return null

  const apiKey = (env.FINOVA_WEB_SEARCH_API_KEY ?? '').trim()
  let baseUrl = (env.FINOVA_WEB_SEARCH_BASE_URL ?? '').trim()
  // provider=rss is key-less and free: with no explicit feed list it falls
  // back to the curated public RSS/Atom endpoints, so it works at zero cost
  // with only FINOVA_WEB_SEARCH_PROVIDER=rss configured.
  if (provider === 'rss' && !baseUrl) baseUrl = CURATED_RSS_FEEDS.join(',')
  if (provider !== 'rss' && !apiKey) return null
  return {
    provider: provider as SupportedSearchProvider,
    apiKey,
    timeoutMs: parsePositiveInt(env.FINOVA_WEB_SEARCH_TIMEOUT_MS, DEFAULTS.timeoutMs, 1_000, 60_000),
    ...(baseUrl.length > 0 ? { baseUrl } : {}),
    cacheTtlMs: parsePositiveInt(env.FINOVA_WEB_SEARCH_CACHE_TTL_MS, DEFAULTS.cacheTtlMs, 1_000, 3_600_000),
    cacheMaxEntries: parsePositiveInt(env.FINOVA_WEB_SEARCH_CACHE_MAX, DEFAULTS.cacheMaxEntries, 1, 1_000),
  }
}