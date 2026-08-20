// ---------------------------------------------------------------------------
// Phase 3A — Agent layer: dev-safe logging
//
// Logs structured agent events (request started, reasoning round, tool
// selected/completed/failed, provider response, final response, errors) so a
// developer can trace a session. NEVER logs API keys, tokens or credentials —
// this module does not accept them, by construction.
//
// Enabled only when FINOVA_AGENT_DEBUG=1 (node) or VITE_FINOVA_AGENT_DEBUG=1
// (browser). Production logs stay quiet by default.
// ---------------------------------------------------------------------------

export type AgentLogEvent =
  | { kind: 'request-started'; text: string }
  | { kind: 'reasoning-round'; round: number; provider: string }
  | { kind: 'tool-selected'; tool: string }
  | { kind: 'tool-completed'; tool: string; ok: boolean }
  | { kind: 'tool-failed'; tool: string; message: string }
  | { kind: 'provider-response'; provider: string; toolCalls: number }
  | { kind: 'final-response'; title: string }
  | { kind: 'limit-reached'; limit: string }
  | { kind: 'error'; message: string }
  // Phase 3B — server-side gateway events. Same dev-only rules: NEVER logs
  // API keys, Authorization headers, raw secrets or sensitive user data.
  | { kind: 'gateway-provider-call'; provider: string }
  | { kind: 'gateway-response'; provider: string; toolCalls: number; latencyMs: number }
  | { kind: 'gateway-error'; category: string; message: string }
  // Phase 3C.1 — web search gateway events (search providers only, no keys).
  | { kind: 'search-response'; provider: string; cached?: boolean; results?: number; dropped?: number; deduplicated?: number; truncated?: boolean }
  // Retrieval-cost optimization — session-level evidence events (dev only).
  | { kind: 'retrieval-cache'; tool: string; hit: boolean; key: string }
  | { kind: 'retrieval-fetch'; tool: string; key: string; provider: string }
  | { kind: 'search-session-summary'; webSearches: number; newsSearches: number; webCacheHits: number; newsCacheHits: number }
  // Phase 3D.1 — conversation & context events (session memory only).
  | { kind: 'conversation-context-built'; chars: number; entities: number }
  | { kind: 'conversation-updated'; turn: number }
  | { kind: 'conversation-reset' }
  // Phase 3D — structured understanding of the turn (debug observability:
  // input -> subject -> asset class -> intent -> scope; never chain-of-thought).
  | {
      kind: 'understanding'
      text: string
      subject: string | null
      assetClass: string | null
      intent: string
      scope: string
      newsHint: string | null
      // Phase 3O — how the turn continues the thread (progressive disclosure).
      followUp?: string
      continuation?: boolean
      premise?: string | null
      // Phase 3N.3 — whether this turn must investigate catalysts before answering.
      catalystRelevant?: boolean
    }
  // Phase 3N.3 — research trace (dev only; headline titles, never bodies or
  // keys): the generated web/news query actually sent, and the normalized
  // evidence that came back, so a runtime trace can show why a driver
  // question did or did not reach catalyst synthesis.
  | { kind: 'research-query'; tool: 'searchNews' | 'searchWeb'; subject?: string; query: string }
  | { kind: 'research-results'; tool: 'searchNews' | 'searchWeb'; items: number; truncated?: boolean; headlines: string[] }
  | {
      kind: 'synthesis'
      catalystRelevant: boolean
      evidenceTools: string[]
      headlineCount: number
      driverSummary: boolean
    }
  | { kind: 'subject-fallback'; subject: string; branch: string }
  // Phase 3N.3 — engine-level research fallback (LLM down, research still
  // runs): which driver question triggered it and what evidence it gathered.
  | { kind: 'research-fallback'; subject: string; evidenceTools: string[]; headlineCount: number; branched: boolean }
  // Phase 3O — deterministic quality-gate findings on a final response
  // (observability only; issue ids only, never response content).
  | { kind: 'quality-gate'; issues: string }

function isDebugEnabled(): boolean {
  try {
    const node = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    if (node?.env?.FINOVA_AGENT_DEBUG === '1') return true
    // Direct import.meta.env access — required for Vite's static replacement.
    const meta = import.meta.env as Record<string, string | undefined> | undefined
    return meta?.VITE_FINOVA_AGENT_DEBUG === '1'
  } catch {
    return false
  }
}

const DEBUG = isDebugEnabled()

export function logAgent(event: AgentLogEvent): void {
  if (!DEBUG) return
  // eslint-disable-next-line no-console
  console.debug(`[finova-agent] ${event.kind}`, omitKind(event))
}

function omitKind(event: AgentLogEvent): Record<string, unknown> {
  const { kind: _kind, ...rest } = event
  return rest
}