// ---------------------------------------------------------------------------
// Phase 2C — scoring
//
// Aggregates EvidenceItems into a single transparent score:
//   per-group saturation → group summaries → bull/bear totals → balance.
// The result is fully decomposable: every point of the balance maps back to
// named groups and named evidence items.
// ---------------------------------------------------------------------------

import type {
  ConfluenceBias,
  ConfluenceScore,
  EvidenceGroup,
  EvidenceGroupSummary,
  EvidenceItem,
} from './types'
import { BIAS_THRESHOLD, GROUP_CAPS, SATURATION_FACTOR } from './weights'

export const EVIDENCE_GROUPS: EvidenceGroup[] = [
  'trend',
  'momentum',
  'volatility',
  'volume',
  'structure',
  'support-resistance',
  'candlestick',
  'chart',
  'divergence',
  'breakout',
  'regime',
  'historical',
]

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/** Saturated group contribution: items sorted by weight, each 0.8 of the last. */
export function saturate(weights: number[], cap: number): number {
  const sorted = [...weights].sort((a, b) => b - a)
  let total = 0
  for (let i = 0; i < sorted.length; i++) {
    total += sorted[i] * Math.pow(SATURATION_FACTOR, i)
  }
  return Number(clamp(total, 0, cap).toFixed(2))
}

export function groupSummaries(items: EvidenceItem[]): EvidenceGroupSummary[] {
  return EVIDENCE_GROUPS.map((group) => {
    const members = items.filter((i) => i.group === group)
    const bullish = members.filter((i) => i.direction === 'bullish')
    const bearish = members.filter((i) => i.direction === 'bearish')
    const neutral = members.filter((i) => i.direction === 'neutral')
    const weightedBull = saturate(bullish.map((i) => i.weight), GROUP_CAPS[group])
    const weightedBear = saturate(bearish.map((i) => i.weight), GROUP_CAPS[group])
    return {
      group,
      count: members.length,
      bullish: bullish.length,
      bearish: bearish.length,
      neutral: neutral.length,
      weightedBull,
      weightedBear,
      net: Number((weightedBull - weightedBear).toFixed(2)),
    }
  }).filter((g) => g.count > 0)
}

export function scoreFromGroups(groups: EvidenceGroupSummary[], items: EvidenceItem[]): ConfluenceScore {
  const bullish = groups.reduce((s, g) => s + g.weightedBull, 0)
  const bearish = groups.reduce((s, g) => s + g.weightedBear, 0)
  const balance = Number(clamp(bullish - bearish, -100, 100).toFixed(2))

  // Confidence: reliability-weighted average of all scored items, diluted by
  // how many groups actually carried evidence (sparse evidence = lower
  // confidence in the overall picture).
  const scored = items.filter((i) => i.weight > 0 && i.direction !== 'neutral')
  const groupsUsed = groups.filter((g) => g.net !== 0).length
  const meanReliability =
    scored.length > 0 ? scored.reduce((s, i) => s + i.confidence, 0) / scored.length : 0
  const coverage = groupsUsed / Math.max(1, groups.filter((g) => g.count > 0).length)
  const confidence = scored.length === 0
    ? 0
    : Number(clamp(meanReliability * (0.55 + 0.45 * coverage), 0, 100).toFixed(1))

  return {
    bullish: Number(clamp(bullish, 0, 100).toFixed(2)),
    bearish: Number(clamp(bearish, 0, 100).toFixed(2)),
    balance,
    confidence,
    quality:
      scored.length === 0
        ? 'insufficient-data'
        : confidence >= 70 ? 'high' : confidence >= 50 ? 'medium' : 'low',
    contribution: groups.map((g) => ({ group: g.group, net: g.net })),
  }
}

export function biasFromBalance(balance: number, confidence: number): ConfluenceBias {
  if (confidence <= 0 || Number.isNaN(balance)) return 'insufficient-data'
  if (balance > BIAS_THRESHOLD) return 'bullish'
  if (balance < -BIAS_THRESHOLD) return 'bearish'
  return 'balanced'
}