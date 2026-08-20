// ---------------------------------------------------------------------------
// Phase 2C — transparent weight table
//
// Every weight is a named constant. Nothing is derived from a black box. The
// table is exported so tests and consumers can audit it, and the engine
// embeds a copy in `method.weights` for full transparency.
//
// Saturation: within a group, each additional item contributes less (0.8 of
// the previous). This prevents 5 near-identical MA signals from out-scoring
// one confirmed chart pattern — evidence must not be double counted.
// ---------------------------------------------------------------------------

import type { EvidenceGroup, EvidenceSource } from './types'

export const ENGINE_VERSION = '2C.1'

export const SOURCE_WEIGHTS: Record<EvidenceSource, number> = {
  trend: 22,
  momentum: 15,
  volatility: 8,
  volume: 14,
  structure: 16,
  'support-resistance': 14,
  candlestick: 12,
  chart: 18,
  divergence: 16,
  breakout: 18,
  regime: 6,
  historical: 10,
}

/** Per-group total caps — even a flood of evidence cannot exceed these. */
export const GROUP_CAPS: Record<EvidenceGroup, number> = {
  trend: 45,
  momentum: 35,
  volatility: 20,
  volume: 30,
  structure: 35,
  'support-resistance': 30,
  candlestick: 25,
  chart: 40,
  divergence: 32,
  breakout: 40,
  regime: 12,
  historical: 20,
}

/** Within a group, item i contributes weight × SATURATION^(i-1). */
export const SATURATION_FACTOR = 0.8

/** Pattern status multipliers: how much a pattern's status counts as evidence. */
export const STATUS_FACTOR: Record<string, number> = {
  confirmed: 1.0,
  mature: 1.0,
  complete: 1.0,
  forming: 0.6,
  failed: 0,
  invalidated: 0,
  unavailable: 0,
}

/** Freshness decay: an item loses 100 freshness over this many days. */
export const FRESHNESS_HALF_LIFE_DAYS = 4

export const BIAS_THRESHOLD = 18

/** Summary rows for the context's `method.weights` field. */
export function weightTableSummary(): { source: EvidenceSource; base: number; cap: number }[] {
  return (Object.keys(SOURCE_WEIGHTS) as EvidenceSource[]).map((source) => ({
    source,
    base: SOURCE_WEIGHTS[source],
    cap: GROUP_CAPS[source as EvidenceGroup] ?? 0,
  }))
}