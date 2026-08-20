// ---------------------------------------------------------------------------
// Phase 2D — outcome engine
//
// For every setup at timestamp T, outcomes are computed ONLY from candles
// T+1..T+h. Nothing before or at T is modified by the outcome.
//
// - forward return:  (close[T+h] − close[T]) / close[T] × 100  — null when T+h
//   does not exist (never extrapolated).
// - MFE / MAE: from genuine high/low within the horizon. Unavailable (null)
//   when the series is close-only. No close-substitution unless the consumer
//   explicitly uses the close-based `forwardReturn` metric instead.
// - time to threshold: sessions until the first close beyond ±threshold%.
// - breakout outcomes: follow-through, failure, retest from pattern metadata.
//
// Transaction costs (fees/slippage/spread) are NOT applied by default; the
// optional `costs` parameter exists for future validation runs only.
// ---------------------------------------------------------------------------

import type { Candle } from '../types'
import type { HistoricalConfig } from './config'
import type { BreakoutOutcome, HistoricalSetup, HorizonOutcome, SetupOutcome } from './types'

export interface OutcomeCosts {
  /** Applied per-exit on the forward return (percentage points). */
  fees: number
  /** Applied on entry and exit (percentage points). */
  slippage: number
  /** Applied on entry (percentage points). */
  spread: number
}

export const ZERO_COSTS: OutcomeCosts = { fees: 0, slippage: 0, spread: 0 }

export function volumeBucketOfSetup(evidenceVolume: string | undefined, hasVolume: boolean): SetupOutcome['volumeBucket'] {
  if (!hasVolume || !evidenceVolume) return 'unknown'
  return (['high', 'normal', 'low'] as const).includes(evidenceVolume as never) ? (evidenceVolume as SetupOutcome['volumeBucket']) : 'unknown'
}

function sessionsToThreshold(
  entry: number,
  closeSeries: number[],
  thresholdPct: number,
): { positive: number | null; negative: number | null } {
  let positive: number | null = null
  let negative: number | null = null
  for (let i = 0; i < closeSeries.length; i++) {
    const ret = ((closeSeries[i] - entry) / entry) * 100
    if (positive == null && ret >= thresholdPct) positive = i + 1
    if (negative == null && ret <= -thresholdPct) negative = i + 1
    if (positive != null && negative != null) break
  }
  return { positive, negative }
}

export function computeSetupOutcome(
  setup: HistoricalSetup,
  candles: Candle[],
  hasHighLow: boolean,
  hasVolume: boolean,
  config: HistoricalConfig,
  costs: OutcomeCosts = ZERO_COSTS,
): SetupOutcome | null {
  const T = setup.barIndex
  const entry = candles[T]?.close
  if (entry == null || !Number.isFinite(entry) || entry <= 0) return null

  const horizons: Record<string, HorizonOutcome> = {}
  const costPct = costs.fees + costs.slippage * 2 + costs.spread

  for (const h of config.forwardHorizons) {
    const idx = T + h
    if (idx >= candles.length) {
      horizons[String(h)] = {
        forwardReturn: null,
        mfePercent: null,
        maePercent: null,
        sessionsToFirstPositiveThreshold: [],
        sessionsToFirstNegativeThreshold: [],
      }
      continue
    }
    const closeT = candles[idx].close
    const rawReturn = ((closeT - entry) / entry) * 100
    const forwardReturn = Number((rawReturn - costPct).toFixed(4))

    let mfePercent: number | null = null
    let maePercent: number | null = null
    if (hasHighLow) {
      let mfe: number | null = null
      let mae: number | null = null
      for (let i = T + 1; i <= idx; i++) {
        const c = candles[i]
        if (setup.direction === 'bullish') {
          const fav = ((c.high - entry) / entry) * 100
          const adv = ((c.low - entry) / entry) * 100
          if (mfe == null || fav > mfe) mfe = fav
          if (mae == null || adv < mae) mae = adv
        } else if (setup.direction === 'bearish') {
          const fav = ((entry - c.low) / entry) * 100
          const adv = ((c.high - entry) / entry) * 100
          if (mfe == null || fav > mfe) mfe = fav
          if (mae == null || adv > mae) mae = adv
        }
      }
      mfePercent = mfe != null ? Number(mfe.toFixed(4)) : null
      maePercent = mae != null ? Number(mae.toFixed(4)) : null
    }

    const closeSeries = []
    for (let i = T + 1; i <= idx; i++) closeSeries.push(candles[i].close)

    const thresholds: (number | null)[] = []
    const negThresholds: (number | null)[] = []
    for (const tp of config.timeToThresholdPcts) {
      const t = sessionsToThreshold(entry, closeSeries, tp)
      thresholds.push(t.positive)
      negThresholds.push(t.negative)
    }

    horizons[String(h)] = {
      forwardReturn,
      mfePercent,
      maePercent,
      sessionsToFirstPositiveThreshold: thresholds,
      sessionsToFirstNegativeThreshold: negThresholds,
    }
  }

  // Breakout-specific outcomes (family breakout/breakdown only).
  let breakout: BreakoutOutcome | null = null
  if (setup.pattern && (setup.pattern.family === 'breakout' || setup.pattern.family === 'breakdown')) {
    const meta = setup.metadata ?? {}
    const horizonIdx = Math.min(config.forwardHorizons.find((h) => h >= 5) ?? config.forwardHorizons[config.forwardHorizons.length - 1], candles.length - 1 - T)
    const followIdx = T + horizonIdx
    const followThroughReturn = followIdx < candles.length
      ? Number((((candles[followIdx].close - entry) / entry) * 100 - costPct).toFixed(4))
      : null

    let barsToFollowThrough: number | null = null
    const level = setup.pattern.invalidationLevel ?? entry
    const favorableSide = setup.direction === 'bullish'
    for (let i = T + 1; i < candles.length; i++) {
      const broke = favorableSide ? candles[i].close > level : candles[i].close < level
      if (broke) {
        barsToFollowThrough = i - T
        break
      }
    }

    breakout = {
      confirmedAt: setup.timestamp,
      penetrationPercent: typeof meta.penetrationPercent === 'number' ? meta.penetrationPercent : 0,
      followThroughReturn,
      failed: meta.failureDistance != null || meta.breakoutStatus === 'failed',
      retestOccurred: meta.retestHeld != null || setup.pattern.name.includes('retest'),
      retestHeld: typeof meta.retestHeld === 'boolean' ? meta.retestHeld : null,
      barsToFollowThrough,
    }
  }

  return {
    setupId: setup.id,
    timestamp: setup.timestamp,
    pattern: setup.pattern?.name ?? 'no-pattern',
    direction: setup.direction,
    regime: setup.regime,
    trendDirection: setup.evidenceSignature.trend ?? 'unknown',
    volumeBucket: volumeBucketOfSetup(setup.evidenceSignature.volume, hasVolume),
    horizons,
    breakout,
  }
}