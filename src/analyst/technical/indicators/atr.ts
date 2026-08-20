import type { Candle, ATRResult, TrendDirection, VolatilityState } from '../types'
import { last, previous } from '../numeric'

// ATR requires true range, which needs high/low. When the source is close-only,
// ATR is honestly unavailable (value=null) rather than faked from close range.

export function trueRanges(candles: Candle[]): number[] | null {
  if (!candles.length) return null
  for (const c of candles) {
    if (!(c.high > c.low)) return null // close-only feed
  }
  const tr: number[] = []
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    if (i === 0) tr.push(c.high - c.low)
    else {
      const pc = candles[i - 1].close
      tr.push(Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc)))
    }
  }
  return tr
}

export function atrSeries(candles: Candle[], period = 14): (number | null)[] | null {
  const tr = trueRanges(candles)
  if (!tr) return null
  const out: (number | null)[] = new Array(candles.length).fill(null)
  if (candles.length < period) return out
  let s = 0
  for (let i = 0; i < period; i++) s += tr[i]
  let prev = s / period
  out[period - 1] = prev
  for (let i = period; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period
    out[i] = prev
  }
  return out
}

export function calculateATR(
  candles: Candle[],
  period = 14,
  regimes: [number, number, number] = [0.8, 1.5, 2.8],
): ATRResult {
  const series = atrSeries(candles, period)
  const atr = series ? last(series) : null
  const prevAtr = series ? previous(series) : null
  const price = candles[candles.length - 1]?.close ?? 1
  const percent = atr != null ? (atr / price) * 100 : null

  let direction: TrendDirection = 'insufficient-data'
  if (atr != null && prevAtr != null) {
    direction = atr > prevAtr * 1.01 ? 'rising' : atr < prevAtr * 0.99 ? 'falling' : 'flat'
  }

  let volatilityState: VolatilityState | 'insufficient-data' = 'insufficient-data'
  if (percent != null) {
    const [low, normal, elevated] = regimes
    if (percent < low) volatilityState = 'low'
    else if (percent < normal) volatilityState = 'normal'
    else if (percent < elevated) volatilityState = 'elevated'
    else volatilityState = 'high'
  }

  return {
    period,
    value: atr != null ? Number(atr.toFixed(4)) : null,
    percentOfPrice: percent != null ? Number(percent.toFixed(2)) : null,
    direction,
    volatilityState,
  }
}
