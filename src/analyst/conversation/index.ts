// ---------------------------------------------------------------------------
// Phase 3D.1 — Conversation & Context Intelligence (public barrel)
//
// Session-only conversation memory + reference/temporal/comparison resolution
// + bounded context payloads for the LLM. No server imports, no secrets, no
// network: everything here is safe for the browser bundle.
// ---------------------------------------------------------------------------

export {
  DEFAULT_CONVERSATION_CONFIG,
  type Clock,
  type ComparisonMemory,
  type ConversationConfig,
  type ConversationEntity,
  type ConversationSession,
  type ConversationState,
  type ConversationSummary,
  type ConversationUpdateInput,
  type ContextInterpretation,
  type CorrectionMemory,
  type FindingMemory,
  type Freshness,
  type FreshnessPolicy,
  type LastResponseMetadata,
  type ReferenceConfidence,
  type ReferenceResolution,
  type SourceMemory,
  type TemporalContext,
  type ToolEvidenceMemory,
  type TurnResolution,
  type UserTurnMemory,
  type CorrectionDetect,
} from './types'
export {
  classifyFreshness,
  confidenceScore,
  createConversationState,
  prependBounded,
  pushBounded,
  recordCorrections,
  recordTurn,
  resetConversationState,
  touchEntity,
} from './state'
export { createConversationSession } from './session'
export { extractExplicitEntities, mergeEntityMemory, resolveEntityId, entityDisplayNames } from './entities'
export { detectCorrections, resolveReferences, extractComparisonDimensions } from './references'
export { detectTemporalReference } from './temporal'
export { summarizeFindings, summarizeResponse, summarizeSources, summarizeToolEvidence, truncateText } from './summarization'
export { buildContextPayload, suggestFollowUps } from './contextBuilder'
export { resolveTurn } from './resolution'