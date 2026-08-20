import type { Candle, VWAPResult } from '../types'
import { directionOf } from '../numeric'

// Session VWAP requires intraday data with volume. Returns unavailable on
// daily/close-only feeds rather than fabricating a value.
export function calculateVWAP(
  candles: Candle[],
  isIntraday: boolean,
): VWAPResult {
  if (!isIntraday) return { available: false, reason: 'Intraday data required' }
  if (candles.length < 2) return { available: false, reason: 'Insufficient intraday bars' }

  let cumPV = 0
  let cumV = 0
  const series: number[] = []
  for (const c of candles) {
    if (c.volume == null || c.volume <= 0) continue
    const tp = (c.high + c.low + c.close) / 3
    cumPV += tp * c.volume
    cumV += c.volume
    if (cumV > 0) series.push(cumPV / cumV)
  }
  if (series.length < 2 || cumV === 0) {
    return { available: false, reason: 'Insufficient intraday volume' }
  }

  const vwap = series[series.length - 1]
  const price = candles[candles.length - 1].close
  const dist = ((price - vwap) / vwap) * 100

  return {
    available: true,
    vwap: Number(vwap.toFixed(2)),
    priceVsVWAP: price > vwap ? 'above' : price < vwap ? 'below' : 'at',
    distancePercent: Number(dist.toFixed(2)),
    // direction retained for future use; not in the type surface
    ...({ _direction: directionOf(series) } as object),
  }
}
