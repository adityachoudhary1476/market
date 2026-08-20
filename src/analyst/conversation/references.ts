// ---------------------------------------------------------------------------
// Phase 3D.1 — Conversation & Context Intelligence: reference resolution
//
// Deterministic, rules-based resolution of anaphora against conversation
// memory: pronouns ("it", "this", "they"), comparison references ("the first",
// "which one", "the other one", "the leader/laggard"), role references
// ("the index", "the market") and user corrections ("Actually, I meant X").
//
// Rules NEVER guess: a reference resolves to a canonical entity only when
// memory supports it, and every resolution carries a confidence so the LLM
// can decide whether to ask the user. Meaningful ambiguity is surfaced in
// the context payload, never silently assumed.
// ---------------------------------------------------------------------------

import type { CorrectionDetect, ConversationState, ReferenceResolution } from './types'
import { extractExplicitEntities } from './entities'

const CORRECTION_PATTERNS: RegExp[] = [
  /\bi meant\b/i,
  /\bno wait\b/i,
  /\bwait,? no\b/i,
  /\bhold on\b/i,
  /\bscratch that\b/i,
  /\bnever ?mind\b/i,
  /\bignore (the )?(last|previous|that|it)\b/i,
  /\bforget (the )?(last|previous|that|it)\b/i,
  /\b(change|replace) (that|it|the instrument) (to|with)\b/i,
  /\bnot\b[^.!?]{1,80}\bbut\b/i,
  /^\s*(actually|no|hold on|wait)[,.!\s]/i,
]

const DIMENSION_NOUNS = [
  'momentum', 'trend', 'strength', 'volatility', 'valuation', 'breadth',
  'returns', 'risk', 'volume', 'performance', 'relative strength', 'outlook',
]

// --- Corrections -----------------------------------------------------------

/**
 * Detect a user correction and determine what was walked back and what the
 * user meant instead. Deterministic: the correction intent comes from the
 * phrase patterns; the entities come from explicit canonical matches.
 */
export function detectCorrections(text: string, state: ConversationState): CorrectionDetect[] {
  const lower = text.toLowerCase()
  const isCorrection = CORRECTION_PATTERNS.some((p) => p.test(lower))
  if (!isCorrection) return []

  const rawMentions = extractExplicitEntities(text)
  const ids = rawMentions.map((m) => m.id)
  const aliasOf = new Map<string, string>()
  for (const m of rawMentions) if (m.matched) aliasOf.set(m.id, m.matched)
  const posOf = (id: string) => {
    const alias = aliasOf.get(id)
    return alias ? lower.indexOf(alias.toLowerCase()) : -1
  }

  const meantIdx = lower.search(/\bi meant\b/)
  const butIdx = lower.search(/\bbut\b/)

  let corrected: string | undefined
  let previous: string | undefined

  if (meantIdx >= 0 || butIdx >= 0) {
    // Position-aware: the entity AFTER "meant"/"but" is the target; the
    // other mention ("not X", "X but Y") is what was walked back.
    const anchor = meantIdx >= 0 ? meantIdx : butIdx
    corrected = ids.find((id) => posOf(id) > anchor)
    previous = ids.find((id) => id !== corrected)
  } else if (ids.length >= 2) {
    // "Actually, forget TCS, analyze Infosys" — last-mentioned is the target.
    corrected = ids[ids.length - 1]
    previous = ids[0]
  } else if (ids.length === 1) {
    corrected = ids[0]
  }

  if (corrected && !previous && state.activeTopic && state.activeTopic !== corrected) {
    previous = state.activeTopic
  }

  const out: CorrectionDetect = { raw: text }
  if (previous) out.previous = previous
  if (corrected) out.corrected = corrected
  return [out]
}

// --- Reference resolution --------------------------------------------------

export function resolveReferences(text: string, state: ConversationState): ReferenceResolution[] {
  const out: ReferenceResolution[] = []
  const lower = text.toLowerCase()
  const active = state.activeEntities
  const primary = active[0]
  const comparison = state.activeComparison
  const pair = comparison && comparison.entities.length >= 2
    ? [comparison.entities[0], comparison.entities[1]] as [string, string]
    : undefined

  if (pair) {
    const [a, b] = pair
    const names = (ids: string[]) => ids.map((id) => displayNameOf(state, id)).join(' / ')

    const first = lower.match(/\b(the )?first one?\b/) ?? lower.match(/\b(the )?former\b/)
    if (first) {
      out.push({
        raw: first[0],
        entityId: a,
        displayName: displayNameOf(state, a),
        confidence: 'high',
        reason: `first member of the active comparison (${names(pair)})`,
        kind: 'comparison',
      })
    }
    const second = lower.match(/\b(the )?second one?\b/) ?? lower.match(/\b(the )?latter\b/)
    if (second) {
      out.push({
        raw: second[0],
        entityId: b,
        displayName: displayNameOf(state, b),
        confidence: 'high',
        reason: `second member of the active comparison (${names(pair)})`,
        kind: 'comparison',
      })
    }
    const other = lower.match(/\b(the )?other( one)?\b/)
    if (other) {
      out.push({
        raw: other[0],
        entityId: oppositeOf(primary?.id, pair),
        displayName: displayNameOf(state, oppositeOf(primary?.id, pair)),
        confidence: 'high',
        reason: `"the other" — the member of ${names(pair)} that is not the current focus`,
        kind: 'comparison',
      })
    }
    if (/\b(which one|which of them|between them)\b/.test(lower)) {
      out.push({
        raw: 'which one',
        entityId: a,
        displayName: names(pair),
        confidence: 'medium',
        reason: `comparison continuation — members are ${names(pair)}`,
        kind: 'comparison',
      })
    }
    if (/\b(both|the two|the pair|each of them|them both)\b/.test(lower)) {
      out.push({
        raw: 'both',
        entityId: a,
        displayName: names(pair),
        confidence: 'high',
        reason: `both members of the active comparison (${names(pair)})`,
        kind: 'comparison',
      })
    }
    if (/\b(the )?(leader|stronger|strongest|winner|outperformer|better one|top performer)\b/.test(lower)) {
      out.push({
        raw: 'the stronger one',
        entityId: a,
        displayName: names(pair),
        confidence: 'medium',
        reason: `stronger member of ${names(pair)} — determine with tools, not from memory`,
        kind: 'comparison',
      })
    }
    if (/\b(the )?(laggard|weaker|weakest|loser|underperformer|worse one)\b/.test(lower)) {
      out.push({
        raw: 'the weaker one',
        entityId: b,
        displayName: names(pair),
        confidence: 'medium',
        reason: `weaker member of ${names(pair)} — determine with tools, not from memory`,
        kind: 'comparison',
      })
    }
  }

  // Pronouns — "it"/"this"/"that" resolve to the primary topic when clear.
  const singular = lower.match(/\b(it|this|that)\b/)
  if (singular) {
    if (primary) {
      const confidence = active.length <= 1 ? 'high' : 'medium'
      const reason = active.length <= 1
        ? `pronoun resolves to the active topic ${primary.displayName}`
        : `pronoun most likely refers to the primary topic ${primary.displayName} (also active: ${active.slice(1).map((e) => e.displayName).join(', ')})`
      out.push({ raw: singular[0], entityId: primary.id, displayName: primary.displayName, confidence, reason, kind: 'pronoun' })
    } else {
      out.push({ raw: singular[0], confidence: 'unresolved', reason: 'pronoun found but no instrument is active in this session', kind: 'pronoun' })
    }
  }

  const plural = lower.match(/\b(these|those|they|them)\b/)
  if (plural) {
    if (active.length >= 2) {
      out.push({
        raw: plural[0],
        entityId: active[0].id,
        displayName: active.slice(0, 2).map((e) => e.displayName).join(' / '),
        confidence: 'medium',
        reason: `plural pronoun — active entities ${active.slice(0, 2).map((e) => e.displayName).join(', ')}`,
        kind: 'pronoun',
      })
    } else if (active.length === 1) {
      out.push({ raw: plural[0], entityId: active[0].id, displayName: active[0].displayName, confidence: 'high', reason: `plural pronoun referring to the only active entity ${active[0].displayName}`, kind: 'pronoun' })
    } else {
      out.push({ raw: plural[0], confidence: 'unresolved', reason: 'plural pronoun found but no entities are active', kind: 'pronoun' })
    }
  }

  // Role references.
  if (/\bthe index\b/.test(lower)) {
    const indexes = active.filter((e) => e.type === 'index')
    const target = indexes[0]
    if (target) {
      out.push({
        raw: 'the index',
        entityId: target.id,
        displayName: target.displayName,
        confidence: indexes.length === 1 ? 'high' : 'medium',
        reason: 'role reference "the index"',
        kind: 'role',
      })
    } else {
      out.push({ raw: 'the index', confidence: 'unresolved', reason: '"the index" used but no index is active in memory', kind: 'role' })
    }
  }
  if (/\bthe stock\b/.test(lower)) {
    const stocks = active.filter((e) => e.type === 'stock')
    const target = stocks[0]
    if (target) {
      out.push({
        raw: 'the stock',
        entityId: target.id,
        displayName: target.displayName,
        confidence: stocks.length === 1 ? 'high' : 'medium',
        reason: 'role reference "the stock"',
        kind: 'role',
      })
    } else {
      out.push({ raw: 'the stock', confidence: 'unresolved', reason: '"the stock" used but no stock is active in memory', kind: 'role' })
    }
  }
  if (/\bthe market\b/.test(lower)) {
    out.push({ raw: 'the market', confidence: 'high', reason: '"the market" refers to broad market context, not a specific instrument', kind: 'role' })
  }
  if (/\bthe sector\b/.test(lower)) {
    out.push({ raw: 'the sector', confidence: 'low', reason: 'sector relationships are not tracked in conversation memory — ask which sector if the question depends on it', kind: 'role' })
  }
  if (/\b(the )?(last|previous) question\b/.test(lower)) {
    out.push({ raw: 'the previous question', confidence: 'high', reason: 'links back to the previous question in this session', kind: 'role' })
  }

  return out
}

/** Extract comparison dimension nouns (bounded vocabulary, deterministic). */
export function extractComparisonDimensions(text: string): string[] {
  const lower = text.toLowerCase()
  const found = DIMENSION_NOUNS.filter((d) => lower.includes(d))
  return [...new Set(found)].slice(0, 4)
}

function displayNameOf(state: ConversationState, id: string): string {
  for (const e of [...state.activeEntities, ...state.recentEntities]) {
    if (e.id === id) return e.displayName
  }
  return id
}

function oppositeOf(id: string | undefined, pair: [string, string]): string {
  return id === pair[1] ? pair[0] : pair[1]
}