import type { Candle, CCIResult, TrendDirection } from '../types'
import { last, previous } from '../numeric'

export function cciSeries(candles: Candle[], period = 20): (number | null)[] {
  const n = candles.length
  const out: (number | null)[] = new Array(n).fill(null)
  for (let i = period - 1; i < n; i++) {
    const tps: number[] = []
    for (let j = i - period + 1; j <= i; j++) {
      const c = candles[j]
      tps.push((c.high + c.low + c.close) / 3)
    }
    const avg = tps.reduce((a, b) => a + b, 0) / period
    let md = 0
    for (const tp of tps) md += Math.abs(tp - avg)
    md /= period
    out[i] = md === 0 ? 0 : (tps[tps.length - 1] - avg) / (0.015 * md)
  }
  return out
}

export function calculateCCI(candles: Candle[], period = 20, extreme = 100): CCIResult {
  // CCI uses typical price (HLC) — on close-only feeds where high==low it still
  // yields a deterministic value but is less meaningful; we allow it.
  const series = cciSeries(candles, period)
  const value = last(series)
  const prev = previous(series)

  let direction: TrendDirection = 'insufficient-data'
  if (value != null && prev != null) {
    direction = value > prev + 0.5 ? 'rising' : value < prev - 0.5 ? 'falling' : 'flat'
  }

  let zone: CCIResult['zone'] = 'insufficient-data'
  if (value != null) {
    if (value > extreme) zone = 'extreme-high'
    else if (value < -extreme) zone = 'extreme-low'
    else zone = 'neutral'
  }

  return {
    period,
    value: value != null ? Number(value.toFixed(2)) : null,
    zone,
    direction,
  }
}
