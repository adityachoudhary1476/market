// ---------------------------------------------------------------------------
// Phase 2C — evidence normalization
//
// Converts raw TechnicalSignals (Phase 2A.1) and Patterns (Phase 2B) into a
// single uniform EvidenceItem list. Every item carries its source, group,
// direction, confidence, freshness and final weight so the score can be fully
// decomposed by any consumer.
// ---------------------------------------------------------------------------

import type {
  EvidenceGroup,
  EvidenceItem,
  EvidenceSource,
  StructuredTechnicalContextLike,
} from './types'
import { FRESHNESS_HALF_LIFE_DAYS, SOURCE_WEIGHTS, STATUS_FACTOR } from './weights'

const CATEGORY_TO_SOURCE: Record<string, EvidenceSource> = {
  trend: 'trend',
  momentum: 'momentum',
  volatility: 'volatility',
  volume: 'volume',
  structure: 'structure',
  'support-resistance': 'support-resistance',
}

const PATTERN_FAMILY_TO_SOURCE: Record<string, EvidenceSource> = {
  candlestick: 'candlestick',
  chart: 'chart',
  divergence: 'divergence',
  breakout: 'breakout',
  breakdown: 'breakout',
}

const PATTERN_FAMILY_TO_GROUP: Record<string, EvidenceGroup> = {
  candlestick: 'candlestick',
  chart: 'chart',
  divergence: 'divergence',
  breakout: 'breakout',
  breakdown: 'breakout',
}

export function freshnessOf(timestamp: string | null | undefined, now: number = Date.now()): number {
  if (!timestamp) return 100
  const ts = Date.parse(timestamp)
  if (!Number.isFinite(ts)) return 100
  const days = Math.max(0, (now - ts) / 86_400_000)
  return Math.max(0, Math.round(100 * Math.pow(0.5, days / FRESHNESS_HALF_LIFE_DAYS)))
}

/** Base weight before group saturation: source weight × reliability × status. */
export function baseWeight(
  source: EvidenceSource,
  confidence: number,
  statusFactor: number,
  freshness: number,
): number {
  const reliability = Math.max(0, Math.min(100, confidence)) / 100
  const w = SOURCE_WEIGHTS[source] * reliability * statusFactor * (freshness / 100)
  return Number(w.toFixed(2))
}

let counter = 0
function eid(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}
export function resetEvidenceIdCounter() {
  counter = 0
}

export interface NormalizedEvidence {
  items: EvidenceItem[]
  warnings: string[]
  adjustedFor: string[]
}

export function normalizeEvidence(
  technical: StructuredTechnicalContextLike,
  now: number = Date.now(),
): NormalizedEvidence {
  const items: EvidenceItem[] = []
  const warnings: string[] = []
  const adjustedFor: string[] = []

  const signals = technical.signals ?? []
  for (const s of signals) {
    const meta = s.metadata ?? {}
    const family = typeof meta.family === 'string' ? meta.family : undefined
    // Pattern evidence is consumed from patterns.all below (richer lifecycle
    // state) — skipping the flattened pattern signals avoids double counting.
    if (family) continue
    const source = CATEGORY_TO_SOURCE[s.category] ?? 'trend'
    const group = source
    const freshness = freshnessOf(s.timestamp, now)
    const statusFactor = 1
    items.push({
      id: eid('ev'),
      source,
      group,
      name: s.name,
      direction: s.direction,
      strength: Math.max(0, Math.min(100, s.strength)),
      confidence: Math.max(0, Math.min(100, s.confidence)),
      freshness,
      weight: baseWeight(source, s.confidence, statusFactor, freshness),
      timestamp: s.timestamp ?? null,
      evidence: s.evidence,
      metadata: s.metadata,
    })
  }

  // Patterns carry lifecycle state (forming vs confirmed) that the signal view
  // cannot express — consume the rich list directly for pattern evidence.
  const patterns = technical.patterns?.all ?? []
  if (patterns.length > 0) {
    let excluded = 0
    for (const p of patterns) {
      const statusFactor = STATUS_FACTOR[p.status] ?? 0
      if (statusFactor === 0) {
        excluded += 1
        continue
      }
      const freshness = freshnessOf(new Date(p.detectedAt).toISOString(), now)
      items.push({
        id: eid('pat'),
        source: PATTERN_FAMILY_TO_SOURCE[p.family] ?? 'chart',
        group: PATTERN_FAMILY_TO_GROUP[p.family] ?? 'chart',
        name: p.label,
        direction: p.direction,
        strength: Math.max(0, Math.min(100, p.strength)),
        confidence: Math.max(0, Math.min(100, p.confidence)),
        freshness,
        weight: baseWeight(PATTERN_FAMILY_TO_SOURCE[p.family] ?? 'chart', p.confidence, statusFactor, freshness),
        timestamp: new Date(p.detectedAt).toISOString(),
        evidence: [
          `${p.family} pattern · ${p.status}`,
          ...p.evidence,
          p.invalidationLevel != null ? `invalidation ${p.invalidationLevel}` : '',
        ].filter(Boolean),
        metadata: {
          patternName: p.name,
          family: p.family,
          status: p.status,
          invalidationLevel: p.invalidationLevel ?? undefined,
          targetLevel: p.targetLevel ?? undefined,
        },
      })
    }
    if (excluded > 0) {
      adjustedFor.push(`${excluded} non-active pattern(s) excluded from scoring (failed/invalidated/unavailable)`)
    }
  }

  if (!technical.dataQuality?.hasHighLow) {
    warnings.push('Close-only feed: candle-based evidence is limited.')
  }
  if (!technical.dataQuality?.hasVolume) {
    warnings.push('Volume unavailable: volume and volume-confirmed evidence is limited.')
  }
  if ((technical.dataQuality?.candleCount ?? 0) < 60 && technical.dataQuality?.candleCount != null) {
    warnings.push('Fewer than 60 bars: pattern and trend evidence is less reliable.')
  }

  return { items, warnings, adjustedFor }
}