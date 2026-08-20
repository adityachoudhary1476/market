import type { Candle, VolatilityContext, VolatilityState } from './types'
import { calculateATR } from './indicators/atr'
import { calculateBollinger } from './indicators/bollinger'

interface VolatilityParams {
  atrPeriod?: number
  bbPeriod?: number
  bbStd?: number
  thresholds?: [number, number, number] // ATR% thresholds for low/normal/elevated
}

export function calculateVolatility(candles: Candle[], params: VolatilityParams = {}): VolatilityContext {
  const atr = calculateATR(candles, params.atrPeriod ?? 14)
  const bb = calculateBollinger(candles, { period: params.bbPeriod ?? 20, standardDeviation: params.bbStd ?? 2 })

  const price = candles[candles.length - 1]?.close
  const lookback = Math.min(20, candles.length)
  const recent = candles.slice(-lookback)
  const hi = Math.max(...recent.map((c) => c.high))
  const lo = Math.min(...recent.map((c) => c.low))
  const recentRangePercent = price ? Number((((hi - lo) / price) * 100).toFixed(2)) : null

  const [lowT, normalT, elevatedT] = params.thresholds ?? [0.8, 1.5, 2.8]
  let state: VolatilityState | 'insufficient-data' = 'insufficient-data'
  if (atr.percentOfPrice != null) {
    const p = atr.percentOfPrice
    if (p < lowT) state = 'low'
    else if (p < normalT) state = 'normal'
    else if (p < elevatedT) state = 'elevated'
    else state = 'high'
  }

  let change: VolatilityContext['change'] = 'insufficient-data'
  if (bb.expansion !== 'insufficient-data') {
    change = bb.expansion === 'expanding' ? 'expanding' : bb.expansion === 'contracting' ? 'contracting' : 'flat'
  }

  return {
    atr: atr.value,
    atrPercent: atr.percentOfPrice,
    bollingerBandwidth: bb.bandwidth,
    recentRangePercent,
    state,
    change,
  }
}
