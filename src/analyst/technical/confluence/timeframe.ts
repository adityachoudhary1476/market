// ---------------------------------------------------------------------------
// Phase 2C — multi-timeframe confluence
//
// Aligns a primary timeframe against supporting timeframes. Alignment is a
// confidence-weighted agreement of each timeframe's balance — never a simple
// vote, because a weak weekly picture must not cancel a strong daily one.
// ---------------------------------------------------------------------------

import type {
  StructuredTechnicalContextLike,
  TimeframeConfluence,
  TimeframeView,
} from './types'
import { biasFromBalance, groupSummaries, scoreFromGroups } from './scoring'
import { normalizeEvidence } from './evidence'

export function viewFor(
  technical: StructuredTechnicalContextLike | undefined | null,
  timeframeLabel: string,
): TimeframeView {
  if (!technical || technical.available === false) {
    return { timeframe: timeframeLabel, available: false, balance: null, confidence: null, bias: null }
  }
  const { items } = normalizeEvidence(technical)
  const groups = groupSummaries(items)
  const score = scoreFromGroups(groups, items)
  return {
    timeframe: timeframeLabel,
    available: true,
    balance: score.balance,
    confidence: score.confidence,
    bias: biasFromBalance(score.balance, score.confidence),
  }
}

export interface AlignmentInput {
  primary: StructuredTechnicalContextLike | undefined | null
  /** Ordered from most to least important supporting timeframe. */
  supporting: { label: string; context: StructuredTechnicalContextLike | undefined | null }[]
}

export function buildTimeframeConfluence(input: AlignmentInput): TimeframeConfluence | null {
  const primaryLabel = input.primary?.timeframe ?? 'primary'
  const primary = viewFor(input.primary, primaryLabel)
  const supporting = input.supporting.map((s) => viewFor(s.context, s.label))

  const all = [primary, ...supporting].filter((v) => v.available && v.balance != null && v.confidence != null)
  if (all.length === 0) return null

  const weighted =
    all.reduce((s, v) => s + (v.balance ?? 0) * (v.confidence ?? 0), 0) /
    all.reduce((s, v) => s + (v.confidence ?? 0), 0)
  const netAgreement = Number(weighted.toFixed(1))

  let alignment: TimeframeConfluence['alignment'] = 'insufficient-data'
  const directional = all.filter((v) => v.bias === 'bullish' || v.bias === 'bearish')
  if (directional.length >= 2) {
    const bulls = directional.filter((v) => v.bias === 'bullish').length
    const bears = directional.filter((v) => v.bias === 'bearish').length
    if (bulls === directional.length || bears === directional.length) alignment = 'aligned'
    else if (bulls > 0 && bears > 0) alignment = 'opposed'
    else alignment = 'partially-aligned'
  } else if (directional.length === 1 && all.length >= 2) {
    alignment = 'partially-aligned'
  }

  return { primary, supporting, alignment, netAgreement }
}