// ---------------------------------------------------------------------------
// Phase 2D — Historical Validation & Empirical Pattern Intelligence types
//
// Deterministic, framework-independent. Evaluates how previously observed
// technical setups behaved AFTER they occurred. This is empirical evidence
// for the future AI Analyst — never a prediction, never a recommendation.
// ---------------------------------------------------------------------------

import type { Candle, Direction } from '../types'
import type { ConfluenceBias } from '../confluence/types'

export type HistoricalEvidenceQuality = 'high' | 'medium' | 'low' | 'insufficient'

/** Where the historical candles came from — honesty for consumers. */
export type DataSourceKind = 'exchange' | 'synthetic-demo'

export interface HistoricalCapabilities {
  hasHighLow: boolean
  hasVolume: boolean
}

export interface HistoricalSeries {
  instrument: string
  timeframe: string
  candles: Candle[]
  capabilities: HistoricalCapabilities
  source: DataSourceKind
  warnings: string[]
}

/**
 * Provider abstraction — the engine never depends on a concrete data source.
 * Future exchange/broker/API providers implement this interface.
 */
export interface HistoricalDataProvider {
  getHistory(instrument: string, timeframe: string): HistoricalSeries
}

// --- Snapshot (state at a single timestamp, future-free) --------------------

export interface HistoricalSnapshot {
  timestamp: number
  price: number
  trend: { direction: string; strength: number } | null
  momentum: { bias: string; rsi: number | null } | null
  volatility: { state: string } | null
  volume: { relativeVolume: number | null; state: string } | null
  marketStructure: { state: string } | null
  supportResistance: { distanceToSupportPercent: number | null; distanceToResistancePercent: number | null } | null
  patterns: { family: string; name: string; status: string; direction: Direction }[]
  confluence: { bias: ConfluenceBias; quality: string; balance: number | null } | null
  regime: string
}

// --- Setup (one confirmed event at one timestamp) ---------------------------

export interface HistoricalSetup {
  id: string
  timestamp: number
  barIndex: number
  instrument: string
  timeframe: string
  direction: Direction
  pattern: {
    family: string
    type: string
    name: string
    status: string
    confidence: number
    invalidationLevel: number | null
    targetLevel: number | null
  } | null
  confluence: { bias: string; quality: string } | null
  evidenceSignature: {
    trend?: string
    momentum?: string
    structure?: string
    volume?: string
    volatility?: string
  }
  regime: string
  metadata?: Record<string, unknown>
}

// --- Similarity -------------------------------------------------------------

export interface SimilarityFactor {
  key: string
  label: string
  /** 0-1 — how well this single dimension matches. */
  score: number
  /** Fixed weight of the dimension (transparent, in weights table). */
  weight: number
}

export interface SimilarityResult {
  match: boolean
  /** 0-100 — weighted sum of factor scores. */
  score: number
  factors: SimilarityFactor[]
  explanation: string[]
}

// --- Outcomes ---------------------------------------------------------------

export interface HorizonOutcome {
  /** (close[T+h] − close[T]) / close[T] × 100 — null when T+h does not exist. */
  forwardReturn: number | null
  /** Maximum favorable excursion % within the horizon (genuine H/L only). */
  mfePercent: number | null
  /** Maximum adverse excursion % within the horizon (genuine H/L only). */
  maePercent: number | null
  /** Sessions until the first close beyond +threshold (per timeToThresholdPcts). */
  sessionsToFirstPositiveThreshold: (number | null)[]
  /** Sessions until the first close beyond −threshold. */
  sessionsToFirstNegativeThreshold: (number | null)[]
}

export interface BreakoutOutcome {
  confirmedAt: number
  penetrationPercent: number
  /** Forward return at the first configured horizon ≥ 5 sessions. */
  followThroughReturn: number | null
  failed: boolean
  retestOccurred: boolean
  retestHeld: boolean | null
  /** Sessions from confirmation to first close beyond the broken level. */
  barsToFollowThrough: number | null
}

export interface SetupOutcome {
  setupId: string
  timestamp: number
  pattern: string
  direction: Direction
  regime: string
  trendDirection: string
  volumeBucket: 'high' | 'normal' | 'low' | 'unknown'
  horizons: Record<string, HorizonOutcome>
  breakout: BreakoutOutcome | null
}

// --- Statistics -------------------------------------------------------------

export interface StatisticsSummary {
  count: number
  mean: number | null
  median: number | null
  min: number | null
  max: number | null
  standardDeviation: number | null
  positiveRate: number | null
  negativeRate: number | null
  p25: number | null
  p75: number | null
}

export interface HorizonStatistics {
  count: number
  meanReturn?: number
  medianReturn?: number
  positiveRate?: number
  negativeRate?: number
  /** Share of outcomes that moved in the setup's direction. */
  favorableRate?: number
  p25?: number
  p75?: number
  standardDeviation?: number
  mfe?: { median?: number; mean?: number }
  mae?: { median?: number; mean?: number }
}

export interface BreakoutStatistics {
  sampleSize: number
  followThroughRate: number | null
  failedBreakoutRate: number | null
  retestOccurrenceRate: number | null
  retestSuccessRate: number | null
  medianFollowThroughReturn: number | null
  medianBarsToFollowThrough: number | null
}

// --- Results ----------------------------------------------------------------

export type RegimeLabel = 'risk-on' | 'risk-off' | 'mixed' | 'neutral'

export interface BreakdownSegment {
  key: string
  sampleSize: number
  outcomes: Record<string, HorizonStatistics>
}

export interface HistoricalValidationResult {
  setupDescription: string
  pattern: { family: string; name: string; type: string; direction: Direction } | null
  sampleSize: number
  eventClusterCount: number
  quality: HistoricalEvidenceQuality
  outcomes: Record<string, HorizonStatistics>
  breakout?: BreakoutStatistics
  regimeBreakdown: BreakdownSegment[]
  volumeBreakdown: BreakdownSegment[]
  trendBreakdown: BreakdownSegment[]
  warnings: string[]
  methodology: {
    version: string
    similarityThreshold: number
    horizons: number[]
    minimumSampleSize: number
    minimumBarsBetweenMatches: number
  }
}

export interface HistoricalValidationContext {
  available: boolean
  instrument: string
  timeframe: string
  reason?: string
  results: HistoricalValidationResult[]
  currentSetup?: {
    setupId: string
    similarHistoricalEvents: number
    matchesConsidered: number
    matchesAccepted: number
    similarityThreshold: number
  }
  dataQuality: {
    barsAvailable: number
    firstTimestamp?: number
    lastTimestamp?: number
    capabilities: HistoricalCapabilities
    source: DataSourceKind
    warnings: string[]
  }
  methodology: {
    version: string
    similarityThreshold: number
    horizons: number[]
    minimumSampleSize: number
    minimumBarsBetweenMatches: number
  }
}

/** Compact evidence for the Phase 2C historicalValidation hook. */
export interface HistoricalEvidenceForConfluence {
  bullish: number
  bearish: number
  confidence: number
  note: string
}

export interface EventCluster {
  key: string
  firstTimestamp: number
  count: number
  setupIds: string[]
}