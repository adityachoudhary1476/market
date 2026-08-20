import type { Candle, BollingerResult, PricePosition } from '../types'
import { sma, stddevPop, last, previous } from '../numeric'

export interface BollingerParams {
  period?: number
  standardDeviation?: number
}

export function calculateBollinger(candles: Candle[], params: BollingerParams = {}): BollingerResult {
  const period = params.period ?? 20
  const mult = params.standardDeviation ?? 2
  const close = candles.map((c) => c.close)
  const price = close[close.length - 1]

  const insufficient: BollingerResult = {
    period, standardDeviation: mult, upper: null, middle: null, lower: null,
    bandwidth: null, percentB: null, pricePosition: 'insufficient-data',
    squeeze: false, expansion: 'insufficient-data',
  }
  if (close.length < period) return insufficient

  const slice = close.slice(-period)
  const middle = sma(close, period) as number
  const sd = stddevPop(slice)
  const upper = middle + mult * sd
  const lower = middle - mult * sd
  const bandwidth = (upper - lower) / middle
  const percentB = sd === 0 ? 0.5 : (price - lower) / (upper - lower)

  let pricePosition: PricePosition = 'inside'
  if (price > upper) pricePosition = 'above-upper'
  else if (price < lower) pricePosition = 'below-lower'
  else if (price >= upper - (upper - middle) * 0.15) pricePosition = 'near-upper'
  else if (price <= lower + (middle - lower) * 0.15) pricePosition = 'near-lower'

  // historical bandwidth for squeeze/expansion
  const bwSeries: number[] = []
  for (let i = period - 1; i < close.length; i++) {
    const w = close.slice(i - period + 1, i + 1)
    const m = w.reduce((a, b) => a + b, 0) / period
    const s = stddevPop(w)
    bwSeries.push((m + mult * s - (m - mult * s)) / m)
  }
  const avgBw = bwSeries.reduce((a, b) => a + b, 0) / bwSeries.length
  const recentBw = last(bwSeries) as number
  const priorBw = previous(bwSeries) ?? recentBw
  const squeeze = recentBw < avgBw * 0.85
  let expansion: BollingerResult['expansion'] = 'flat'
  if (recentBw > priorBw * 1.02) expansion = 'expanding'
  else if (recentBw < priorBw * 0.98) expansion = 'contracting'

  return {
    period,
    standardDeviation: mult,
    upper: Number(upper.toFixed(2)),
    middle: Number(middle.toFixed(2)),
    lower: Number(lower.toFixed(2)),
    bandwidth: Number(bandwidth.toFixed(4)),
    percentB: Number(percentB.toFixed(3)),
    pricePosition,
    squeeze,
    expansion,
  }
}
