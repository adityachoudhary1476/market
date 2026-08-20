import type { Candle, OBVResult, TrendDirection } from '../types'

// OBV requires volume. Returns unavailable when the feed has none.
export function obvSeries(candles: Candle[]): number[] | null {
  if (!candles.length) return null
  for (const c of candles) if (c.volume == null || c.volume <= 0) return null
  const out: number[] = new Array(candles.length).fill(0)
  let running = 0
  for (let i = 0; i < candles.length; i++) {
    if (i > 0) {
      if (candles[i].close > candles[i - 1].close) running += candles[i].volume as number
      else if (candles[i].close < candles[i - 1].close) running -= candles[i].volume as number
    }
    out[i] = running
  }
  return out
}

export function calculateOBV(candles: Candle[]): OBVResult {
  const series = obvSeries(candles)
  if (!series) {
    return { value: null, direction: 'insufficient-data', slope: null, available: false, reason: 'Volume data required' }
  }
  const value = series[series.length - 1]
  const lookback = Math.min(5, series.length - 1)
  const prior = series[series.length - 1 - lookback] ?? value
  const change = value - prior

  // simple slope over the last 5 OBV values
  const recent = series.slice(-5)
  const xs = recent.map((_, i) => i)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = recent.reduce((a, b) => a + b, 0) / recent.length
  let num = 0
  let den = 0
  for (let i = 0; i < recent.length; i++) {
    num += (xs[i] - mx) * (recent[i] - my)
    den += (xs[i] - mx) ** 2
  }
  const slope = den === 0 ? 0 : num / den

  let direction: TrendDirection = 'flat'
  if (change > 0) direction = 'rising'
  else if (change < 0) direction = 'falling'

  return { value, direction, slope: Number(slope.toFixed(2)), available: true }
}
