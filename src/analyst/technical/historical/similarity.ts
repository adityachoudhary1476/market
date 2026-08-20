// ---------------------------------------------------------------------------
// Phase 2D — similarity engine
//
// Deterministic, factor-based, fully transparent. Each dimension contributes
// a named weight and a human-readable explanation. No nearest-neighbour black
// boxes: any two setups can be audited factor by factor.
//
// Weights (sum = 1.00):
//   pattern 0.25  direction 0.10  trend 0.12  momentum 0.08
//   volume 0.08   volatility 0.08  structure 0.08  confluence 0.11  regime 0.10
// ---------------------------------------------------------------------------

import type { Direction } from '../types'
import type {
  HistoricalSetup,
  SimilarityFactor,
  SimilarityResult,
} from './types'

export const SIMILARITY_FACTOR_WEIGHTS: Record<string, number> = {
  pattern: 0.25,
  direction: 0.1,
  trend: 0.12,
  momentum: 0.08,
  volume: 0.08,
  volatility: 0.08,
  structure: 0.08,
  confluence: 0.11,
  regime: 0.1,
}

const TREND_BUCKETS: Record<string, number> = {
  bullish: 0,
  bearish: 1,
  neutral: 2,
  'transitioning': 2,
  'insufficient-data': 3,
}

const STRUCTURE_BUCKETS: Record<string, number> = {
  bullish: 0,
  bearish: 1,
  range: 2,
  transitioning: 3,
  'insufficient-data': 4,
}

const VOLATILITY_BUCKETS: Record<string, number> = {
  low: 0,
  normal: 1,
  elevated: 2,
  high: 3,
  'insufficient-data': 4,
}

const VOLUME_BUCKETS: Record<string, number> = {
  high: 0,
  normal: 1,
  low: 2,
}

function bucketMatch(a: number | undefined, b: number | undefined, adjacentScore = 0.5): number {
  if (a === undefined || b === undefined) return 0.5
  if (a === b) return 1
  if (Math.abs(a - b) === 1) return adjacentScore
  return 0
}

function patternFactor(a: HistoricalSetup, b: HistoricalSetup): { score: number; label: string } {
  const pa = a.pattern?.name
  const pb = b.pattern?.name
  const fa = a.pattern?.family
  const fb = b.pattern?.family
  if (pa && pb && pa === pb && fa === fb) return { score: 1, label: `Pattern: exact match (${pa})` }
  if (fa && fb && fa === fb) return { score: 0.5, label: `Pattern: same family only (${fa})` }
  return { score: 0, label: 'Pattern: different' }
}

function directionFactor(a: HistoricalSetup, b: HistoricalSetup): { score: number; label: string } {
  if (a.direction === b.direction && a.direction !== 'neutral') return { score: 1, label: `Direction: same (${a.direction})` }
  if (a.direction === 'neutral' || b.direction === 'neutral') return { score: 0.5, label: 'Direction: neutral involved' }
  return { score: 0, label: `Direction: opposite (${a.direction} vs ${b.direction})` }
}

function momentumFactor(a: HistoricalSetup, b: HistoricalSetup): { score: number; label: string } {
  const ma = a.evidenceSignature.momentum
  const mb = b.evidenceSignature.momentum
  if (ma && mb && ma === mb) return { score: 1, label: `Momentum: same (${ma})` }
  if (!ma || !mb) return { score: 0.5, label: 'Momentum: unknown on one side' }
  return { score: 0, label: `Momentum: different (${ma} vs ${mb})` }
}

/**
 * Compute similarity between a query setup and a candidate setup.
 * Returns a factor breakdown plus a 0-100 weighted score.
 */
export function similarityBetween(query: HistoricalSetup, candidate: HistoricalSetup, threshold = 0.6): SimilarityResult {
  const factors: SimilarityFactor[] = []

  const add = (key: string, label: string, score: number) => {
    factors.push({ key, label, score: Number(score.toFixed(3)), weight: SIMILARITY_FACTOR_WEIGHTS[key] })
  }

  const pf = patternFactor(query, candidate)
  add('pattern', pf.label, pf.score)

  const df = directionFactor(query, candidate)
  add('direction', df.label, df.score)

  const ta = TREND_BUCKETS[query.evidenceSignature.trend ?? 'insufficient-data']
  const tb = TREND_BUCKETS[candidate.evidenceSignature.trend ?? 'insufficient-data']
  add('trend', `Trend: ${query.evidenceSignature.trend ?? 'unknown'} vs ${candidate.evidenceSignature.trend ?? 'unknown'}`, bucketMatch(ta, tb))

  const mf = momentumFactor(query, candidate)
  add('momentum', mf.label, mf.score)

  const va = VOLUME_BUCKETS[query.evidenceSignature.volume ?? '']
  const vb = VOLUME_BUCKETS[candidate.evidenceSignature.volume ?? '']
  add('volume', `Volume: ${query.evidenceSignature.volume ?? 'unknown'} vs ${candidate.evidenceSignature.volume ?? 'unknown'}`, bucketMatch(va, vb))

  const xa = VOLATILITY_BUCKETS[query.evidenceSignature.volatility ?? 'insufficient-data']
  const xb = VOLATILITY_BUCKETS[candidate.evidenceSignature.volatility ?? 'insufficient-data']
  add('volatility', `Volatility: ${query.evidenceSignature.volatility ?? 'unknown'} vs ${candidate.evidenceSignature.volatility ?? 'unknown'}`, bucketMatch(xa, xb))

  const sa = STRUCTURE_BUCKETS[query.evidenceSignature.structure ?? 'insufficient-data']
  const sb = STRUCTURE_BUCKETS[candidate.evidenceSignature.structure ?? 'insufficient-data']
  add('structure', `Structure: ${query.evidenceSignature.structure ?? 'unknown'} vs ${candidate.evidenceSignature.structure ?? 'unknown'}`, bucketMatch(sa, sb))

  const ca = query.confluence
  const cb = candidate.confluence
  let confScore: number
  let confLabel: string
  if (ca && cb) {
    const sameBias = ca.bias === cb.bias
    const sameQuality = ca.quality === cb.quality
    confScore = sameBias && sameQuality ? 1 : sameBias ? 0.7 : sameQuality ? 0.4 : 0.2
    confLabel = `Confluence: ${ca.bias}/${ca.quality} vs ${cb.bias}/${cb.quality}`
  } else {
    confScore = 0.5
    confLabel = 'Confluence: missing on one side'
  }
  add('confluence', confLabel, confScore)

  add('regime', `Regime: ${query.regime} vs ${candidate.regime}`, query.regime === candidate.regime ? 1 : 0.25)

  const score = Number((factors.reduce((s, f) => s + f.score * f.weight, 0) * 100).toFixed(1))

  return {
    match: score >= threshold * 100,
    score,
    factors,
    explanation: factors.map((f) => `${f.label} (${(f.score * 100).toFixed(0)}% × ${f.weight.toFixed(2)})`),
  }
}

/** Query descriptor → synthetic setup used for similarity search. */
export function setupFromDescriptor(
  instrument: string,
  timeframe: string,
  descriptor: { pattern?: string; direction?: Direction },
): HistoricalSetup {
  const name = descriptor.pattern
  const family = !name
    ? undefined
    : name.toLowerCase().includes('breakdown')
      ? 'breakdown'
      : name.toLowerCase().includes('breakout')
        ? 'breakout'
        : 'chart'
  return {
    id: 'query-setup',
    timestamp: 0,
    barIndex: 0,
    instrument,
    timeframe,
    direction: descriptor.direction ?? 'neutral',
    pattern: name
      ? { family: family!, type: family!, name, status: 'query', confidence: 0, invalidationLevel: null, targetLevel: null }
      : null,
    confluence: null,
    evidenceSignature: {},
    regime: 'neutral',
  }
}

/**
 * Rank candidate setups against a query, thresholding by similarity.
 * Returns matches with their similarity results, plus considered/accepted counts.
 */
export function findSimilar(
  query: HistoricalSetup,
  candidates: HistoricalSetup[],
  threshold: number,
  maxMatches: number,
): { matches: { setup: HistoricalSetup; similarity: SimilarityResult }[]; considered: number; accepted: number } {
  let considered = 0
  const scored: { setup: HistoricalSetup; similarity: SimilarityResult }[] = []
  for (const candidate of candidates) {
    if (candidate.id === query.id) continue
    considered += 1
    const sim = similarityBetween(query, candidate)
    if (sim.score >= threshold * 100) {
      scored.push({ setup: candidate, similarity: sim })
    }
  }
  scored.sort((a, b) => b.similarity.score - a.similarity.score)
  const matches = scored.slice(0, maxMatches)
  return { matches, considered, accepted: matches.length }
}