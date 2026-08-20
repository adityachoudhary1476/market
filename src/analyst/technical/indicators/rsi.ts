import type { Candle, RSIResult, RSIZone, TrendDirection } from '../types'

// Standard Wilder RSI. Returns the full series so callers can read the prior
// value and infer direction.
export function rsiSeries(candles: Candle[], period = 14): (number | null)[] {
  const n = candles.length
  const out: (number | null)[] = new Array(n).fill(null)
  if (n <= period) return out

  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const ch = candles[i].close - candles[i - 1].close
    if (ch >= 0) gain += ch
    else loss -= ch
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 && avgGain === 0 ? 50 : avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period + 1; i < n; i++) {
    const ch = candles[i].close - candles[i - 1].close
    const g = ch > 0 ? ch : 0
    const l = ch < 0 ? -ch : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    // When there are neither gains nor losses (flat series), RSI is 50, not 100.
    out[i] = avgLoss === 0 && avgGain === 0 ? 50 : avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

export function calculateRSI(candles: Candle[], period = 14, overbought = 70, oversold = 30): RSIResult {
  const series = rsiSeries(candles, period)
  let value = series[series.length - 1]
  let previous: number | null = null
  for (let i = series.length - 2; i >= 0; i--) {
    if (series[i] != null) {
      previous = series[i] as number
      break
    }
  }
  if (value != null) value = Number(value.toFixed(2))
  if (previous != null) previous = Number(previous.toFixed(2))

  let direction: TrendDirection = 'insufficient-data'
  if (value != null && previous != null) {
    direction = value > previous + 0.05 ? 'rising' : value < previous - 0.05 ? 'falling' : 'flat'
  }

  let zone: RSIZone | 'insufficient-data' = 'insufficient-data'
  if (value != null) {
    if (value >= overbought) zone = 'overbought'
    else if (value <= oversold) zone = 'oversold'
    else zone = 'neutral'
  }

  return { period, value, previousValue: previous, direction, zone }
}
