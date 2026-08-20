import type {
  Candle,
  Pattern,
  PatternDetectionContext,
  PatternFamily,
  PatternFamilySummary,
  PatternLifecycle,
  PatternStatus,
  StructuredTechnicalContext,
  TechnicalSignal,
} from './types'
import { detectCandlestickPatterns } from './detectors/candlestickDetector'
import { detectChartPatterns } from './detectors/chartPatternDetector'
import { detectDivergences } from './detectors/divergenceDetector'
import { detectBreakouts } from './detectors/breakoutDetector'
import { confidenceBand, isActiveStatus, patternPriority, resetPatternIdCounter } from './helpers'

// ---------------------------------------------------------------------------
// buildPatternDetectionContext()
//
// Orchestrates the four detectors, produces machine-readable summaries and
// maps every pattern into the same TechnicalSignal schema that Phase 2C's
// confluence engine already understands. No prose, no recommendations.
// ---------------------------------------------------------------------------

function emptySummary(): Record<PatternFamily, PatternFamilySummary> {
  return {
    candlestick: { count: 0, bullish: 0, bearish: 0, neutral: 0 },
    chart: { count: 0, bullish: 0, bearish: 0, neutral: 0 },
    divergence: { count: 0, bullish: 0, bearish: 0, neutral: 0 },
    breakout: { count: 0, bullish: 0, bearish: 0, neutral: 0 },
    breakdown: { count: 0, bullish: 0, bearish: 0, neutral: 0 },
  }
}

function emptyLifecycle(): PatternLifecycle {
  return {
    forming: 0,
    confirmed: 0,
    mature: 0,
    failed: 0,
    complete: 0,
    invalidated: 0,
    unavailable: 0,
  }
}

function patternToSignal(p: Pattern): TechnicalSignal {
  const direction = p.direction
  // Strength derives from confidence (evidence weight). Confidence is capped
  // slightly lower than pure indicator signals because patterns are more
  // interpretive.
  const strength = Math.round(p.confidence * 0.85)
  return {
    id: `sig-${p.id}`,
    category:
      p.family === 'candlestick' ? 'structure' :
      p.family === 'chart' ? 'structure' :
      p.family === 'divergence' ? 'momentum' :
      p.family === 'breakout' ? 'trend' : 'trend',
    name: p.label,
    direction,
    strength,
    confidence: p.confidence,
    timestamp: new Date(p.detectedAt).toISOString(),
    evidence: [
      `${p.family} pattern · ${p.status}`,
      ...p.evidence,
      p.invalidationLevel != null ? `invalidation ${p.invalidationLevel}` : '',
      p.targetLevel != null ? `target ${p.targetLevel}` : '',
    ].filter(Boolean),
    metadata: {
      patternName: p.name,
      family: p.family,
      status: p.status,
      invalidationLevel: p.invalidationLevel ?? undefined,
      targetLevel: p.targetLevel ?? undefined,
      points: p.points?.length ?? 0,
    },
  }
}

function lifecycleOf(patterns: Pattern[]): PatternLifecycle {
  const out = emptyLifecycle()
  for (const p of patterns) {
    out[p.status as PatternStatus]++
  }
  return out
}

export interface BuildPatternOptions {
  candlestick?: Parameters<typeof detectCandlestickPatterns>[1]
  chart?: Parameters<typeof detectChartPatterns>[1]
  divergence?: Parameters<typeof detectDivergences>[2]
  breakout?: Parameters<typeof detectBreakouts>[2]
}

export function buildPatternDetectionContext(
  instrument: string,
  timeframe: string,
  candles: Candle[],
  technical: StructuredTechnicalContext,
  options: BuildPatternOptions = {},
): PatternDetectionContext {
  resetPatternIdCounter()
  const generatedAt = new Date().toISOString()
  const hasOHLC = candles.some((c) => c.high > c.low)
  const hasVolume = candles.some((c) => c.volume != null && c.volume > 0)
  const warnings: string[] = []
  const unavailableDetectors: string[] = []

  if (!hasOHLC) {
    warnings.push('Close-only feed: candlestick and swing-based patterns are limited.')
    unavailableDetectors.push('candlestick')
  }
  if (!hasVolume) warnings.push('Volume unavailable: breakout volume confirmation is disabled.')
  if (candles.length < 60) warnings.push('Fewer than 60 bars: chart-pattern reliability is reduced.')
  if (candles.length < 60) unavailableDetectors.push('chart-cup-and-handle')

  if (candles.length < 10) {
    return {
      available: false,
      instrument,
      timeframe,
      generatedAt,
      hasOHLC,
      hasVolume,
      barCount: candles.length,
      candlesticks: [],
      chartPatterns: [],
      divergences: [],
      breakouts: [],
      all: [],
      activePatterns: [],
      recentPatterns: [],
      summary: {
        total: 0,
        byFamily: emptySummary(),
        lifecycle: emptyLifecycle(),
        directionalBias: 'insufficient-data',
      },
      signals: [],
      dataQuality: {
        candleCount: candles.length,
        warnings: ['Insufficient candles for pattern detection.'],
        unavailableDetectors,
      },
    }
  }

  const candlesticks = hasOHLC ? detectCandlestickPatterns(candles, options.candlestick, technical) : []
  const chartPatterns = detectChartPatterns(candles, options.chart)
  const divergences = detectDivergences(candles, technical, options.divergence)
  const breakouts = detectBreakouts(candles, technical, options.breakout)

  const lastBarIndex = candles.length - 1
  // Deterministic ranking (Phase 2B §24 — NOT a confluence score): structural
  // completeness, confidence, recency, volume evidence.
  const all: Pattern[] = [
    ...candlesticks,
    ...chartPatterns,
    ...divergences,
    ...breakouts,
  ].sort((a, b) => {
    const byPriority = patternPriority(b, lastBarIndex) - patternPriority(a, lastBarIndex)
    return byPriority !== 0 ? byPriority : b.detectedAt - a.detectedAt
  })

  const activePatterns = all.filter((p) => isActiveStatus(p.status))
  const recentPatterns = all.filter((p) => p.barIndex >= lastBarIndex - 4)

  const byFamily = emptySummary()
  for (const p of all) {
    const key: PatternFamily = p.family === 'breakdown' ? 'breakdown' : p.family
    byFamily[key].count++
    if (p.direction === 'bullish') byFamily[key].bullish++
    else if (p.direction === 'bearish') byFamily[key].bearish++
    else byFamily[key].neutral++
  }

  // Only confirmed/mature patterns contribute to directional bias.
  const active = all.filter((p) => p.status === 'confirmed' || p.status === 'mature')
  let directionalBias: PatternDetectionContext['summary']['directionalBias'] = 'neutral'
  if (active.length >= 2) {
    const bull = active.filter((p) => p.direction === 'bullish').length
    const bear = active.filter((p) => p.direction === 'bearish').length
    if (bull >= bear + 2) directionalBias = 'bullish'
    else if (bear >= bull + 2) directionalBias = 'bearish'
    else if (bull === 0 && bear === 0) directionalBias = 'insufficient-data'
  } else {
    directionalBias = 'insufficient-data'
  }

  const signals = all.map(patternToSignal)

  return {
    available: true,
    instrument,
    timeframe,
    generatedAt,
    hasOHLC,
    hasVolume,
    barCount: candles.length,
    candlesticks,
    chartPatterns,
    divergences,
    breakouts,
    all,
    activePatterns,
    recentPatterns,
    summary: {
      total: all.length,
      byFamily,
      lifecycle: lifecycleOf(all),
      directionalBias,
    },
    signals,
    dataQuality: {
      candleCount: candles.length,
      warnings,
      unavailableDetectors,
    },
  }
}

export { confidenceBand }
