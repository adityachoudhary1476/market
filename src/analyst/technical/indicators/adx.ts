import type { Candle, ADXResult, Direction, TrendStrength } from '../types'
import { last } from '../numeric'

// ADX needs high/low. Returns insufficient-data on close-only feeds.

export function calculateADX(candles: Candle[], period = 14): ADXResult {
  const insufficient: ADXResult = {
    period, adx: null, plusDI: null, minusDI: null,
    trendStrength: 'insufficient-data', direction: 'insufficient-data',
  }
  const n = candles.length
  if (n < period * 2) return insufficient
  for (const c of candles) if (!(c.high > c.low)) return insufficient

  const plusDM: number[] = [0]
  const minusDM: number[] = [0]
  const tr: number[] = [candles[0].high - candles[0].low]

  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high
    const down = candles[i - 1].low - candles[i].low
    plusDM.push(up > down && up > 0 ? up : 0)
    minusDM.push(down > up && down > 0 ? down : 0)
    const pc = candles[i - 1].close
    tr.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - pc), Math.abs(candles[i].low - pc)))
  }

  const smooth = (vals: number[]): number[] => {
    const out: number[] = []
    let s = 0
    for (let i = 0; i < period; i++) s += vals[i]
    let p = s
    out[period - 1] = p
    for (let i = period; i < vals.length; i++) {
      p = p - p / period + vals[i]
      out[i] = p
    }
    return out
  }

  const trS = smooth(tr)
  const plusS = smooth(plusDM)
  const minusS = smooth(minusDM)

  const plusDI: number[] = []
  const minusDI: number[] = []
  const dx: number[] = []
  for (let i = period - 1; i < n; i++) {
    const trVal = trS[i] || 1
    const pdi = (plusS[i] / trVal) * 100
    const mdi = (minusS[i] / trVal) * 100
    plusDI[i] = pdi
    minusDI[i] = mdi
    const sum = pdi + mdi
    dx[i] = sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100
  }

  const validDx = dx.slice(period - 1).filter((v) => v != null)
  if (validDx.length < period) return insufficient
  let adxPrev = validDx.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < validDx.length; i++) {
    adxPrev = (adxPrev * (period - 1) + validDx[i]) / period
  }

  const adx = Number(adxPrev.toFixed(2))
  const pdi = Number((last(plusDI) ?? 0).toFixed(2))
  const mdi = Number((last(minusDI) ?? 0).toFixed(2))

  let trendStrength: TrendStrength = 'weak'
  if (adx >= 40) trendStrength = 'strong'
  else if (adx >= 25) trendStrength = 'established'
  else if (adx >= 20) trendStrength = 'emerging'
  else trendStrength = 'weak'

  let direction: Direction | 'insufficient-data' = 'neutral'
  if (pdi > mdi + 0.5) direction = 'bullish'
  else if (mdi > pdi + 0.5) direction = 'bearish'

  return { period, adx, plusDI: pdi, minusDI: mdi, trendStrength, direction }
}
