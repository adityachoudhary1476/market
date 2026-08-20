// ---------------------------------------------------------------------------
// Phase 3A — Agent layer: AnalystEngine implementation
//
// `createAgentAnalystEngine()` returns the same AnalystEngine interface the UI
// already consumes. It runs the LLM reasoning loop on top of the Phase 2E
// registry and validates the model's output into AnalystResponse.
//
// Deterministic fallback: if the provider is unavailable (after retries), the
// engine falls back to the existing localAnalystEngine so the analyst
// experience never breaks when the AI provider is temporarily down.
// ---------------------------------------------------------------------------

import type { AnalystContext, AnalystInsight, AnalystResponse } from '../types'
import type { AnalystEngine } from '../engine'
import { localAnalystEngine } from '../engine'
import type { LLMProvider } from './types'
import { DEFAULT_AGENT_CONFIG, type AgentConfig } from './types'
import { AnalystToolRegistry, createDefaultAnalystToolRegistry } from '../tools/registry'
import type { ToolContext } from '../tools/types'
import { createDefaultToolContext } from '../tools/context'
import { runAgentSession, type SearchSessionDeps } from './orchestrator'
import { resolveAppProvider } from './apiBoundary'
import { createDefaultWebSearchTransport } from '../websearch/transport'
import { logAgent } from './logger'
import type { ConversationSession } from '../conversation/types'
import { createConversationSession } from '../conversation/session'
import { suggestFollowUps } from '../conversation/contextBuilder'
import { createConversationAwareFallback } from './conversationFallback'
import { createSubjectAwareFallback } from './subjectFallback'
import { createResearchAwareFallback } from './researchFallback'
import { applyOutputHygiene, isProvenanceAsk } from './responseIntelligence'

export interface AgentEngineOptions {
  provider?: LLMProvider
  registry?: AnalystToolRegistry
  toolContext?: ToolContext
  config?: Partial<AgentConfig>
  /** Override the deterministic fallback engine (defaults to localAnalystEngine). */
  fallback?: AnalystEngine
  /**
   * Phase 3C.1 — web search session. Defaults to the app's default transport
   * (derived from the client-safe FINOVA_ANALYST_API_URL); pass null to
   * disable searchWeb for this engine.
   */
  search?: SearchSessionDeps | null
  /**
   * Phase 3D.1 — conversation session (session-only memory). Defaults to a
   * fresh internal session; pass null to disable conversation memory.
   */
  conversation?: ConversationSession | null
}

/** The app's default search session: the browser transport or none at all. */
function defaultSearchDeps(): SearchSessionDeps | undefined {
  const transport = createDefaultWebSearchTransport()
  return transport ? { transport } : undefined
}

/**
 * Phase 3D.1 — sessions by engine, so the UI can reset conversation memory
 * without knowing the internals of the engine it holds.
 */
const engineSessions = new WeakMap<AnalystEngine, ConversationSession>()

/** Reset the conversation memory of an engine (defaults to the singleton). */
export function resetAgentConversation(engine: AnalystEngine = agentAnalystEngine): void {
  engineSessions.get(engine)?.reset()
  logAgent({ kind: 'conversation-reset' })
}

/**
 * Phase 3D.1 — conversation-aware follow-up suggestions for the UI, derived
 * only from the engine's session memory (comparisons, active topic).
 */
export function suggestConversationFollowUps(engine: AnalystEngine = agentAnalystEngine): string[] {
  const session = engineSessions.get(engine)
  return session ? suggestFollowUps(session.state) : []
}

export function createAgentAnalystEngine(options: AgentEngineOptions = {}): AnalystEngine {
  const registry = options.registry ?? createDefaultAnalystToolRegistry()
  const toolContext = options.toolContext ?? createDefaultToolContext()
  const config: AgentConfig = { ...DEFAULT_AGENT_CONFIG, ...(options.config ?? {}) }
  const provider = options.provider ?? resolveAppProvider().provider
  const fallback = options.fallback ?? localAnalystEngine
  const search = options.search === undefined ? defaultSearchDeps() : (options.search ?? undefined)
  const conversation = options.conversation === undefined
    ? createConversationSession(config.conversation)
    : options.conversation
  // Phase 3A — when session memory is wired, wrap the deterministic fallback
  // so follow-up turns resolve against the conversation (active topic, tool
  // evidence) instead of being re-classified as isolated text.
  // Phase 3D — underneath that, the subject-aware wrapper resolves the turn's
  // financial subject first (oil -> Brent, gold -> macro, bitcoin -> no
  // source), so deterministic answers never silently default to NIFTY.
  // Phase 3N.3 — between them, the research-aware wrapper: when web search is
  // configured, driver/catalyst questions are still researched and synthesized
  // even if the LLM failed before gathering any evidence (never a price-only
  // answer, never an invented driver). When research cannot run or yields
  // nothing, it delegates to the subject-aware fallback unchanged.
  const subjectAwareFallback = createSubjectAwareFallback({ base: fallback })
  const researchAwareFallback = search
    ? createResearchAwareFallback({
        registry,
        toolContext,
        search,
        base: subjectAwareFallback,
      })
    : null
  const resolvedFallback = conversation
    ? createConversationAwareFallback({ session: conversation, base: researchAwareFallback ?? subjectAwareFallback })
    : researchAwareFallback ?? subjectAwareFallback

  const engine: AnalystEngine = {
    async generate(input: { text: string; context: AnalystContext; history?: AnalystResponse[] }): Promise<AnalystResponse> {
      try {
        const output = await runAgentSession(
          { text: input.text, context: input.context, history: input.history },
          {
            provider,
            registry,
            toolContext,
            config,
            ...(search ? { search } : {}),
            ...(conversation ? { conversation } : {}),
          },
        )
        // Phase 3N.4 — the final hygiene gate: whatever path produced the
        // response (validated LLM output, deterministic synthesis), no
        // internal marker reaches the UI. Provenance is NOT preserved on the
        // LLM path — the tool-name exemption belongs to the deterministic
        // memory fallback only (applied in the catch branch below).
        return applyOutputHygiene(output.response)
      } catch (thrown) {
        const message = thrown instanceof Error ? thrown.message : 'Agent failed unexpectedly'
        logAgent({ kind: 'error', message })
        // Deterministic fallback — the analyst stays usable when the LLM fails.
        // Phase 3N.3 — driver questions may still be researched through the
        // research-aware layer; whatever evidence IT gathered is recorded in
        // session memory so the next LLM turn has the full context.
        const response = await resolvedFallback.generate(input)
        // Phase 3D.1 — the fallback answer is still part of the conversation:
        // remember the turn so the next LLM turn has the full context.
        if (conversation) {
          const resolution = conversation.resolve(input.text, toolContext.now)
          conversation.update(resolution, {
            response,
            evidence: researchAwareFallback?.lastSession.evidence ?? [],
            sources: researchAwareFallback?.lastSession.sources ?? [],
            now: toolContext.now,
          })
        }
        return applyOutputHygiene(response, { preserveProvenance: isProvenanceAsk(input.text) })
      }
    },

    insights(context: AnalystContext): AnalystInsight[] {
      return resolvedFallback.insights(context)
    },

    suggest(context: AnalystContext): string[] {
      return resolvedFallback.suggest(context)
    },
  }

  if (conversation) engineSessions.set(engine, conversation)
  return engine
}

/** Convenience singleton wired to the app's resolved provider. */
export const agentAnalystEngine: AnalystEngine = createAgentAnalystEngine()