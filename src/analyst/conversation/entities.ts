// ---------------------------------------------------------------------------
// Phase 3D.1 — Conversation & Context Intelligence: entity memory
//
// Entities are canonical instruments from the Phase 3A resolution universe
// (reused, not reinvented). This module maintains the bounded active/recent
// entity memory inside ConversationState and extracts explicit mentions from
// user text. It never invents entities — unknown strings simply don't match.
// ---------------------------------------------------------------------------

import type { ConversationConfig, ConversationEntity, ConversationState } from './types'
import { findEntityMentions, resolveEntity } from '../agent/entityResolution'
import { classifyFreshness, touchEntity } from './state'

/** Explicit instrument mentions in the user's text, in mention order. */
export function extractExplicitEntities(text: string): ConversationEntity[] {
  const lower = text.toLowerCase()
  return findEntityMentions(text)
    .map((m) => ({
      entity: {
        id: m.id,
        displayName: m.displayName,
        type: m.type,
        role: 'context' as const,
        firstSeenTurn: 0,
        lastSeenTurn: 0,
        retrievedAt: 0,
        freshness: 'unknown' as const,
        matched: m.matched,
      },
      pos: lower.indexOf(m.matched.toLowerCase()),
    }))
    .sort((a, b) => (a.pos === -1 ? 1 : 0) - (b.pos === -1 ? 1 : 0) || a.pos - b.pos)
    .map((e) => e.entity)
}

/** Resolve a single query string (e.g. from tool arguments) to a canonical id. */
export function resolveEntityId(query: string): string | undefined {
  return resolveEntity(query)?.id
}

/**
 * Merge this turn's entities into the bounded entity memory (mutates).
 * The first entry becomes the primary (conversation focus); the rest are
 * context. Previously active entities STAY active until the cap is reached;
 * only overflow demotes to recentEntities (bounded) then drops.
 */
export function mergeEntityMemory(
  state: ConversationState,
  config: ConversationConfig,
  turnEntities: ConversationEntity[],
  turn: number,
  now: number,
): void {
  const policy = config.freshness
  const primary = turnEntities[0]?.id
  const known = new Map<string, ConversationEntity>()
  for (const e of [...state.activeEntities, ...state.recentEntities]) known.set(e.id, e)

  const touched: ConversationEntity[] = turnEntities.map((entity) => {
    const role: ConversationEntity['role'] = entity.id === primary ? 'primary' : 'context'
    const existing = known.get(entity.id)
    if (existing) {
      return touchEntity({ ...existing, lastSeenTurn: turn }, now, policy, role)
    }
    return {
      id: entity.id,
      displayName: entity.displayName,
      type: entity.type,
      role,
      firstSeenTurn: turn,
      lastSeenTurn: turn,
      retrievedAt: now,
      freshness: classifyFreshness(now, now, policy, 'market'),
    }
  })

  if (touched.length === 0) {
    // Pronoun/role turn — refresh the topic role, keep the active set.
    state.activeEntities = state.activeEntities.map((e) => ({
      ...e,
      role: e.id === state.activeTopic ? 'primary' : 'context',
    }))
    return
  }

  const touchedIds = new Set(touched.map((e) => e.id))
  const carried = state.activeEntities.filter((e) => !touchedIds.has(e.id))
  const merged = [...touched, ...carried]

  const active = merged.slice(0, config.maxActiveEntities)
  const demoted = merged
    .slice(config.maxActiveEntities)
    .concat(state.recentEntities.filter((e) => !active.some((a) => a.id === e.id) && !touchedIds.has(e.id)))
    .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i)
    .slice(0, config.maxRecentEntities)

  state.activeEntities = active
  state.recentEntities = demoted
}

/** Display names for a set of canonical ids (from active/recent memory). */
export function entityDisplayNames(state: ConversationState, ids: string[]): string[] {
  const known = new Map<string, string>()
  for (const e of [...state.activeEntities, ...state.recentEntities]) known.set(e.id, e.displayName)
  return ids.map((id) => known.get(id) ?? id)
}