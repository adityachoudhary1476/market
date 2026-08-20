import type { Candle, MAResult, MovingAverages } from '../types'
import { ema, emaSeries, linearSlope, sma, smaSeries } from '../numeric'

const SMA_PERIODS = [5, 10, 20, 50, 100, 200] as const
const EMA_PERIODS = [5, 9, 12, 20, 21, 26, 50, 100, 200] as const

function buildMAResult(close: number[], period: number, value: number | null, series: (number | null)[]): MAResult {
  const distance = value != null ? close[close.length - 1] - value : null
  return {
    period,
    value: value != null ? Number(value.toFixed(2)) : null,
    distanceFromPrice: distance != null ? Number(distance.toFixed(2)) : null,
    distancePercent: value != null && value !== 0 ? Number((((close[close.length - 1] - value) / value) * 100).toFixed(2)) : null,
    slope: linearSlope(series, 5),
  }
}

export function calculateMovingAverages(candles: Candle[]): MovingAverages {
  const close = candles.map((c) => c.close)
  const price = close[close.length - 1]

  const smaResults: Record<number, MAResult> = {}
  for (const p of SMA_PERIODS) {
    const series = smaSeries(close, p)
    smaResults[p] = buildMAResult(close, p, sma(close, p), series)
  }
  const emaResults: Record<number, MAResult> = {}
  for (const p of EMA_PERIODS) {
    const series = emaSeries(close, p)
    emaResults[p] = buildMAResult(close, p, ema(close, p), series)
  }

  const e9 = ema(close, 9)
  const e20 = ema(close, 20)
  const e50 = ema(close, 50)
  const e200 = ema(close, 200)

  const pairDir = (s: number | null, l: number | null) =>
    s == null || l == null ? 'insufficient-data' : s > l ? 'bullish' : s < l ? 'bearish' : 'neutral'

  const priceAbove: Record<string, boolean | null> = {}
  for (const p of EMA_PERIODS) priceAbove[`ema${p}`] = emaResults[p].value != null ? price >= (emaResults[p].value as number) : null
  for (const p of SMA_PERIODS) priceAbove[`sma${p}`] = smaResults[p].value != null ? price >= (smaResults[p].value as number) : null

  const bullishAlignment = !!(e9 && e20 && e50 && e200 && e9 > e20 && e20 > e50 && e50 > e200)
  const bearishAlignment = !!(e9 && e20 && e50 && e200 && e9 < e20 && e20 < e50 && e50 < e200)

  return {
    sma: smaResults,
    ema: emaResults,
    priceAbove,
    shortAboveLong: {
      ema9Vs20: pairDir(e9, e20),
      ema20Vs50: pairDir(e20, e50),
      ema50Vs200: pairDir(e50, e200),
    },
    alignment: {
      ema9Vs20: pairDir(e9, e20),
      ema20Vs50: pairDir(e20, e50),
      ema50Vs200: pairDir(e50, e200),
    },
    bullishAlignment,
    bearishAlignment,
  }
}
