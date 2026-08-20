// ---------------------------------------------------------------------------
// Phase 3B — Analyst API gateway (server barrel)
//
// SERVER-ONLY exports. This module is never imported by the browser graph —
// the security tests verify that. Browser code communicates with the gateway
// exclusively through createApiBoundaryProvider (src/analyst/agent/
// openaiCompatible.ts) over HTTP.
// ---------------------------------------------------------------------------

export { resolveServerEnv, SUPPORTED_LLM_PROVIDERS, type ServerEnv } from './env'
export { handleAnalystRequest, type GatewayDeps, type GatewayResult } from './gateway'
export { routeRequest, type HttpGatewayDeps } from './http'
export { GATEWAY_LIMITS, validateGatewayRequest, validateGatewayResponse } from './limits'
export { createRateLimiter, type RateLimiterOptions, type RateLimitDecision } from './rateLimit'
export { ANALYST_GATEWAY_PATH, SEARCH_GATEWAY_PATH, type AnalystGatewayRequest, type AnalystGatewayResponseBody, type AnalystGatewayError, type AnalystGatewayErrorCode, type SearchGatewayRequest, type SearchGatewayResponseBody, type SearchGatewayError, type SearchGatewayErrorCode } from '../api/contract'

// Phase 3C.1 — server-side web search gateway
export { resolveSearchEnv, SUPPORTED_SEARCH_PROVIDERS, type SearchEnv, type SupportedSearchProvider } from '../websearch/server/env'
export { handleSearchRequest, type SearchGatewayDeps, type SearchGatewayResult } from '../websearch/server/searchGateway'
export { createSearchCache, type SearchCache, type SearchCacheOptions } from '../websearch/cache'
export { createWebSearchProvider, isSupportedSearchProvider, type WebSearchProviderConfig } from '../websearch/providers'
export { SearchProviderError, type SearchProviderErrorKind } from '../websearch/providers/errors'
export { WEBSEARCH_LIMITS, validateWebSearchQuery, isValidWebSearchResult, searchCacheKey } from '../websearch/limits'