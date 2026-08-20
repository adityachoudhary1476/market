// ---------------------------------------------------------------------------
// Phase 2C — Confluence & Signal Intelligence Engine types
//
// Combines every piece of machine-readable technical evidence (Phase 2A.1
// indicators + Phase 2B patterns) into a transparent, deterministic confluence
// model. No LLM, no BUY/SELL, no price predictions, no probability estimates.
// Every score is reproducible from the weights table in weights.ts.
// ---------------------------------------------------------------------------

import type { Direction } from '../types'

export type ConfluenceBias = 'bullish' | 'bearish' | 'balanced' | 'insufficient-data'

export type EvidenceSource =
  | 'trend'
  | 'momentum'
  | 'volatility'
  | 'volume'
  | 'structure'
  | 'support-resistance'
  | 'candlestick'
  | 'chart'
  | 'divergence'
  | 'breakout'
  | 'regime'
  | 'historical'

export type EvidenceGroup =
  | 'trend'
  | 'momentum'
  | 'volatility'
  | 'volume'
  | 'structure'
  | 'support-resistance'
  | 'candlestick'
  | 'chart'
  | 'divergence'
  | 'breakout'
  | 'regime'
  | 'historical'

export interface EvidenceItem {
  id: string
  source: EvidenceSource
  group: EvidenceGroup
  name: string
  direction: Direction
  /** 0-100 — magnitude of the evidence (from the underlying metric). */
  strength: number
  /** 0-100 — reliability of the underlying data/indicator. */
  confidence: number
  /** 0-100 — final weight applied after confidence, freshness and status. */
  weight: number
  /** 0-100 — 100 = current bar, decays with age. */
  freshness: number
  timestamp: string | null
  evidence: string[]
  metadata?: Record<string, unknown>
}

export interface EvidenceGroupSummary {
  group: EvidenceGroup
  count: number
  bullish: number
  bearish: number
  neutral: number
  /** Sum of weights of bullish items in the group (0-100). */
  weightedBull: number
  /** Sum of weights of bearish items in the group (0-100). */
  weightedBear: number
  /** -100..100 — positive is bullish. */
  net: number
}

export type ConflictSeverity = 'minor' | 'major'

export interface EvidenceConflict {
  id: string
  severity: ConflictSeverity
  type: string
  description: string
  groupA: EvidenceGroup
  groupB: EvidenceGroup
  directionA: Direction
  directionB: Direction
  evidence: string[]
}

export interface ConfluenceScore {
  /** 0-100 — aggregate weight behind the bullish side. */
  bullish: number
  /** 0-100 — aggregate weight behind the bearish side. */
  bearish: number
  /** -100..100 — positive is bullish. */
  balance: number
  /** 0-100 — how much reliable, fresh, non-conflicting evidence exists. */
  confidence: number
  quality: 'high' | 'medium' | 'low' | 'insufficient-data'
  /** Per-group net contribution, so the score is fully decomposable. */
  contribution: { group: EvidenceGroup; net: number }[]
}

export interface KeyLevel {
  type: 'support' | 'resistance'
  low: number
  high: number
  distancePercent: number | null
  strength: number
  touches: number
}

export interface TimeframeView {
  timeframe: string
  available: boolean
  balance: number | null
  confidence: number | null
  bias: ConfluenceBias | null
}

export interface TimeframeConfluence {
  primary: TimeframeView
  supporting: TimeframeView[]
  alignment: 'aligned' | 'partially-aligned' | 'opposed' | 'insufficient-data'
  /** -100..100 — confidence-weighted agreement of all timeframes. */
  netAgreement: number
}

export type ConditionOperator = 'above' | 'below' | 'crosses-above' | 'crosses-below' | 'is'

export interface ThesisCondition {
  description: string
  metric: string
  value: number | string | boolean
  operator: ConditionOperator
}

export interface TechnicalThesis {
  /** Structured one-liner: bias, balance, confidence, drivers, key risk. */
  summary: string
  bias: ConfluenceBias
  score: ConfluenceScore
  /** Conditions currently TRUE that support the thesis. */
  conditions: ThesisCondition[]
  /** Conditions that would break the thesis. */
  invalidationConditions: ThesisCondition[]
  keyLevels: KeyLevel[]
  supportingGroups: EvidenceGroup[]
  opposingGroups: EvidenceGroup[]
}

/** Optional external hook for historical validation (Phase 2C §28). */
export interface HistoricalValidation {
  bullish: number
  bearish: number
  confidence: number
  note: string
}

export interface ConfluenceOptions {
  /** Per-timeframe technical contexts for multi-timeframe alignment. */
  multiTimeframe?: Record<string, StructuredTechnicalContextLike | undefined>
  /** Market regime from the application layer ('risk-on' etc.). */
  regime?: 'risk-on' | 'risk-off' | 'neutral' | 'mixed' | string
  /** Optional historical validation; only used when provided. Never fabricated. */
  historicalValidation?: HistoricalValidation | null
}

/**
 * Structural subset of StructuredTechnicalContext the confluence engine needs.
 * Defined structurally so the engine can consume contexts without coupling to
 * the full technical engine (which would create a circular import).
 */
export interface StructuredTechnicalContextLike {
  available: boolean
  instrument: string
  timeframe: string
  generatedAt: string
  price?: { current: number } | null
  dataQuality?: {
    candleCount?: number
    hasHighLow?: boolean
    hasVolume?: boolean
    warnings?: string[]
    sufficientHistory?: boolean
  } | null
  signals?: { category: string; name: string; direction: Direction; strength: number; confidence: number; timestamp?: string; evidence: string[]; metadata?: Record<string, unknown> }[] | null
  indicators?: {
    movingAverages?: {
      priceAbove?: Record<string, boolean | null>
      ema?: Record<number, { value: number | null } | undefined>
    } | null
    rsi?: { value: number | null; zone?: string } | null
    macd?: { histogram: number | null; crossover?: string } | null
    bollinger?: { squeeze: boolean; percentB: number | null } | null
    atr?: { percentOfPrice: number | null } | null
  } | null
  trend?: {
    overall?: { direction: string; strength: number; evidence: string[] } | null
    shortTerm?: { direction: string; strength: number; evidence: string[] } | null
    mediumTerm?: { direction: string; strength: number; evidence: string[] } | null
    longTerm?: { direction: string; strength: number; evidence: string[] } | null
  } | null
  volume?: {
    available?: boolean
    relativeVolume?: number | null
    state?: string | null
    priceVolume?: string | null
  } | null
  volatility?: { state: string | null; change: string | null } | null
  structure?: { state: string | null; higherHighs?: number; higherLows?: number; lowerHighs?: number; lowerLows?: number } | null
  supportResistance?: {
    nearestSupport?: { low: number; high: number; strength: number; touches: number } | null
    nearestResistance?: { low: number; high: number; strength: number; touches: number } | null
    distanceToSupportPercent?: number | null
    distanceToResistancePercent?: number | null
    levels?: { type: string; low: number; high: number; strength: number; touches: number }[] | null
  } | null
  patterns?: {
    available?: boolean
    all?: {
      family: string
      name: string
      label: string
      direction: Direction
      status: string
      confidence: number
      strength: number
      detectedAt: number
      barIndex: number
      invalidationLevel: number | null
      targetLevel: number | null
      evidence: string[]
      metadata?: Record<string, unknown>
    }[]
    activePatterns?: {
      family: string
      name: string
      label: string
      direction: Direction
      status: string
      confidence: number
      strength: number
      detectedAt: number
      barIndex: number
      invalidationLevel: number | null
      targetLevel: number | null
      evidence: string[]
      metadata?: Record<string, unknown>
    }[]
    hasOHLC?: boolean
    hasVolume?: boolean
    dataQuality?: { warnings?: string[]; unavailableDetectors?: string[] }
  } | null
}

export interface WeightTableSummary {
  source: EvidenceSource
  base: number
  cap: number
}

export interface TechnicalConfluenceContext {
  available: boolean
  instrument: string
  timeframe: string
  generatedAt: string
  bias: ConfluenceBias
  score: ConfluenceScore
  evidence: EvidenceItem[]
  groups: EvidenceGroupSummary[]
  conflicts: EvidenceConflict[]
  timeframeConfluence: TimeframeConfluence | null
  thesis: TechnicalThesis | null
  dataQuality: {
    candleCount: number
    warnings: string[]
    adjustedFor: string[]
  }
  method: {
    version: string
    weights: WeightTableSummary[]
    saturation: string
    evidenceCount: number
    groupsUsed: number
  }
}