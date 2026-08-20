import type {
  Candle,
  Divergence,
  DivergenceName,
  DivergenceOscillator,
  IndicatorContext,
  StructuredTechnicalContext,
} from '../types'
import { pid, round } from '../helpers'
import { rsiSeries } from '../../indicators/rsi'
import { macdSeries } from '../../indicators/macd'
import { mfiSeries } from '../../indicators/mfi'
import { cciSeries } from '../../indicators/cci'
import { williamsRSeries } from '../../indicators/williamsR'
import { calculateIndicators } from '../../indicators'

// ---------------------------------------------------------------------------
// Divergence detector.
//
// Compares consecutive price pivot highs/lows against the corresponding
// oscillator values. Works with RSI, MACD histogram, MFI, CCI and Williams %R
// (whichever are available). No volume/OHLC required beyond what the
// indicators already consumed.
// ---------------------------------------------------------------------------

type OscSeries = { name: DivergenceOscillator; values: (number | null)[] }

function buildOscSeries(
  candles: Candle[],
  indicators: IndicatorContext,
): OscSeries[] {
  const n = candles.length
  const series: OscSeries[] = []
  series.push({ name: 'rsi', values: rsiSeries(candles, indicators.rsi.period) })
  const macd = macdSeries(candles, indicators.macd.fast, indicators.macd.slow, indicators.macd.signalPeriod)
  series.push({ name: 'macd', values: macd.histogram })
  const mfi = mfiSeries(candles, indicators.mfi.period)
  if (mfi) series.push({ name: 'mfi', values: mfi })
  series.push({ name: 'cci', values: cciSeries(candles, indicators.cci.period) })
  const wr = williamsRSeries(candles, indicators.williamsR.period)
  if (wr) series.push({ name: 'williams-r', values: wr })
  return series.filter((s) => s.values.length === n)
}

interface Pivot {
  index: number
  price: number
  osc: number
  t: number
}

function findPivots(candles: Candle[], osc: (number | null)[], lookback: number) {
  const highs: Pivot[] = []
  const lows: Pivot[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true
    let isLow = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (candles[j].high >= candles[i].high) isHigh = false
      if (candles[j].low <= candles[i].low) isLow = false
    }
    if (isHigh && osc[i] != null) highs.push({ index: i, price: candles[i].high, osc: osc[i] as number, t: candles[i].timestamp })
    if (isLow && osc[i] != null) lows.push({ index: i, price: candles[i].low, osc: osc[i] as number, t: candles[i].timestamp })
  }
  return { highs, lows }
}

function divergenceFromPair(
  p1: Pivot,
  p2: Pivot,
  kind: 'high' | 'low',
  oscName: DivergenceOscillator,
  candles: Candle[],
): Divergence | null {
  const priceHigher = p2.price > p1.price
  const priceLower = p2.price < p1.price
  const oscHigher = p2.osc > p1.osc
  const oscLower = p2.osc < p1.osc
  const minMove = 0.0008

  let name: DivergenceName | null = null
  let direction: 'bullish' | 'bearish' = 'bullish'
  if (kind === 'low') {
    if (priceLower && oscHigher && Math.abs(p2.price - p1.price) / p1.price >= minMove) {
      name = 'bullish-regular'; direction = 'bullish'
    } else if (priceHigher && oscLower && Math.abs(p2.price - p1.price) / p1.price >= minMove) {
      name = 'bullish-hidden'; direction = 'bullish'
    }
  } else {
    if (priceHigher && oscLower && Math.abs(p2.price - p1.price) / p1.price >= minMove) {
      name = 'bearish-regular'; direction = 'bearish'
    } else if (priceLower && oscHigher && Math.abs(p2.price - p1.price) / p1.price >= minMove) {
      name = 'bearish-hidden'; direction = 'bearish'
    }
  }
  if (!name) return null

  const isBullish = direction === 'bullish'
  const priceMovePct = (Math.abs(p2.price - p1.price) / p1.price) * 100
  return {
    id: pid(`div-${oscName}-${name}`),
    family: 'divergence',
    name,
    label:
      name === 'bullish-regular' ? 'Bullish Divergence' :
      name === 'bearish-regular' ? 'Bearish Divergence' :
      name === 'bullish-hidden' ? 'Hidden Bullish Divergence' : 'Hidden Bearish Divergence',
    direction,
    status: 'confirmed',
    confidence: 60,
    confidenceBand: 'medium',
    strength: Math.min(85, 40 + priceMovePct * 10),
    detectedAt: candles[candles.length - 1].timestamp,
    barIndex: candles.length - 1,
    invalidationLevel: round(isBullish ? Math.min(p1.price, p2.price) : Math.max(p1.price, p2.price), 2),
    targetLevel: null,
    evidence: [
      `${kind === 'low' ? 'lows' : 'highs'} at ${p1.price.toFixed(2)} → ${p2.price.toFixed(2)}`,
      `${oscName} ${p1.osc.toFixed(2)} → ${p2.osc.toFixed(2)}`,
    ],
    oscillator: oscName,
    pivots: {
      price1: { index: p1.index, timestamp: p1.t, price: round(p1.price, 2), role: 'pivot-1' },
      price2: { index: p2.index, timestamp: p2.t, price: round(p2.price, 2), role: 'pivot-2' },
      osc1: round(p1.osc, 2),
      osc2: round(p2.osc, 2),
    },
    dataRequirements: ['ohlc', oscName],
  }
}

function detectForOscillator(candles: Candle[], osc: OscSeries, lookback: number): Divergence[] {
  const { highs, lows } = findPivots(candles, osc.values, lookback)
  const out: Divergence[] = []
  if (lows.length >= 2) {
    const d = divergenceFromPair(lows[lows.length - 2], lows[lows.length - 1], 'low', osc.name, candles)
    if (d) out.push(d)
  }
  if (highs.length >= 2) {
    const d = divergenceFromPair(highs[highs.length - 2], highs[highs.length - 1], 'high', osc.name, candles)
    if (d) out.push(d)
  }
  return out
}

export function detectDivergences(
  candles: Candle[],
  technical: StructuredTechnicalContext,
  options: { lookback?: number } = {},
): Divergence[] {
  if (candles.length < 30) return []
  const lookback = options.lookback ?? 3
  const hasRange = candles.some((c) => c.high > c.low)
  if (!hasRange) return []

  // Reuse the indicators already computed for the technical context instead
  // of recomputing the full indicator set from the candles.
  const indicators =
    technical?.indicators && technical.indicators.rsi.value != null
      ? technical.indicators
      : calculateIndicators(candles)
  const oscSeriesArr = buildOscSeries(candles, indicators)
  const out: Divergence[] = []
  for (const osc of oscSeriesArr) out.push(...detectForOscillator(candles, osc, lookback))

  const seen = new Set<string>()
  return out.filter((d) => {
    const key = `${d.name}-${d.direction}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
