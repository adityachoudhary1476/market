import type { Candle, MFIResult, TrendDirection } from '../types'
import { last, previous } from '../numeric'

// MFI requires volume. Returns insufficient-data zones when unavailable.
export function mfiSeries(candles: Candle[], period = 14): (number | null)[] | null {
  if (candles.length <= period) return null
  for (const c of candles) if (c.volume == null || c.volume <= 0) return null

  const n = candles.length
  const out: (number | null)[] = new Array(n).fill(null)
  const rawFlow = candles.map((c, i) => {
    const tp = (c.high + c.low + c.close) / 3
    const prevTp = i > 0 ? (candles[i - 1].high + candles[i - 1].low + candles[i - 1].close) / 3 : tp
    return { mf: tp * (c.volume as number), tp, prevTp }
  })

  let posSum = 0
  let negSum = 0
  for (let i = 1; i <= period; i++) {
    const r = rawFlow[i]
    if (r.tp > r.prevTp) posSum += r.mf
    else if (r.tp < r.prevTp) negSum += r.mf
  }
  const ratio = negSum === 0 ? 100 : posSum / negSum
  out[period] = 100 - 100 / (1 + ratio)

  for (let i = period + 1; i < n; i++) {
    const r = rawFlow[i]
    const add = r.mf
    if (r.tp > r.prevTp) posSum = posSum - posSum / period + add
    else if (r.tp < r.prevTp) negSum = negSum - negSum / period + add
    const rr = negSum === 0 ? 100 : posSum / negSum
    out[i] = 100 - 100 / (1 + rr)
  }
  return out
}

export function calculateMFI(candles: Candle[], period = 14, overbought = 80, oversold = 20): MFIResult {
  const series = mfiSeries(candles, period)
  const value = series ? last(series) ?? null : null
  const prev = series ? previous(series) ?? null : null

  let direction: TrendDirection = 'insufficient-data'
  if (value != null && prev != null) {
    direction = value > prev + 0.05 ? 'rising' : value < prev - 0.05 ? 'falling' : 'flat'
  }

  let zone: MFIResult['zone'] = 'insufficient-data'
  if (value != null) {
    if (value >= overbought) zone = 'overbought'
    else if (value <= oversold) zone = 'oversold'
    else zone = 'neutral'
  }

  return { period, value: value != null ? Number(value.toFixed(2)) : null, zone, direction }
}
