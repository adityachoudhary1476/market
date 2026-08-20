// ---------------------------------------------------------------------------
// Phase 3C.1 — Provider adapters: factory
//
// SERVER-ONLY. Builds the provider-agnostic WebSearchProvider behind the
// /api/search gateway from server-side configuration. The gateway never talks
// to a vendor directly — the seam keeps Tavily/Brave swappable (locked
// decision 1).
// ---------------------------------------------------------------------------

import type { SearchProviderId, WebSearchProvider } from '../types'
import { createBraveProvider } from './brave'
import { createTavilyProvider } from './tavily'
import type { FetchLike } from './tavily'
import { SUPPORTED_SEARCH_PROVIDERS, type SupportedSearchProvider } from '../server/env'

export interface WebSearchProviderConfig {
  provider: SupportedSearchProvider
  apiKey: string
  timeoutMs?: number
  /** Optional endpoint override (self-hosted provider). */
  baseUrl?: string
  fetchImpl?: FetchLike
}

/** Build the configured provider. The caller guarantees provider/apiKey are valid. */
export function createWebSearchProvider(config: WebSearchProviderConfig): WebSearchProvider {
  if (config.provider === 'tavily') {
    return createTavilyProvider({ apiKey: config.apiKey, timeoutMs: config.timeoutMs, baseUrl: config.baseUrl, fetchImpl: config.fetchImpl })
  }
  return createBraveProvider({ apiKey: config.apiKey, timeoutMs: config.timeoutMs, baseUrl: config.baseUrl, fetchImpl: config.fetchImpl })
}

export function isSupportedSearchProvider(v: unknown): v is SupportedSearchProvider {
  return SUPPORTED_SEARCH_PROVIDERS.includes(v as SearchProviderId)
}

export type { SupportedSearchProvider, SearchProviderId }