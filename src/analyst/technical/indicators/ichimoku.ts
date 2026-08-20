import type { Candle, IchimokuResult, TrendState } from '../types'

function midpoint(candles: Candle[], period: number, endIdx: number): number | null {
  if (endIdx < period - 1) return null
  let hh = -Infinity
  let ll = Infinity
  for (let i = endIdx - period + 1; i <= endIdx; i++) {
    if (candles[i].high > hh) hh = candles[i].high
    if (candles[i].low < ll) ll = candles[i].low
  }
  return (hh + ll) / 2
}

export function calculateIchimoku(
  candles: Candle[],
  conv = 9,
  base = 26,
  spanBPeriod = 52,
): IchimokuResult {
  const n = candles.length
  const unavailable: IchimokuResult = {
    tenkan: null, kijun: null, senkouA: null, senkouB: null, chikou: null,
    priceAboveCloud: false, priceBelowCloud: false, insideCloud: false,
    cloudDirection: 'insufficient-data', cloudThickness: null,
    tenkanAboveKijun: null, state: 'insufficient-data',
  }
  if (n < base) return unavailable
  for (const c of candles) if (!(c.high > c.low)) return unavailable

  const lastIdx = n - 1
  const tenkan = midpoint(candles, conv, lastIdx)
  const kijun = midpoint(candles, base, lastIdx)
  const senkouA = tenkan != null && kijun != null ? (tenkan + kijun) / 2 : null
  const senkouB = n >= spanBPeriod ? midpoint(candles, spanBPeriod, lastIdx) : null
  const chikou = candles[lastIdx].close
  const price = candles[lastIdx].close

  let priceAboveCloud = false
  let priceBelowCloud = false
  let insideCloud = false
  let cloudDirection: IchimokuResult['cloudDirection'] = 'neutral'
  if (senkouA != null && senkouB != null) {
    const top = Math.max(senkouA, senkouB)
    const bot = Math.min(senkouA, senkouB)
    if (price > top) priceAboveCloud = true
    else if (price < bot) priceBelowCloud = true
    else insideCloud = true
    cloudDirection = senkouA > senkouB ? 'bullish' : senkouA < senkouB ? 'bearish' : 'neutral'
  }

  const tenkanAboveKijun = tenkan != null && kijun != null ? tenkan > kijun : null
  const cloudThickness = senkouA != null && senkouB != null && price !== 0
    ? Number(((Math.abs(senkouA - senkouB) / price) * 100).toFixed(2))
    : null

  let state: TrendState = 'neutral'
  if (priceAboveCloud && tenkanAboveKijun && cloudDirection === 'bullish') state = 'bullish'
  else if (priceBelowCloud && tenkanAboveKijun === false && cloudDirection === 'bearish') state = 'bearish'
  else if (priceAboveCloud || priceBelowCloud) state = 'transitioning'

  return {
    tenkan: tenkan != null ? Number(tenkan.toFixed(2)) : null,
    kijun: kijun != null ? Number(kijun.toFixed(2)) : null,
    senkouA: senkouA != null ? Number(senkouA.toFixed(2)) : null,
    senkouB: senkouB != null ? Number(senkouB.toFixed(2)) : null,
    chikou: Number(chikou.toFixed(2)),
    priceAboveCloud, priceBelowCloud, insideCloud,
    cloudDirection, cloudThickness, tenkanAboveKijun, state,
  }
}
