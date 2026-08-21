// ---------------------------------------------------------------------------
// Phase 3B — Analyst API gateway: wire contract
//
// The explicit, versioned contract between the browser boundary provider
// (createApiBoundaryProvider) and the server-side gateway (src/analyst/server).
//
// Security rules that this contract enforces:
//   - The request carries ONLY what the server needs to call the LLM.
//   - The request NEVER carries API keys, provider secrets or server config.
//   - The response carries ONLY the LLM result; provider errors arrive as
//     sanitized { code, message } objects — never keys, headers or traces.
//
// This file is CLIENT-SAFE: it is plain JSON-shaped types with no secrets.
// ---------------------------------------------------------------------------

import type { LLMMessage, LLMToolCall, LLMResult } from '../agent/types'
import type { ToolDefinition } from '../tools/types'
import type { WebSearchQuery, WebSearchResponse, SearchGatewayError, SearchGatewayErrorCode } from '../websearch/types'

/** The single gateway route served by the Analyst API. */
export const ANALYST_GATEWAY_PATH = '/api/analyze'

/** Phase 3C.1 — web search gateway route (same origin, same protections). */
export const SEARCH_GATEWAY_PATH = '/api/search'
/** Optional free official market-data route (EIA daily petroleum data). */
export const MARKET_DATA_PATH = '/api/market-data'

export interface AnalystGatewayRequest {
  /** The agent system prompt (universe, rules, output schema). */
  system: string
  /** Conversation + tool-result messages so far. */
  messages: LLMMessage[]
  /** The Finova tool catalog offered to the model. */
  tools?: ToolDefinition[]
  temperature?: number
  maxTokens?: number
  /** Optional client-supplied correlation id (echoed nowhere). */
  requestId?: string
}

export type AnalystGatewayErrorCode =
  | 'invalid-request'
  | 'request-too-large'
  | 'provider-not-configured'
  | 'provider-error'
  | 'rate-limit'
  | 'timeout'
  | 'internal'

/** Sanitized error — the ONLY error shape a client may ever see. */
export interface AnalystGatewayError {
  code: AnalystGatewayErrorCode
  message: string
}

export interface AnalystGatewaySuccess {
  content: string
  toolCalls: LLMToolCall[]
  stopReason?: LLMResult['stopReason']
}

export type AnalystGatewayResponseBody = AnalystGatewaySuccess | { error: AnalystGatewayError }

// --- Phase 3C.1 — web search wire contract ----------------------------------

/**
 * The search request the browser sends to /api/search. Carries ONLY the
 * validated query — never API keys, provider secrets or server config.
 * Same honesty contract as the tool: the gateway either returns real,
 * normalized results or a sanitized error.
 */
export type SearchGatewayRequest = WebSearchQuery

export type SearchGatewayResponseBody = WebSearchResponse | { error: SearchGatewayError }

export type { SearchGatewayError, SearchGatewayErrorCode }