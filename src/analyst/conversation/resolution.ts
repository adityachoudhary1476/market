// ---------------------------------------------------------------------------
// Phase 3D.1 — Conversation & Context Intelligence: turn resolution
//
// `resolveTurn` is the pure entry point for one user message: it extracts
// explicit entities, detects corrections, resolves anaphoric references and
// temporal language against the session state, tracks comparisons, and
// renders the bounded LLM payload. It NEVER mutates state — the session's
// `update` records the turn afterwards.
// ---------------------------------------------------------------------------

import type { ConversationConfig, ConversationEntity, ContextInterpretation, ConversationState, ReferenceResolution, TurnResolution } from './types'
import { extractExplicitEntities } from './entities'
import { detectCorrections, extractComparisonDimensions, resolveReferences } from './references'
import { detectTemporalReference } from './temporal'
import { buildContextPayload } from './contextBuilder'
import { confidenceScore } from './state'

const COMPARE_PATTERNS = /\b(compare|comparison|versus|vs\.?|between)\b/i

export interface ResolveTurnOptions {
  now: number
  config: ConversationConfig
}

/**
 * Resolve ONE user turn against the session state. Pure — the returned
 * TurnResolution is deterministic given (text, state, now, config).
 */
export function resolveTurn(text: string, state: ConversationState, options: ResolveTurnOptions): TurnResolution {
  const { now, config } = options

  const corrections = detectCorrections(text, state)
  const explicit = extractExplicitEntities(text)
  const references = resolveReferences(text, state)

  // Corrections influence the entity order: the corrected instrument becomes
  // the primary focus.
  const correction = corrections[0]
  const correctedEntity = correction?.corrected
    ? explicit.find((e) => e.id === correction.corrected)
    : undefined

  const orderedEntities = orderEntities(explicit, correctedEntity, references, state)
  if (correction?.corrected && !orderedEntities.some((e) => e.id === correction.corrected)) {
    const probe = explicit.find((e) => e.id === correction.corrected)
    if (probe) orderedEntities.push(probe)
  }

  const temporal = detectTemporalReference(text, now)
  const comparison = detectComparison(text, explicit, references, state)

  const interpretations: ReferenceResolution[] = [...references]
  if (correction?.corrected) {
    interpretations.push({
      raw: 'correction',
      entityId: correction.corrected,
      confidence: 'high',
      reason: `user corrected the focus${correction.previous ? ` from ${correction.previous} to ${correction.corrected}` : ''}`,
      kind: 'entity',
    })
  }

  const needsClarification = interpretations.some(
    (r) => r.confidence === 'unresolved' || confidenceScore(r.confidence) < config.referenceConfidenceThreshold,
  )

  const interpretation: ContextInterpretation = {
    entities: orderedEntities,
    references: interpretations,
    temporal,
    comparison,
    needsClarification,
  }

  return {
    text,
    interpretation,
    corrections,
    payload: buildContextPayload(state, interpretation, config),
  }
}

function orderEntities(
  explicit: ConversationEntity[],
  corrected: ConversationEntity | undefined,
  references: ReferenceResolution[],
  state: ConversationState,
): ConversationEntity[] {
  const seen = new Set<string>()
  const ordered: ConversationEntity[] = []

  const push = (id: string, fallback?: ConversationEntity) => {
    if (seen.has(id)) return
    seen.add(id)
    const entity = explicit.find((e) => e.id === id) ?? fallback
    if (entity) ordered.push(entity)
  }

  if (corrected) push(corrected.id, corrected)

  for (const e of explicit) push(e.id, e)

  const known = new Map<string, ConversationEntity>()
  for (const e of [...state.activeEntities, ...state.recentEntities]) known.set(e.id, e)

  for (const r of references) {
    if (r.entityId) {
      const entity = explicit.find((e) => e.id === r.entityId) ?? known.get(r.entityId)
      if (entity) push(entity.id, entity)
    }
  }

  return ordered.slice(0, 4)
}

function detectComparison(
  text: string,
  explicit: ConversationEntity[],
  references: ReferenceResolution[],
  state: ConversationState,
): ContextInterpretation['comparison'] {
  const compareIntent = COMPARE_PATTERNS.test(text)
  const ids = explicit.map((e) => e.id)

  if (compareIntent && ids.length >= 2) {
    return {
      entities: ids.slice(0, 2),
      dimensions: extractComparisonDimensions(text),
      sourceTurn: 0,
    }
  }

  // No explicit pair — but the turn may CONTINUE an active comparison.
  if (!compareIntent && references.some((r) => r.kind === 'comparison' && r.confidence !== 'unresolved')) {
    return state.activeComparison ? { ...state.activeComparison } : null
  }

  return null
}