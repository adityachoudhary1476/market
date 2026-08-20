// ---------------------------------------------------------------------------
// Phase 2D — transparent statistics
//
// Deterministic, no randomness. Percentiles use nearest-rank on sorted values.
// The median is treated as a first-class summary because forward returns are
// skewed; the mean is always reported alongside it, never instead of it.
// Every statistic is accompanied by its sample size wherever it is consumed.
// ---------------------------------------------------------------------------

import type { HistoricalEvidenceQuality, StatisticsSummary } from './types'
import type { HistoricalConfig } from './config'

export function sortNumbers(values: number[]): number[] {
  return [...values].sort((a, b) => a - b)
}

/** Nearest-rank percentile on a sorted array. Returns null for empty input. */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
  return sorted[rank - 1]
}

export function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

/** Sample standard deviation (n-1 denominator). */
export function standardDeviation(values: number[], meanValue: number): number | null {
  if (values.length < 2) return null
  const variance = values.reduce((s, v) => s + (v - meanValue) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

export function rate(values: number[], predicate: (v: number) => boolean): number | null {
  if (values.length === 0) return null
  return (values.filter(predicate).length / values.length) * 100
}

/** Full summary of a numeric sample. */
export function summarize(values: number[]): StatisticsSummary {
  const sorted = sortNumbers(values)
  const meanValue = mean(values)
  return {
    count: values.length,
    mean: meanValue != null ? Number(meanValue.toFixed(4)) : null,
    median: median(sorted) != null ? Number(median(sorted)!.toFixed(4)) : null,
    min: sorted.length > 0 ? Number(sorted[0].toFixed(4)) : null,
    max: sorted.length > 0 ? Number(sorted[sorted.length - 1].toFixed(4)) : null,
    standardDeviation: meanValue != null && standardDeviation(values, meanValue) != null
      ? Number(standardDeviation(values, meanValue)!.toFixed(4))
      : null,
    positiveRate: rate(values, (v) => v > 0) != null ? Number(rate(values, (v) => v > 0)!.toFixed(1)) : null,
    negativeRate: rate(values, (v) => v < 0) != null ? Number(rate(values, (v) => v < 0)!.toFixed(1)) : null,
    p25: percentile(sorted, 25) != null ? Number(percentile(sorted, 25)!.toFixed(4)) : null,
    p75: percentile(sorted, 75) != null ? Number(percentile(sorted, 75)!.toFixed(4)) : null,
  }
}

/**
 * Sample-quality bands (documented):
 *   high ≥ config.sampleQualityBands.high   (25)
 *   medium ≥ .medium                        (10)
 *   low ≥ .low                              (5)
 *   insufficient < .low
 * A completeness penalty drops quality by one band when the sample lacks the
 * OHLC (or volume) needed for the statistics being presented.
 */
export function qualityFromSample(count: number, config: HistoricalConfig, complete: boolean): HistoricalEvidenceQuality {
  const b = config.sampleQualityBands
  let q: HistoricalEvidenceQuality =
    count >= b.high ? 'high' : count >= b.medium ? 'medium' : count >= b.low ? 'low' : 'insufficient'
  if (!complete && (q === 'high' || q === 'medium')) {
    q = q === 'high' ? 'medium' : 'low'
  }
  return q
}