// ---------------------------------------------------------------------------
// Phase 3D.1 — Conversation & Context Intelligence: bounded state
//
// Session-only, bounded, deterministic conversation memory. Every list has a
// hard cap (ConversationConfig) — the state can never grow without bound.
// All timestamps come from explicit `now` parameters, never Date.now().
// ---------------------------------------------------------------------------

import type {
  ConversationConfig,
  ConversationEntity,
  ConversationState,
  ConversationUpdateInput,
  CorrectionDetect,
  CorrectionMemory,
  Freshness,
  FreshnessPolicy,
  ReferenceConfidence,
  TurnResolution,
} from './types'
import { summarizeFindings, summarizeNews, summarizeResponse, summarizeSources, summarizeToolEvidence } from './summarization'
import { captureAnalyticalThread } from './thread'

// --- State lifecycle -------------------------------------------------------

export function createConversationState(now: number): ConversationState {
  return {
    conversationId: `conv-${now.toString(36)}`,
    turnCount: 0,
    activeTopic: null,
    activeEntities: [],
    recentEntities: [],
    activeComparison: null,
    activeQuestion: null,
    recentUserMessages: [],
    recentAssistantSummaries: [],
    recentToolEvidence: [],
    recentFindings: [],
    unresolvedReferences: [],
    temporalContext: null,
    lastResponseMetadata: null,
    analyticalThread: null,
    lastSources: [],
    recentNews: [],
    corrections: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** Clear all session memory — the fresh-session behaviour of "New analysis". */
export function resetConversationState(state: ConversationState, now: number): void {
  Object.assign(state, createConversationState(now))
}

// --- Bounded list helpers --------------------------------------------------

/** Push to a capped list, dropping the OLDEST entries beyond the cap. */
export function pushBounded<T>(list: T[], item: T, max: number): T[] {
  const next = [...list, item]
  return next.length > max ? next.slice(next.length - max) : next
}

/** Prepend to a capped list, dropping entries beyond the cap. */
export function prependBounded<T>(list: T[], item: T, max: number): T[] {
  const next = [item, ...list]
  return next.length > max ? next.slice(0, max) : next
}

// --- Freshness -------------------------------------------------------------

/**
 * Operational freshness classification used for memory display and the LLM
 * context. Thresholds derive from the configurable policy (README documents
 * the defaults). `unknown` is used when no retrieval time is available.
 */
export function classifyFreshness(retrievedAt: number, now: number, policy: FreshnessPolicy, kind: 'market' | 'evidence' | 'summary'): Freshness {
  if (!Number.isFinite(retrievedAt) || !Number.isFinite(now)) return 'unknown'
  if (now < retrievedAt) return 'fresh'
  const ttl = kind === 'market' ? policy.marketDataTtlMs : kind === 'evidence' ? policy.evidenceTtlMs : policy.summaryTtlMs
  const age = now - retrievedAt
  if (age <= ttl) return 'fresh'
  if (age <= ttl * 6) return 'recent'
  if (age <= ttl * 24) return 'stale'
  return 'expired'
}

export function confidenceScore(confidence: ReferenceConfidence): number {
  switch (confidence) {
    case 'high':
      return 0.9
    case 'medium':
      return 0.6
    case 'low':
      return 0.3
    case 'unresolved':
      return 0
  }
}

/** Keep a ConversationEntity snapshot with a fresh retrieval time. */
export function touchEntity(entity: ConversationEntity, now: number, policy: FreshnessPolicy, role: 'primary' | 'context'): ConversationEntity {
  return {
    ...entity,
    role,
    retrievedAt: now,
    freshness: classifyFreshness(now, now, policy, 'market'),
  }
}

// --- Corrections -----------------------------------------------------------

export function recordCorrections(
  state: ConversationState,
  config: ConversationConfig,
  corrections: CorrectionDetect[],
  turn: number,
): void {
  if (corrections.length === 0) return
  const memory: CorrectionMemory = {
    turn,
    raw: corrections[0].raw,
    ...(corrections[0].previous ? { previous: corrections[0].previous } : {}),
    ...(corrections[0].corrected ? { corrected: corrections[0].corrected } : {}),
  }
  state.corrections = pushBounded(state.corrections, memory, config.maxCorrections)
}

// --- Turn recording --------------------------------------------------------

/** Record a completed turn into the state (mutates). Bounded by config. */
export function recordTurn(
  state: ConversationState,
  config: ConversationConfig,
  resolution: TurnResolution,
  input: ConversationUpdateInput,
): void {
  const turn = state.turnCount + 1
  state.turnCount = turn
  state.updatedAt = input.now
  state.activeQuestion = resolution.text
  const primary = resolution.interpretation.entities[0]
  if (primary) state.activeTopic = primary.id

  state.unresolvedReferences = resolution.interpretation.references.filter(
    (r) => confidenceScore(r.confidence) < config.referenceConfidenceThreshold,
  )

  if (resolution.interpretation.temporal) {
    state.temporalContext = { ...resolution.interpretation.temporal, turn }
  }

  if (resolution.interpretation.comparison) {
    state.activeComparison = { ...resolution.interpretation.comparison, sourceTurn: turn }
  }

  state.recentUserMessages = pushBounded(
    state.recentUserMessages,
    { turn, text: resolution.text },
    config.maxConversationTurns,
  )

  const metadata = input.response
  state.lastResponseMetadata = {
    turn,
    intent: metadata.intent,
    title: metadata.title,
    ...(metadata.confidence ? { confidence: metadata.confidence } : {}),
    partial: metadata.partial === true,
    generatedAt: metadata.generatedAt,
  }

  if (metadata.summary || metadata.title) {
    state.recentAssistantSummaries = pushBounded(
      state.recentAssistantSummaries,
      summarizeResponse(metadata, turn, input.now, config),
      config.maxConversationTurns,
    )
  }

  state.recentFindings = mergeCapped(
    state.recentFindings,
    summarizeFindings(metadata, turn, input.now, config),
    config.maxConversationFindings,
  )

  state.recentToolEvidence = mergeCapped(
    state.recentToolEvidence,
    input.evidence.slice(-config.maxConversationFindings).map((e) => summarizeToolEvidence(e, turn, input.now, config)),
    config.maxConversationFindings,
  )

  if (input.sources.length > 0) {
    state.lastSources = summarizeSources(input.sources, turn, input.now, config)
  }

  // Phase 3N.1 — remember this turn's live-news stories (deduped by URL,
  // bounded by config). Kept separate from lastSources so the context can
  // distinguish news we fetched from any web source we merely cited.
  if ((input.news ?? []).length > 0) {
    state.recentNews = mergeNewsMemory(state.recentNews, summarizeNews(input.news ?? [], turn, input.now, config), config.maxConversationNews)
  }

  // Phase 3O — capture the live analytical thread from this completed turn.
  // Replaces the previous thread: it always reflects the latest completed
  // turn and is bounded by construction.
  state.analyticalThread = captureAnalyticalThread(state, input, turn, resolution.interpretation.entities[0])
}

// --- Internal helpers ------------------------------------------------------

function mergeCapped<T>(list: T[], additions: T[], max: number): T[] {
  if (additions.length === 0) return list
  const merged = [...list, ...additions]
  return merged.length > max ? merged.slice(merged.length - max) : merged
}

/**
 * Merge new news memories into the existing list, deduping by URL so the same
 * story surfaced in a later turn does not duplicate (freshness/recency wins).
 */
function mergeNewsMemory<T extends { url: string }>(list: T[], additions: T[], max: number): T[] {
  if (additions.length === 0) return list
  const seen = new Set(list.map((m) => m.url))
  const merged = [...list, ...additions.filter((m) => !seen.has(m.url))]
  return merged.length > max ? merged.slice(merged.length - max) : merged
}