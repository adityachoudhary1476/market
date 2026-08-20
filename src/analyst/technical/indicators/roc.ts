import type { Candle, ROCResult, TrendDirection } from '../types'
import { last, previous } from '../numeric'

export function rocSeries(candles: Candle[], period = 12): (number | null)[] {
  const n = candles.length
  const out: (number | null)[] = new Array(n).fill(null)
  for (let i = period; i < n; i++) {
    const base = candles[i - period].close
    out[i] = base === 0 ? 0 : ((candles[i].close - base) / base) * 100
  }
  return out
}

export function calculateROC(candles: Candle[], period = 12): ROCResult {
  const series = rocSeries(candles, period)
  const value = last(series)
  const prev = previous(series)
  const older = previous(series, 2)

  let direction: TrendDirection = 'insufficient-data'
  if (value != null && prev != null) {
    direction = value > prev + 0.01 ? 'rising' : value < prev - 0.01 ? 'falling' : 'flat'
  }

  let acceleration: ROCResult['acceleration'] = 'insufficient-data'
  if (value != null && prev != null && older != null) {
    const nowDelta = value - prev
    const prevDelta = prev - older
    if (Math.abs(nowDelta - prevDelta) < 0.01) acceleration = 'flat'
    else if (Math.abs(nowDelta) > Math.abs(prevDelta)) acceleration = 'accelerating'
    else acceleration = 'decelerating'
  }

  return {
    period,
    value: value != null ? Number(value.toFixed(2)) : null,
    direction,
    acceleration,
  }
}
