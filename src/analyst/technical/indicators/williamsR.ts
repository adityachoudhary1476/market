import type { Candle, WilliamsRResult, TrendDirection } from '../types'
import { last, previous } from '../numeric'

export function williamsRSeries(candles: Candle[], period = 14): (number | null)[] | null {
  if (!candles.length) return null
  for (const c of candles) if (!(c.high > c.low)) return null
  const n = candles.length
  const out: (number | null)[] = new Array(n).fill(null)
  for (let i = period - 1; i < n; i++) {
    let hh = -Infinity
    let ll = Infinity
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high
      if (candles[j].low < ll) ll = candles[j].low
    }
    const range = hh - ll
    out[i] = range === 0 ? -50 : ((hh - candles[i].close) / range) * -100
  }
  return out
}

export function calculateWilliamsR(
  candles: Candle[],
  period = 14,
  overbought = -20,
  oversold = -80,
): WilliamsRResult {
  const series = williamsRSeries(candles, period)
  const value = series ? last(series) ?? null : null
  const prev = series ? previous(series) ?? null : null

  let direction: TrendDirection = 'insufficient-data'
  if (value != null && prev != null) {
    direction = value > prev + 0.1 ? 'rising' : value < prev - 0.1 ? 'falling' : 'flat'
  }

  let zone: WilliamsRResult['zone'] = 'insufficient-data'
  if (value != null) {
    if (value >= overbought) zone = 'overbought'
    else if (value <= oversold) zone = 'oversold'
    else zone = 'neutral'
  }

  return {
    period,
    value: value != null ? Number(value.toFixed(2)) : null,
    zone,
    direction,
  }
}
