// ---------------------------------------------------------------------------
// Phase 2D — validation engine
//
// Pipeline: series → walk-forward scan → event dedup → outcomes → grouped
// statistics → regime/volume/trend breakdowns → HistoricalValidationContext.
//
// Deterministic end to end. Insufficient data produces a structured
// `available: false` result — that is a SUCCESSFUL output, not an error.
// ---------------------------------------------------------------------------

import type { Candle, Direction } from '../types'
import type { HistoricalConfig } from './config'
import { DEFAULT_HISTORICAL_CONFIG, HISTORICAL_METHODOLOGY_VERSION } from './config'
import { scanHistory } from './scanner'
import { clusterEvents } from './dedup'
import { computeSetupOutcome } from './outcomes'
import { qualityFromSample, summarize } from './statistics'
import { findSimilar, setupFromDescriptor } from './similarity'
import type {
  BreakdownSegment,
  BreakoutStatistics,
  EventCluster,
  HistoricalCapabilities,
  HistoricalDataProvider,
  HistoricalEvidenceForConfluence,
  HistoricalSeries,
  HistoricalSetup,
  HistoricalValidationContext,
  HistoricalValidationResult,
  HorizonStatistics,
  SetupOutcome,
} from './types'

export interface ValidationOptions {
  config?: Partial<HistoricalConfig>
  /** When provided, results are similarity-filtered against this setup. */
  query?: { pattern?: string; direction?: Direction }
}

function fullConfig(partial?: Partial<HistoricalConfig>): HistoricalConfig {
  return { ...DEFAULT_HISTORICAL_CONFIG, ...partial }
}

function horizonStatistics(
  returns: (number | null)[],
  mfe: (number | null)[],
  mae: (number | null)[],
  direction: Direction,
): HorizonStatistics {
  const real = returns.filter((v): v is number => v != null && Number.isFinite(v))
  if (real.length === 0) return { count: 0 }
  const s = summarize(real)
  const mfeReal = mfe.filter((v): v is number => v != null && Number.isFinite(v))
  const maeReal = mae.filter((v): v is number => v != null && Number.isFinite(v))
  const mfeSummary = mfeReal.length > 0 ? summarize(mfeReal) : null
  const maeSummary = maeReal.length > 0 ? summarize(maeReal) : null
  const favorable = direction === 'bullish' ? real.filter((v) => v > 0) : real.filter((v) => v < 0)
  return {
    count: real.length,
    meanReturn: s.mean ?? undefined,
    medianReturn: s.median ?? undefined,
    positiveRate: s.positiveRate ?? undefined,
    negativeRate: s.negativeRate ?? undefined,
    p25: s.p25 ?? undefined,
    p75: s.p75 ?? undefined,
    standardDeviation: s.standardDeviation ?? undefined,
    favorableRate: real.length > 0 ? Number(((favorable.length / real.length) * 100).toFixed(1)) : undefined,
    mfe: mfeSummary ? { median: mfeSummary.median ?? undefined, mean: mfeSummary.mean ?? undefined } : undefined,
    mae: maeSummary ? { median: maeSummary.median ?? undefined, mean: maeSummary.mean ?? undefined } : undefined,
  }
}

function breakoutStatistics(outcomes: SetupOutcome[], direction: Direction): BreakoutStatistics {
  const bs = outcomes.map((o) => o.breakout).filter((b): b is NonNullable<SetupOutcome['breakout']> => b != null)
  if (bs.length === 0) {
    return { sampleSize: 0, followThroughRate: null, failedBreakoutRate: null, retestOccurrenceRate: null, retestSuccessRate: null, medianFollowThroughReturn: null, medianBarsToFollowThrough: null }
  }
  const follow = bs.map((b) => b.followThroughReturn).filter((v): v is number => v != null)
  const followed = bs.filter((b) => b.followThroughReturn != null && (direction === 'bullish' ? b.followThroughReturn > 0 : b.followThroughReturn < 0))
  const retests = bs.filter((b) => b.retestOccurred)
  const retestHeld = retests.filter((b) => b.retestHeld === true)
  const bars = bs.map((b) => b.barsToFollowThrough).filter((v): v is number => v != null)
  const barsSummary = bars.length > 0 ? summarize(bars) : null
  const followSummary = follow.length > 0 ? summarize(follow) : null
  return {
    sampleSize: bs.length,
    followThroughRate: bs.length > 0 ? Number(((followed.length / bs.length) * 100).toFixed(1)) : null,
    failedBreakoutRate: bs.length > 0 ? Number(((bs.filter((b) => b.failed).length / bs.length) * 100).toFixed(1)) : null,
    retestOccurrenceRate: bs.length > 0 ? Number(((retests.length / bs.length) * 100).toFixed(1)) : null,
    retestSuccessRate: retests.length > 0 ? Number(((retestHeld.length / retests.length) * 100).toFixed(1)) : null,
    medianFollowThroughReturn: followSummary?.median ?? null,
    medianBarsToFollowThrough: barsSummary?.median ?? null,
  }
}

function breakdowns(
  outcomes: SetupOutcome[],
  config: HistoricalConfig,
  direction: Direction,
): { regime: BreakdownSegment[]; volume: BreakdownSegment[]; trend: BreakdownSegment[] } {
  const by = (key: (o: SetupOutcome) => string) => {
    const map = new Map<string, SetupOutcome[]>()
    for (const o of outcomes) {
      const k = key(o)
      const arr = map.get(k) ?? []
      arr.push(o)
      map.set(k, arr)
    }
    const segments: BreakdownSegment[] = []
    for (const [k, group] of map) {
      if (group.length < config.minimumBreakdownSize) continue
      const returns: number[] = []
      const mfe: number[] = []
      const mae: number[] = []
      for (const o of group) {
        for (const horizon of config.forwardHorizons) {
          const h = o.horizons[String(horizon)]
          if (h?.forwardReturn != null) returns.push(h.forwardReturn)
          if (h?.mfePercent != null) mfe.push(h.mfePercent)
          if (h?.maePercent != null) mae.push(h.maePercent)
        }
      }
      segments.push({
        key: k,
        sampleSize: group.length,
        outcomes: { 'aggregate': horizonStatistics(returns, mfe, mae, direction) },
      })
    }
    return segments
  }
  return { regime: by((o) => o.regime), volume: by((o) => o.volumeBucket), trend: by((o) => o.trendDirection) }
}

function resultForGroup(
  patternKey: string,
  label: string,
  representatives: HistoricalSetup[],
  outcomes: SetupOutcome[],
  config: HistoricalConfig,
  capabilities: HistoricalCapabilities,
  clusters: EventCluster[],
  warnings: string[],
): HistoricalValidationResult {
  const direction = representatives[0]?.direction ?? 'neutral'
  const outcomesMap: Record<string, HorizonStatistics> = {}
  const perHorizon: Record<string, { returns: number[]; mfe: number[]; mae: number[] }> = {}
  for (const horizon of config.forwardHorizons) {
    perHorizon[String(horizon)] = { returns: [], mfe: [], mae: [] }
  }
  for (const o of outcomes) {
    for (const horizon of config.forwardHorizons) {
      const h = o.horizons[String(horizon)]
      if (h?.forwardReturn != null) perHorizon[String(horizon)].returns.push(h.forwardReturn)
      if (h?.mfePercent != null) perHorizon[String(horizon)].mfe.push(h.mfePercent)
      if (h?.maePercent != null) perHorizon[String(horizon)].mae.push(h.maePercent)
    }
  }
  for (const horizon of config.forwardHorizons) {
    const h = perHorizon[String(horizon)]
    outcomesMap[String(horizon)] = horizonStatistics(h.returns, h.mfe, h.mae, direction)
  }

  const pattern = representatives[0]?.pattern ?? null
  const breakout = pattern && (pattern.family === 'breakout' || pattern.family === 'breakdown')
    ? breakoutStatistics(outcomes, direction)
    : undefined
  const b = breakdowns(outcomes, config, direction)

  const complete = capabilities.hasHighLow
  const sampleCount = representatives.length
  return {
    setupDescription: pattern ? `${label} (${pattern.family}, ${pattern.status})` : label,
    pattern: pattern ? { family: pattern.family, name: pattern.name, type: pattern.type, direction: representatives[0].direction } : null,
    sampleSize: sampleCount,
    eventClusterCount: clusters.filter((c) => c.key === patternKey).length,
    quality: qualityFromSample(sampleCount, config, complete),
    outcomes: outcomesMap,
    breakout,
    regimeBreakdown: b.regime,
    volumeBreakdown: b.volume,
    trendBreakdown: b.trend,
    warnings,
    methodology: {
      version: HISTORICAL_METHODOLOGY_VERSION,
      similarityThreshold: config.similarityThreshold,
      horizons: config.forwardHorizons,
      minimumSampleSize: config.minimumSampleSize,
      minimumBarsBetweenMatches: config.minimumBarsBetweenMatches,
    },
  }
}

/** Full walk-forward validation of a historical series, grouped by pattern. */
export function validateHistory(
  series: HistoricalSeries,
  options: ValidationOptions = {},
): HistoricalValidationContext {
  const config = fullConfig(options.config)
  const { candles, capabilities } = series
  const warnings = [...series.warnings]

  if (candles.length < config.minimumHistoricalBars) {
    return {
      available: false,
      instrument: series.instrument,
      timeframe: series.timeframe,
      reason: `Insufficient historical coverage for reliable validation (${candles.length} bars < ${config.minimumHistoricalBars}).`,
      results: [],
      dataQuality: {
        barsAvailable: candles.length,
        firstTimestamp: candles[0]?.timestamp,
        lastTimestamp: candles[candles.length - 1]?.timestamp,
        capabilities,
        source: series.source,
        warnings,
      },
      methodology: {
        version: HISTORICAL_METHODOLOGY_VERSION,
        similarityThreshold: config.similarityThreshold,
        horizons: config.forwardHorizons,
        minimumSampleSize: config.minimumSampleSize,
        minimumBarsBetweenMatches: config.minimumBarsBetweenMatches,
      },
    }
  }

  const scan = scanHistory(series.instrument, candles, series.timeframe, config)
  warnings.push(...scan.warnings)

  if (scan.setups.length === 0) {
    return {
      available: false,
      instrument: series.instrument,
      timeframe: series.timeframe,
      reason: 'No confirmable setups found in the available history.',
      results: [],
      dataQuality: {
        barsAvailable: candles.length,
        firstTimestamp: candles[0]?.timestamp,
        lastTimestamp: candles[candles.length - 1]?.timestamp,
        capabilities,
        source: series.source,
        warnings,
      },
      methodology: {
        version: HISTORICAL_METHODOLOGY_VERSION,
        similarityThreshold: config.similarityThreshold,
        horizons: config.forwardHorizons,
        minimumSampleSize: config.minimumSampleSize,
        minimumBarsBetweenMatches: config.minimumBarsBetweenMatches,
      },
    }
  }

  const { clusters, representatives } = clusterEvents(scan.setups, config)
  const outcomes: SetupOutcome[] = []
  for (const rep of representatives) {
    const o = computeSetupOutcome(rep, candles, capabilities.hasHighLow, capabilities.hasVolume, config)
    if (o) outcomes.push(o)
  }

  // Group representatives by pattern key.
  const groups = new Map<string, HistoricalSetup[]>()
  const outcomeBySetup = new Map(outcomes.map((o) => [o.setupId, o]))
  for (const rep of representatives) {
    const key = rep.pattern ? `${rep.pattern.family}|${rep.pattern.name}` : 'no-pattern'
    const arr = groups.get(key) ?? []
    arr.push(rep)
    groups.set(key, arr)
  }

  let results: HistoricalValidationResult[] = []

  // Optional similarity filtering against a query descriptor.
  if (options.query) {
    const query = setupFromDescriptor(series.instrument, series.timeframe, options.query)
    const { matches, considered, accepted } = findSimilar(query, representatives, config.similarityThreshold, config.maxSimilarityMatchesPerSetup)
    const matched = matches.map((m) => m.setup)
    results = groupsFor(config, capabilities, clusters, matched, outcomeBySetup, warnings)
    results = results.map((r) => ({
      ...r,
      sampleSize: matched.length,
      eventClusterCount: matched.length,
      quality: qualityFromSample(matched.length, config, capabilities.hasHighLow),
    }))
    return {
      available: matched.length > 0,
      instrument: series.instrument,
      timeframe: series.timeframe,
      results,
      currentSetup: {
        setupId: query.id,
        similarHistoricalEvents: matched.length,
        matchesConsidered: considered,
        matchesAccepted: accepted,
        similarityThreshold: config.similarityThreshold,
      },
      dataQuality: {
        barsAvailable: candles.length,
        firstTimestamp: candles[0]?.timestamp,
        lastTimestamp: candles[candles.length - 1]?.timestamp,
        capabilities,
        source: series.source,
        warnings,
      },
      methodology: {
        version: HISTORICAL_METHODOLOGY_VERSION,
        similarityThreshold: config.similarityThreshold,
        horizons: config.forwardHorizons,
        minimumSampleSize: config.minimumSampleSize,
        minimumBarsBetweenMatches: config.minimumBarsBetweenMatches,
      },
    }
  }

  results = groupsFor(config, capabilities, clusters, representatives, outcomeBySetup, warnings)

  return {
    available: results.length > 0,
    instrument: series.instrument,
    timeframe: series.timeframe,
    reason: results.length === 0 ? 'No pattern groups with sufficient outcomes.' : undefined,
    results,
    dataQuality: {
      barsAvailable: candles.length,
      firstTimestamp: candles[0]?.timestamp,
      lastTimestamp: candles[candles.length - 1]?.timestamp,
      capabilities,
      source: series.source,
      warnings,
    },
    methodology: {
      version: HISTORICAL_METHODOLOGY_VERSION,
      similarityThreshold: config.similarityThreshold,
      horizons: config.forwardHorizons,
      minimumSampleSize: config.minimumSampleSize,
      minimumBarsBetweenMatches: config.minimumBarsBetweenMatches,
    },
  }
}

function groupsFor(
  config: HistoricalConfig,
  capabilities: HistoricalCapabilities,
  clusters: EventCluster[],
  reps: HistoricalSetup[],
  outcomeBySetup: Map<string, SetupOutcome>,
  warnings: string[],
): HistoricalValidationResult[] {
  const groups = new Map<string, HistoricalSetup[]>()
  for (const rep of reps) {
    const key = rep.pattern ? `${rep.pattern.family}|${rep.pattern.name}` : 'no-pattern'
    const arr = groups.get(key) ?? []
    arr.push(rep)
    groups.set(key, arr)
  }
  const results: HistoricalValidationResult[] = []
  for (const [key, members] of groups) {
    const label = members[0]?.pattern?.name ?? 'Unpatterned'
    const outcomes = members.map((m) => outcomeBySetup.get(m.id)).filter((o): o is SetupOutcome => o != null)
    if (outcomes.length === 0) continue
    results.push(resultForGroup(key, label, members, outcomes, config, capabilities, clusters, warnings))
  }
  return results.sort((a, b) => b.sampleSize - a.sampleSize)
}

// --- Phase 2C hook producer (§36) -------------------------------------------

/**
 * Build the compact { bullish, bearish, confidence, note } evidence for the
 * Phase 2C historicalValidation hook. Only returns non-null when the sample is
 * large enough and at least medium quality. 5-session horizon is used for the
 * directional rates.
 */
export function historicalEvidenceFor(
  series: HistoricalSeries,
  query: { pattern?: string; direction?: Direction },
  options: ValidationOptions = {},
): HistoricalEvidenceForConfluence | null {
  const config = fullConfig(options.config)
  const ctx = validateHistory(series, { config, query })
  if (!ctx.available || !ctx.results[0]) return null
  const result = ctx.results[0]
  if (result.sampleSize < config.minimumSampleSize) return null
  const h5 = result.outcomes['5'] ?? result.outcomes[Object.keys(result.outcomes)[0]]
  if (!h5 || h5.count === 0) return null

  const direction = result.pattern?.direction ?? query.direction ?? 'neutral'
  const favorableRate = h5.favorableRate ?? (direction === 'bullish' ? h5.positiveRate : h5.negativeRate)
  if (favorableRate == null) return null
  const unfavorableRate = Number((100 - favorableRate).toFixed(1))
  const confidence =
    result.quality === 'high' ? 75 : result.quality === 'medium' ? 60 : 45
  const name = result.pattern?.name ?? 'similar'
  const note =
    `Historical sample of ${result.sampleSize} similar ${name} setups showed favorable 5-session outcomes in ${favorableRate}% of observations (quality ${result.quality}).`
  return {
    bullish: direction === 'bullish' ? favorableRate : unfavorableRate,
    bearish: direction === 'bearish' ? favorableRate : unfavorableRate,
    confidence,
    note,
  }
}

/** Convenience: provider-based validation. */
export function validateWithProvider(
  provider: HistoricalDataProvider,
  instrument: string,
  timeframe: string,
  options: ValidationOptions = {},
): HistoricalValidationContext {
  return validateHistory(provider.getHistory(instrument, timeframe), options)
}

/** Convenience for building a series from raw candles + capabilities. */
export function seriesFromCandles(
  instrument: string,
  timeframe: string,
  candles: Candle[],
  capabilities: HistoricalCapabilities,
  warnings: string[] = [],
): HistoricalSeries {
  return { instrument, timeframe, candles, capabilities, source: 'synthetic-demo', warnings }
}