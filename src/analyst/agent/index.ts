// ---------------------------------------------------------------------------
// Phase 3A — Agent layer (public barrel)
//
// Exposes the reasoning engine, provider abstraction and validation primitives
// without leaking vendor SDKs or server-only code into browser bundles.
//
// NOTE: createOpenAICompatibleProvider is intentionally NOT re-exported here —
// it may hold an API key and must only be used server-side. Server consumers
// import it directly from './openaiCompatible'.
// ---------------------------------------------------------------------------

export type {
  LLMProvider,
  LLMRequest,
  LLMResult,
  LLMMessage,
  LLMToolCall,
  ProviderError,
  ProviderErrorKind,
  AgentConfig,
  AgentSessionInput,
  AgentSessionOutput,
  AgentTraceStep,
} from './types'
export { DEFAULT_AGENT_CONFIG, ProviderError as ProviderErrorClass } from './types'
export { buildSystemPrompt } from './systemPrompt'
export { buildProviderTools, buildToolCatalog } from './toolCatalog'
export {
  findEntityMentions,
  resolveEntity,
  describeUniverse,
  type ResolvedEntity,
  type EntityMention,
} from './entityResolution'
export { validateStructuredResponse, type ValidationResult } from './responseValidator'
export { synthesizeResponse, type SynthesisInput } from './synthesis'
export { createMockProvider, createRuleMockProvider, toolCall, type MockStep, type MockRule } from './mockProvider'
export { runAgentSession, type OrchestratorDeps, type SearchSessionDeps } from './orchestrator'
export { createConversationAwareFallback, type ConversationAwareFallbackOptions } from './conversationFallback'
// Phase 3D — canonical financial subjects & the structured understanding stage.
export { SUBJECTS, findFinancialSubjects, findSubjectById, type FinancialSubject, type FinancialSubjectMatch, type AssetClass, type SubjectCoverage } from './subjects'
export { understandTurn, estimateDepth, type Understanding, type UnderstandingIntent, type UnderstandingTimeframe, type UnderstandingScope, type UnderstandingDepth } from './understanding'
export { createSubjectAwareFallback, type SubjectAwareFallbackOptions } from './subjectFallback'
export { resolveAppProvider, type ProviderResolution } from './apiBoundary'
export { createAgentAnalystEngine, agentAnalystEngine, resetAgentConversation, suggestConversationFollowUps, type AgentEngineOptions } from './agentEngine'
// Phase 3D.1 — conversation & context intelligence (session-only memory).
export {
  DEFAULT_CONVERSATION_CONFIG,
  type ConversationConfig,
  type ConversationSession,
  type ConversationState,
  type TurnResolution,
  type ConversationUpdateInput,
  type ContextInterpretation,
  type ReferenceResolution,
  type TemporalContext,
  type ComparisonMemory,
  type ConversationEntity,
  type Freshness,
  type CorrectionMemory,
  type CorrectionDetect,
} from '../conversation'
export { createConversationSession } from '../conversation/session'
export { buildContextPayload, suggestFollowUps } from '../conversation/contextBuilder'
export { resolveTurn } from '../conversation/resolution'