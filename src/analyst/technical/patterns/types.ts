// ---------------------------------------------------------------------------
// Phase 2B — Pattern Detection Engine types
//
// These detectors sit ON TOP of the Phase 2A.1 StructuredTechnicalContext and
// raw candles. They produce machine-readable evidence only: no prose, no
// buy/sell, no confluence score (that is Phase 2C). Every pattern carries its
// lifecycle state, confidence, invalidation level, and evidence.
// ---------------------------------------------------------------------------

// Base types from the Phase 2A.1 engine are re-exported here so detectors can
// import everything from a single module without duplicating representations.
export type { Direction, Candle, TechnicalSignal } from '../types'
export type { IndicatorContext, PriceLevel, StructuredTechnicalContext } from '../types'
import type { Direction, TechnicalSignal } from '../types'

// A pattern may form, confirm, mature, fail (invalidate), or complete (target).
export type PatternStatus =
  | 'forming' // early evidence, not yet confirmed
  | 'confirmed' // confirmation criteria met
  | 'mature' // confirmed and developing toward target
  | 'failed' // invalidation level breached
  | 'complete' // target/measurement reached
  | 'invalidated' // broke the opposite side of the pattern (e.g. double top above its highs)
  | 'unavailable' // not enough data to attempt this pattern reliably

export type PatternFamily =
  | 'candlestick'
  | 'chart'
  | 'divergence'
  | 'breakout'
  | 'breakdown'

export type Confidence = 'high' | 'medium' | 'low'

/**
 * Lifecycle vocabulary. The engine uses `forming` as the DEVELOPING state;
 * `confirmed` requires the pattern's own confirmation criteria; `failed` and
 * `invalidated` are distinct (failed = invalidation level breached, invalidated
 * = the pattern structure itself broke the wrong way).
 */
export const PATTERN_LIFECYCLE_STAGES = [
  'forming',
  'confirmed',
  'mature',
  'complete',
  'failed',
  'invalidated',
  'unavailable',
] as const

interface PatternBase {
  id: string
  family: PatternFamily
  /** Machine-readable pattern identifier, e.g. "doji", "head-and-shoulders". */
  name: string
  /** Human-readable label. */
  label: string
  direction: Direction
  status: PatternStatus
  /**
   * 0-100 — reliability of the evidence (touch count, confirmation state,
   * data quality). Deterministic; never random.
   */
  confidence: number
  confidenceBand: Confidence
  /**
   * 0-100 — magnitude of the pattern geometry (body/wick ratios, pattern
   * depth, penetration %, separation). Independent of confidence.
   */
  strength: number
  /** Epoch ms of the most recent bar involved in the pattern. */
  detectedAt: number
  /** Index of the bar where the pattern completed/triggered. */
  barIndex: number
  /** Index range covered by the pattern, when known. */
  startIndex?: number
  endIndex?: number
  /** Price at which this pattern is invalidated (stop reference). */
  invalidationLevel: number | null
  /** Projected target where available (measured move). */
  targetLevel: number | null
  /** Array of specific observations supporting the pattern. */
  evidence: string[]
  /** Structured coordinates for rendering/debugging. */
  points?: PatternPoint[]
  /** Which data fields the pattern required (for capability reporting). */
  dataRequirements: string[]
  /** Epoch ms at which confirmation criteria were met (if confirmed). */
  confirmedAt?: number
  metadata?: Record<string, unknown>
}

export interface PatternPoint {
  index: number
  timestamp: number
  price: number
  role: string
}

// --- Candlestick patterns --------------------------------------------------

export type CandlestickName =
  | 'doji'
  | 'dragonfly-doji'
  | 'gravestone-doji'
  | 'hammer'
  | 'inverted-hammer'
  | 'hanging-man'
  | 'shooting-star'
  | 'marubozu'
  | 'bullish-engulfing'
  | 'bearish-engulfing'
  | 'bullish-harami'
  | 'bearish-harami'
  | 'piercing-line'
  | 'dark-cloud-cover'
  | 'tweezer-top'
  | 'tweezer-bottom'
  | 'morning-star'
  | 'evening-star'
  | 'three-white-soldiers'
  | 'three-black-crows'
  | 'three-inside-up'
  | 'three-inside-down'

export interface CandlestickPattern extends PatternBase {
  family: 'candlestick'
  name: CandlestickName
}

// --- Chart patterns --------------------------------------------------------

export type ChartPatternName =
  | 'head-and-shoulders'
  | 'inverse-head-and-shoulders'
  | 'double-top'
  | 'double-bottom'
  | 'triple-top'
  | 'triple-bottom'
  | 'ascending-triangle'
  | 'descending-triangle'
  | 'symmetrical-triangle'
  | 'rising-wedge'
  | 'falling-wedge'
  | 'bull-flag'
  | 'bear-flag'
  | 'bull-pennant'
  | 'bear-pennant'
  | 'rectangle'
  | 'cup-and-handle'
  | 'inverse-cup-and-handle'
  | 'channel-up'
  | 'channel-down'

export interface ChartPattern extends PatternBase {
  family: 'chart'
  name: ChartPatternName
  /** For triangle/rectangle patterns, the two boundary lines. */
  boundaries?: {
    resistance: { slope: number; intercept: number }
    support: { slope: number; intercept: number }
  }
}

// --- Divergences -----------------------------------------------------------

export type DivergenceName =
  | 'bullish-regular'
  | 'bearish-regular'
  | 'bullish-hidden'
  | 'bearish-hidden'

export type DivergenceOscillator = 'rsi' | 'macd' | 'mfi' | 'cci' | 'williams-r'

export interface Divergence extends PatternBase {
  family: 'divergence'
  name: DivergenceName
  oscillator: DivergenceOscillator
  /** The two price pivots and two oscillator pivots forming the divergence. */
  pivots: {
    price1: PatternPoint
    price2: PatternPoint
    osc1: number
    osc2: number
  }
}

// --- Breakouts / breakdowns ------------------------------------------------

export type BreakoutName =
  | 'resistance-breakout'
  | 'support-breakdown'
  | 'sma-breakout'
  | 'sma-breakdown'
  | 'ema-breakout'
  | 'ema-breakdown'
  | 'channel-breakout'
  | 'channel-breakdown'
  | 'range-breakout'
  | 'range-breakdown'
  | 'bolinger-band-breakout'
  | 'bollinger-band-breakdown'
  | 'atr-breakout'
  | 'new-high'
  | 'new-low'
  | 'breakout-retest'
  | 'breakdown-retest'

export interface Breakout extends PatternBase {
  family: 'breakout' | 'breakdown'
  name: BreakoutName
  /** The level that was breached. */
  level: number
  /** Percentage move through the level. */
  penetrationPercent: number
  /** Volume confirmation ratio vs average, when available. */
  volumeConfirmation: number | null
}

// --- Aggregate context -----------------------------------------------------

export type Pattern = CandlestickPattern | ChartPattern | Divergence | Breakout

export interface PatternFamilySummary {
  count: number
  bullish: number
  bearish: number
  neutral: number
}

export interface PatternLifecycle {
  forming: number
  confirmed: number
  mature: number
  failed: number
  complete: number
  invalidated: number
  unavailable: number
}

export interface PatternDetectionContext {
  available: boolean
  instrument: string
  timeframe: string
  generatedAt: string
  /** Whether the source had OHLC (required for candlestick patterns). */
  hasOHLC: boolean
  hasVolume: boolean
  barCount: number

  candlesticks: CandlestickPattern[]
  chartPatterns: ChartPattern[]
  divergences: Divergence[]
  breakouts: Breakout[]

  /** All patterns in one flat list, ordered by patternPriority then recency. */
  all: Pattern[]

  /** Confirmed/mature patterns whose structure is still intact. */
  activePatterns: Pattern[]

  /** Patterns detected within the last `recentWindow` bars. */
  recentPatterns: Pattern[]

  summary: {
    total: number
    byFamily: Record<PatternFamily, PatternFamilySummary>
    lifecycle: PatternLifecycle
    /** Most recent directional lean from confirmed/mature patterns. */
    directionalBias: Direction | 'insufficient-data'
  }

  /** The same signal schema as Phase 2A, so confluence can consume patterns. */
  signals: TechnicalSignal[]

  dataQuality: {
    candleCount: number
    warnings: string[]
    unavailableDetectors: string[]
  }
}
