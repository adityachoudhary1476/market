import type { Candle, Pattern, PatternStatus } from './types'

// ---------------------------------------------------------------------------
// Pure helpers shared across pattern detectors. No React, no randomness.
// ---------------------------------------------------------------------------

/** Deterministic ordering of lifecycle stages (earlier = more developed). */
const STAGE_ORDER: Record<PatternStatus, number> = {
  complete: 6,
  mature: 5,
  confirmed: 4,
  forming: 3,
  failed: 2,
  invalidated: 1,
  unavailable: 0,
}

export function lifecycleStageWeight(status: PatternStatus): number {
  return STAGE_ORDER[status] ?? 0
}

/**
 * Deterministic pattern ranking (Phase 2B §24 — NOT a confluence score).
 * Ranks how ready a pattern is for further analysis: structural completeness
 * (status), confidence, recency, and volume evidence when available.
 */
export function patternPriority(p: Pattern, barIndex: number, maxBarIndex = 200): number {
  const statusWeight = lifecycleStageWeight(p.status) / 6 // 0..1
  const recency = Math.max(0, 1 - (barIndex - p.barIndex) / maxBarIndex)
  const volumeBonus = p.metadata?.volumeConfirmed === true ? 0.08 : 0
  const score =
    statusWeight * 45 +
    (p.confidence / 100) * 40 +
    recency * 12 +
    volumeBonus * 3
  return Math.round(Math.min(100, Math.max(0, score)))
}

/** Whether a pattern is still structurally intact (forming/confirmed/mature/complete). */
export function isActiveStatus(status: PatternStatus): boolean {
  return status === 'forming' || status === 'confirmed' || status === 'mature' || status === 'complete'
}

/** True range as a fraction of price — a normalized measure of bar size. */
export function trueRangePct(c: Candle, prev?: Candle): number {
  const prevClose = prev?.close ?? c.open
  const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose))
  return c.close !== 0 ? (tr / c.close) * 100 : 0
}

/** Body as % of full range (0 = doji, 1 = body fills the candle). */
export function bodyPct(c: Candle): number {
  const range = c.high - c.low
  return range === 0 ? 0 : Math.abs(c.close - c.open) / range
}

export function isBullish(c: Candle): boolean {
  return c.close >= c.open
}

export function isBearish(c: Candle): boolean {
  return c.close < c.open
}

/** Upper wick length. */
export function upperWick(c: Candle): number {
  return c.high - Math.max(c.open, c.close)
}

/** Lower wick length. */
export function lowerWick(c: Candle): number {
  return Math.min(c.open, c.close) - c.low
}

/** Body length (always positive). */
export function body(c: Candle): number {
  return Math.abs(c.close - c.open)
}

/** Midpoint of the real body. */
export function bodyMid(c: Candle): number {
  return (c.open + c.close) / 2
}

export function round(n: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

/**
 * Whether two price levels are within `tolerancePct` of each other. This is
 * the core "near equal" test for double tops/bottoms and triangle touches.
 */
export function near(a: number, b: number, tolerancePct: number): boolean {
  if (a === 0 && b === 0) return true
  const denom = Math.max(Math.abs(a), Math.abs(b))
  return denom === 0 ? false : Math.abs(a - b) / denom <= tolerancePct
}

/** Mean of the last `n` values (or fewer). */
export function avgLast(values: number[], n: number): number {
  const slice = values.slice(-n)
  return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : NaN
}

/** A monotonically increasing check (strictly >). */
export function isIncreasing(values: number[]): boolean {
  for (let i = 1; i < values.length; i++) if (values[i] <= values[i - 1]) return false
  return values.length > 0
}

/** A monotonically decreasing check. */
export function isDecreasing(values: number[]): boolean {
  for (let i = 1; i < values.length; i++) if (values[i] >= values[i - 1]) return false
  return values.length > 0
}

/** Deterministic unique id. */
let counter = 0
export function pid(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

export function resetPatternIdCounter() {
  counter = 0
}

/** Returns confidence band label from a 0-100 score. */
export function confidenceBand(score: number): 'high' | 'medium' | 'low' {
  if (score >= 75) return 'high'
  if (score >= 50) return 'medium'
  return 'low'
}
