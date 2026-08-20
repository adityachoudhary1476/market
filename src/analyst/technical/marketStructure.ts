import type { Candle, MarketStructureContext, SwingPoint, TrendState } from './types'

interface StructureParams {
  lookback?: number
  maxSwings?: number
}

export function detectSwings(candles: Candle[], lookback = 2): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = []
  const lows: SwingPoint[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i]
    // In a close-only feed high==low, so swings degenerate; skip if so.
    if (!(c.high > c.low)) continue
    let isHigh = true
    let isLow = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (candles[j].high >= c.high) isHigh = false
      if (candles[j].low <= c.low) isLow = false
    }
    if (isHigh) highs.push({ timestamp: c.timestamp, price: c.high, index: i, strength: lookback })
    if (isLow) lows.push({ timestamp: c.timestamp, price: c.low, index: i, strength: lookback })
  }
  return { highs, lows }
}

export function calculateMarketStructure(
  candles: Candle[],
  params: StructureParams = {},
): MarketStructureContext {
  const lookback = params.lookback ?? 2
  const maxSwings = params.maxSwings ?? 20
  const { highs, lows } = detectSwings(candles, lookback)

  let hh = 0
  let hl = 0
  let lh = 0
  let ll = 0
  for (let i = 1; i < highs.length; i++) {
    if (highs[i].price > highs[i - 1].price) hh++
    else lh++
  }
  for (let i = 1; i < lows.length; i++) {
    if (lows[i].price > lows[i - 1].price) hl++
    else ll++
  }

  let state: MarketStructureContext['state'] = 'insufficient-data'
  const lastHigh = highs.length ? highs[highs.length - 1] : null
  const lastLow = lows.length ? lows[lows.length - 1] : null
  const priorHigh = highs.length > 1 ? highs[highs.length - 2] : null
  const priorLow = lows.length > 1 ? lows[lows.length - 2] : null

  if (highs.length < 2 || lows.length < 2) {
    state = 'insufficient-data'
  } else if (lastHigh && priorHigh && lastLow && priorLow) {
    const higherHigh = lastHigh.price > priorHigh.price
    const higherLow = lastLow.price > priorLow.price
    const lowerHigh = lastHigh.price < priorHigh.price
    const lowerLow = lastLow.price < priorLow.price
    if (higherHigh && higherLow) state = 'bullish'
    else if (lowerHigh && lowerLow) state = 'bearish'
    else if (hh + hl > lh + ll + 2) state = 'bullish'
    else if (lh + ll > hh + hl + 2) state = 'bearish'
    else if (Math.abs(hh + hl - lh - ll) <= 2) state = 'range'
    else state = 'transitioning'
  }

  return {
    recentSwingHighs: highs.slice(-maxSwings),
    recentSwingLows: lows.slice(-maxSwings),
    higherHighs: hh,
    higherLows: hl,
    lowerHighs: lh,
    lowerLows: ll,
    state,
    lastHigh,
    lastLow,
  }
}

export type { TrendState }
