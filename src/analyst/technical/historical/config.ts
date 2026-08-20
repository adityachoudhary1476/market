// ---------------------------------------------------------------------------
// Phase 2D — central configuration
//
// Every tuning knob lives here. Nothing is scattered as a magic number.
// Changing methodology constants MUST bump HISTORICAL_METHODOLOGY_VERSION so
// consumers can detect that statistics are no longer comparable.
// ---------------------------------------------------------------------------

export const HISTORICAL_METHODOLOGY_VERSION = '2D.1'

export interface HistoricalConfig {
  /** Minimum bars required before a setup can be scanned at all. */
  minimumHistoricalBars: number
  /** Minimum similar events before statistics are considered reliable. */
  minimumSampleSize: number
  /** Horizons smaller than this many forward bars are not scanned. */
  minimumForwardBars: number
  /** Same (family, name, direction) events closer than this many bars are one cluster. */
  minimumBarsBetweenMatches: number
  /** 0-1 — setups below this similarity are excluded from a query result. */
  similarityThreshold: number
  /** Forward horizons (sessions) for outcome statistics. */
  forwardHorizons: number[]
  /** Thresholds (%) for "time to first threshold" outcomes. */
  timeToThresholdPcts: number[]
  /** Minimum count for each sample-quality band. */
  sampleQualityBands: { high: number; medium: number; low: number }
  /** Minimum count before a regime/volume/trend breakdown is reported. */
  minimumBreakdownSize: number
  /** Cap on similar matches retained per result (result-size safety). */
  maxSimilarityMatchesPerSetup: number
  /** Technical engine timeframes the scanner may build contexts for. */
  supportedTechnicalTimeframes: ('intraday' | 'daily' | 'weekly')[]
}

export const DEFAULT_HISTORICAL_CONFIG: HistoricalConfig = {
  minimumHistoricalBars: 120,
  minimumSampleSize: 10,
  minimumForwardBars: 20,
  minimumBarsBetweenMatches: 5,
  similarityThreshold: 0.6,
  forwardHorizons: [1, 3, 5, 10, 20],
  timeToThresholdPcts: [0.5, 1.0],
  sampleQualityBands: { high: 25, medium: 10, low: 5 },
  minimumBreakdownSize: 3,
  maxSimilarityMatchesPerSetup: 200,
  supportedTechnicalTimeframes: ['intraday', 'daily', 'weekly'],
}