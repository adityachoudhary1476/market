import type { Candle, CandlestickPattern, CandlestickName, StructuredTechnicalContext } from '../types'
import {
  body,
  bodyPct,
  isBearish,
  isBullish,
  lowerWick,
  pid,
  round,
  upperWick,
} from '../helpers'

// ---------------------------------------------------------------------------
// Candlestick detector.
//
// REQUIRES true OHLC (high > low distinct from close). On close-only feeds it
// returns [] — it never synthesizes wicks. Each detector inspects the most
// recent 1-3 bars. Thresholds are standard and configurable.
//
// Status semantics:
//  - Single/multi-candle patterns are `confirmed` when the final candle of the
//    pattern has closed (the pattern IS the completed candles).
//  - `strength` = geometric magnitude (wick/body ratios, engulfing size);
//    `confidence` = reliability of evidence.
//  - Context metadata (preceding trend, relative volume, nearby S/R) is
//    EVIDENCE ONLY — never scored into a recommendation.
// ---------------------------------------------------------------------------

export interface CandlestickOptions {
  /** Body below this fraction of range counts as a doji. */
  dojiBody?: number
  /** Wick must be at least this multiple of the body for hammer/shooting star. */
  wickRatio?: number
}

/** Optional surrounding-context evidence (from the Phase 2A.1 context). */
export interface CandlestickContext {
  /** Short-term trend direction of the bars preceding the pattern. */
  precedingTrend?: 'bullish' | 'bearish' | 'neutral' | 'insufficient-data'
  /** Current-bar volume / average volume, when volume exists. */
  relativeVolume?: number | null
  /** Nearest support price, when known. */
  nearestSupport?: number | null
  /** Nearest resistance price, when known. */
  nearestResistance?: number | null
}

type Detector = (
  candles: Candle[],
  i: number,
  opts: Required<CandlestickOptions>,
  ctx: CandlestickContext,
) => Omit<CandlestickPattern, 'id' | 'family' | 'detectedAt' | 'barIndex'> | null

function ctxFromTechnical(technical?: StructuredTechnicalContext): CandlestickContext {
  if (!technical) return {}
  const t = technical
  return {
    precedingTrend:
      t.trend.shortTerm.direction === 'bullish' ? 'bullish' :
      t.trend.shortTerm.direction === 'bearish' ? 'bearish' :
      t.trend.shortTerm.direction === 'neutral' ? 'neutral' : 'insufficient-data',
    relativeVolume: t.volume.relativeVolume ?? null,
    nearestSupport: t.supportResistance.nearestSupport?.low ?? null,
    nearestResistance: t.supportResistance.nearestResistance?.low ?? null,
  }
}

const doji: Detector = (candles, i, opts) => {
  const c = candles[i]
  if (bodyPct(c) <= opts.dojiBody) {
    return {
      name: 'doji',
      label: 'Doji',
      direction: 'neutral',
      status: 'confirmed',
      confidence: 60,
      confidenceBand: 'medium',
      strength: 30,
      invalidationLevel: round(c.low, 2),
      targetLevel: null,
      evidence: [`body is ${(bodyPct(c) * 100).toFixed(1)}% of range (indecision)`],
      dataRequirements: ['ohlc'],
    }
  }
  return null
}

const dragonflyDoji: Detector = (candles, i, opts) => {
  const c = candles[i]
  const b = body(c)
  if (b === 0) return null
  const lower = lowerWick(c)
  const upper = upperWick(c)
  if (bodyPct(c) <= opts.dojiBody && lower >= b * 3 && upper <= b * 0.4) {
    return {
      name: 'dragonfly-doji',
      label: 'Dragonfly Doji',
      direction: 'bullish',
      status: 'confirmed',
      confidence: 62,
      confidenceBand: 'medium',
      strength: 50,
      invalidationLevel: round(c.low, 2),
      targetLevel: null,
      evidence: [`long lower wick ${(lower / b).toFixed(1)}× tiny body`],
      dataRequirements: ['ohlc'],
    }
  }
  return null
}

const gravestoneDoji: Detector = (candles, i, opts) => {
  const c = candles[i]
  const b = body(c)
  if (b === 0) return null
  const lower = lowerWick(c)
  const upper = upperWick(c)
  if (bodyPct(c) <= opts.dojiBody && upper >= b * 3 && lower <= b * 0.4) {
    return {
      name: 'gravestone-doji',
      label: 'Gravestone Doji',
      direction: 'bearish',
      status: 'confirmed',
      confidence: 62,
      confidenceBand: 'medium',
      strength: 50,
      invalidationLevel: round(c.high, 2),
      targetLevel: null,
      evidence: [`long upper wick ${(upper / b).toFixed(1)}× tiny body`],
      dataRequirements: ['ohlc'],
    }
  }
  return null
}

const marubozu: Detector = (candles, i) => {
  const c = candles[i]
  const b = body(c)
  const range = c.high - c.low
  if (b === 0 || range === 0) return null
  // Body fills ~all of the range and has negligible wicks.
  if (b / range >= 0.92 && upperWick(c) <= b * 0.05 && lowerWick(c) <= b * 0.05) {
    const bullish = isBullish(c)
    return {
      name: 'marubozu',
      label: bullish ? 'Bullish Marubozu' : 'Bearish Marubozu',
      direction: bullish ? 'bullish' : 'bearish',
      status: 'confirmed',
      confidence: 66,
      confidenceBand: 'medium',
      strength: 70,
      invalidationLevel: round(bullish ? c.low : c.high, 2),
      targetLevel: null,
      evidence: [`body fills ${(b / range * 100).toFixed(0)}% of range with no wicks`],
      dataRequirements: ['ohlc'],
    }
  }
  return null
}

const hammer: Detector = (candles, i, _opts, ctx) => {
  const c = candles[i]
  const b = body(c)
  if (b === 0) return null
  const lower = lowerWick(c)
  const upper = upperWick(c)
  if (lower >= b * 2 && upper <= b * 0.6 && isBullish(c)) {
    const afterDecline = ctx.precedingTrend === 'bearish'
    return {
      name: 'hammer',
      label: 'Hammer',
      direction: 'bullish',
      status: 'confirmed',
      confidence: afterDecline ? 68 : 58,
      confidenceBand: afterDecline ? 'medium' : 'medium',
      strength: Math.min(90, 40 + (lower / b) * 12),
      invalidationLevel: round(c.low, 2),
      targetLevel: null,
      evidence: [
        `lower wick ${(lower / b).toFixed(1)}× body`,
        `upper wick only ${(upper / b).toFixed(1)}× body`,
        afterDecline ? 'formed after a short-term decline' : 'no prior decline detected',
      ],
      dataRequirements: ['ohlc'],
      metadata: {
        bodyRatio: Number((bodyPct(c) * 100).toFixed(1)),
        upperWickRatio: Number((upper / b).toFixed(1)),
        lowerWickRatio: Number((lower / b).toFixed(1)),
        precedingTrend: ctx.precedingTrend,
        relativeVolume: ctx.relativeVolume,
        nearestSupport: ctx.nearestSupport,
      },
    }
  }
  return null
}

const invertedHammer: Detector = (candles, i, _opts, ctx) => {
  const c = candles[i]
  const b = body(c)
  if (b === 0) return null
  const upper = upperWick(c)
  const lower = lowerWick(c)
  if (upper >= b * 2 && lower <= b * 0.6 && isBullish(c)) {
    return {
      name: 'inverted-hammer',
      label: 'Inverted Hammer',
      direction: 'bullish',
      status: 'confirmed',
      confidence: 55,
      confidenceBand: 'medium',
      strength: Math.min(90, 35 + (upper / b) * 10),
      invalidationLevel: round(c.low, 2),
      targetLevel: null,
      evidence: [`upper wick ${(upper / b).toFixed(1)}× body`],
      dataRequirements: ['ohlc'],
      metadata: {
        bodyRatio: Number((bodyPct(c) * 100).toFixed(1)),
        upperWickRatio: Number((upper / b).toFixed(1)),
        lowerWickRatio: Number((lower / b).toFixed(1)),
        precedingTrend: ctx.precedingTrend,
        relativeVolume: ctx.relativeVolume,
      },
    }
  }
  return null
}

const hangingMan: Detector = (candles, i, _opts, ctx) => {
  if (i < 1) return null
  const c = candles[i]
  const p = candles[i - 1]
  const b = body(c)
  if (b === 0) return null
  if (lowerWick(c) >= b * 2 && upperWick(c) <= b * 0.6 && isBearish(c) && isBullish(p)) {
    return {
      name: 'hanging-man',
      label: 'Hanging Man',
      direction: 'bearish',
      status: 'confirmed',
      confidence: ctx.precedingTrend === 'bullish' ? 66 : 54,
      confidenceBand: 'medium',
      strength: Math.min(90, 40 + (lowerWick(c) / b) * 12),
      invalidationLevel: round(c.high, 2),
      targetLevel: null,
      evidence: ['small body at top of prior uptrend', `long lower wick ${(lowerWick(c) / b).toFixed(1)}× body`],
      dataRequirements: ['ohlc'],
      metadata: {
        bodyRatio: Number((bodyPct(c) * 100).toFixed(1)),
        lowerWickRatio: Number((lowerWick(c) / b).toFixed(1)),
        precedingTrend: ctx.precedingTrend,
      },
    }
  }
  return null
}

const shootingStar: Detector = (candles, i, _opts, ctx) => {
  if (i < 1) return null
  const c = candles[i]
  const p = candles[i - 1]
  const b = body(c)
  if (b === 0) return null
  if (upperWick(c) >= b * 2 && lowerWick(c) <= b * 0.6 && isBearish(c) && isBullish(p)) {
    return {
      name: 'shooting-star',
      label: 'Shooting Star',
      direction: 'bearish',
      status: 'confirmed',
      confidence: ctx.precedingTrend === 'bullish' ? 68 : 54,
      confidenceBand: 'medium',
      strength: Math.min(90, 40 + (upperWick(c) / b) * 12),
      invalidationLevel: round(c.high, 2),
      targetLevel: null,
      evidence: [`upper wick ${(upperWick(c) / b).toFixed(1)}× body`],
      dataRequirements: ['ohlc'],
      metadata: {
        bodyRatio: Number((bodyPct(c) * 100).toFixed(1)),
        upperWickRatio: Number((upperWick(c) / b).toFixed(1)),
        precedingTrend: ctx.precedingTrend,
      },
    }
  }
  return null
}

const bullishEngulfing: Detector = (candles, i) => {
  if (i < 1) return null
  const c = candles[i]
  const p = candles[i - 1]
  if (isBearish(p) && isBullish(c) && c.open <= p.close && c.close >= p.open && body(c) > body(p)) {
    return {
      name: 'bullish-engulfing',
      label: 'Bullish Engulfing',
      direction: 'bullish',
      status: 'confirmed',
      confidence: 68,
      confidenceBand: 'medium',
      strength: Math.min(90, 50 + (body(c) / Math.max(0.0001, body(p))) * 10),
      invalidationLevel: round(Math.min(c.low, p.low), 2),
      targetLevel: null,
      evidence: ['current bullish body fully engulfs prior bearish body'],
      dataRequirements: ['ohlc'],
      points: [
        { index: i - 1, timestamp: p.timestamp, price: p.close, role: 'prior-bar' },
        { index: i, timestamp: c.timestamp, price: c.close, role: 'pattern-bar' },
      ],
    }
  }
  return null
}

const bearishEngulfing: Detector = (candles, i) => {
  if (i < 1) return null
  const c = candles[i]
  const p = candles[i - 1]
  if (isBullish(p) && isBearish(c) && c.open >= p.close && c.close <= p.open && body(c) > body(p)) {
    return {
      name: 'bearish-engulfing',
      label: 'Bearish Engulfing',
      direction: 'bearish',
      status: 'confirmed',
      confidence: 68,
      confidenceBand: 'medium',
      strength: Math.min(90, 50 + (body(c) / Math.max(0.0001, body(p))) * 10),
      invalidationLevel: round(Math.max(c.high, p.high), 2),
      targetLevel: null,
      evidence: ['current bearish body fully engulfs prior bullish body'],
      dataRequirements: ['ohlc'],
      points: [
        { index: i - 1, timestamp: p.timestamp, price: p.close, role: 'prior-bar' },
        { index: i, timestamp: c.timestamp, price: c.close, role: 'pattern-bar' },
      ],
    }
  }
  return null
}

const bullishHarami: Detector = (candles, i) => {
  if (i < 1) return null
  const c = candles[i]
  const p = candles[i - 1]
  if (isBearish(p) && isBullish(c) && body(c) < body(p) && c.high <= p.open && c.low >= p.close) {
    return {
      name: 'bullish-harami',
      label: 'Bullish Harami',
      direction: 'bullish',
      status: 'confirmed',
      confidence: 58,
      confidenceBand: 'medium',
      strength: Math.min(80, 40 + (1 - body(c) / Math.max(0.0001, body(p))) * 30),
      invalidationLevel: round(Math.min(c.low, p.low), 2),
      targetLevel: null,
      evidence: ['small bullish body nested inside prior bearish body'],
      dataRequirements: ['ohlc'],
      points: [
        { index: i - 1, timestamp: p.timestamp, price: p.close, role: 'prior-bar' },
        { index: i, timestamp: c.timestamp, price: c.close, role: 'pattern-bar' },
      ],
    }
  }
  return null
}

const bearishHarami: Detector = (candles, i) => {
  if (i < 1) return null
  const c = candles[i]
  const p = candles[i - 1]
  if (isBullish(p) && isBearish(c) && body(c) < body(p) && c.high <= p.close && c.low >= p.open) {
    return {
      name: 'bearish-harami',
      label: 'Bearish Harami',
      direction: 'bearish',
      status: 'confirmed',
      confidence: 58,
      confidenceBand: 'medium',
      strength: Math.min(80, 40 + (1 - body(c) / Math.max(0.0001, body(p))) * 30),
      invalidationLevel: round(Math.max(c.high, p.high), 2),
      targetLevel: null,
      evidence: ['small bearish body nested inside prior bullish body'],
      dataRequirements: ['ohlc'],
      points: [
        { index: i - 1, timestamp: p.timestamp, price: p.close, role: 'prior-bar' },
        { index: i, timestamp: c.timestamp, price: c.close, role: 'pattern-bar' },
      ],
    }
  }
  return null
}

const piercingLine: Detector = (candles, i) => {
  if (i < 1) return null
  const c = candles[i]
  const p = candles[i - 1]
  const mid = (p.open + p.close) / 2
  if (isBearish(p) && isBullish(c) && c.open < p.low && c.close > mid && c.close < p.open) {
    return {
      name: 'piercing-line',
      label: 'Piercing Line',
      direction: 'bullish',
      status: 'confirmed',
      confidence: 64,
      confidenceBand: 'medium',
      strength: Math.min(85, 40 + ((c.close - mid) / Math.max(0.0001, body(p))) * 30),
      invalidationLevel: round(c.low, 2),
      targetLevel: round(p.open, 2),
      evidence: [`close above midpoint of prior bearish candle (${mid.toFixed(2)})`],
      dataRequirements: ['ohlc'],
      points: [
        { index: i - 1, timestamp: p.timestamp, price: p.close, role: 'prior-bar' },
        { index: i, timestamp: c.timestamp, price: c.close, role: 'pattern-bar' },
      ],
    }
  }
  return null
}

const darkCloud: Detector = (candles, i) => {
  if (i < 1) return null
  const c = candles[i]
  const p = candles[i - 1]
  const mid = (p.open + p.close) / 2
  if (isBullish(p) && isBearish(c) && c.open > p.high && c.close < mid && c.close > p.close) {
    return {
      name: 'dark-cloud-cover',
      label: 'Dark Cloud Cover',
      direction: 'bearish',
      status: 'confirmed',
      confidence: 64,
      confidenceBand: 'medium',
      strength: Math.min(85, 40 + ((mid - c.close) / Math.max(0.0001, body(p))) * 30),
      invalidationLevel: round(c.high, 2),
      targetLevel: round(p.close, 2),
      evidence: [`close below midpoint of prior bullish candle (${mid.toFixed(2)})`],
      dataRequirements: ['ohlc'],
      points: [
        { index: i - 1, timestamp: p.timestamp, price: p.close, role: 'prior-bar' },
        { index: i, timestamp: c.timestamp, price: c.close, role: 'pattern-bar' },
      ],
    }
  }
  return null
}

const tweezerTop: Detector = (candles, i) => {
  if (i < 1) return null
  const c = candles[i]
  const p = candles[i - 1]
  // Same highs, first bullish, second bearish (or neutral doji).
  const sameHigh = Math.abs(c.high - p.high) / Math.max(0.0001, p.high) <= 0.005
  if (sameHigh && isBullish(p) && isBearish(c)) {
    return {
      name: 'tweezer-top',
      label: 'Tweezer Top',
      direction: 'bearish',
      status: 'confirmed',
      confidence: 58,
      confidenceBand: 'medium',
      strength: 45,
      invalidationLevel: round(Math.max(c.high, p.high), 2),
      targetLevel: null,
      evidence: ['two bars rejected at the same high'],
      dataRequirements: ['ohlc'],
      points: [
        { index: i - 1, timestamp: p.timestamp, price: p.high, role: 'high-1' },
        { index: i, timestamp: c.timestamp, price: c.high, role: 'high-2' },
      ],
    }
  }
  return null
}

const tweezerBottom: Detector = (candles, i) => {
  if (i < 1) return null
  const c = candles[i]
  const p = candles[i - 1]
  const sameLow = Math.abs(c.low - p.low) / Math.max(0.0001, p.low) <= 0.005
  if (sameLow && isBearish(p) && isBullish(c)) {
    return {
      name: 'tweezer-bottom',
      label: 'Tweezer Bottom',
      direction: 'bullish',
      status: 'confirmed',
      confidence: 58,
      confidenceBand: 'medium',
      strength: 45,
      invalidationLevel: round(Math.min(c.low, p.low), 2),
      targetLevel: null,
      evidence: ['two bars rejected at the same low'],
      dataRequirements: ['ohlc'],
      points: [
        { index: i - 1, timestamp: p.timestamp, price: p.low, role: 'low-1' },
        { index: i, timestamp: c.timestamp, price: c.low, role: 'low-2' },
      ],
    }
  }
  return null
}

const morningStar: Detector = (candles, i, opts) => {
  if (i < 2) return null
  const c = candles[i]
  const p1 = candles[i - 1]
  const p2 = candles[i - 2]
  if (
    isBearish(p2) &&
    body(p1) < body(p2) * opts.wickRatio * 0.3 &&
    isBullish(c) &&
    c.close > (p2.open + p2.close) / 2
  ) {
    return {
      name: 'morning-star',
      label: 'Morning Star',
      direction: 'bullish',
      status: 'confirmed',
      confidence: 70,
      confidenceBand: 'medium',
      strength: 65,
      invalidationLevel: round(Math.min(c.low, p1.low, p2.low), 2),
      targetLevel: round(p2.open, 2),
      evidence: ['small middle body, bullish close into first candle range'],
      dataRequirements: ['ohlc'],
      points: [
        { index: i - 2, timestamp: p2.timestamp, price: p2.close, role: 'bar-1' },
        { index: i - 1, timestamp: p1.timestamp, price: p1.close, role: 'bar-2' },
        { index: i, timestamp: c.timestamp, price: c.close, role: 'bar-3' },
      ],
    }
  }
  return null
}

const eveningStar: Detector = (candles, i, opts) => {
  if (i < 2) return null
  const c = candles[i]
  const p1 = candles[i - 1]
  const p2 = candles[i - 2]
  if (
    isBullish(p2) &&
    body(p1) < body(p2) * opts.wickRatio * 0.3 &&
    isBearish(c) &&
    c.close < (p2.open + p2.close) / 2
  ) {
    return {
      name: 'evening-star',
      label: 'Evening Star',
      direction: 'bearish',
      status: 'confirmed',
      confidence: 70,
      confidenceBand: 'medium',
      strength: 65,
      invalidationLevel: round(Math.max(c.high, p1.high, p2.high), 2),
      targetLevel: round(p2.close, 2),
      evidence: ['small middle body, bearish close into first candle range'],
      dataRequirements: ['ohlc'],
      points: [
        { index: i - 2, timestamp: p2.timestamp, price: p2.close, role: 'bar-1' },
        { index: i - 1, timestamp: p1.timestamp, price: p1.close, role: 'bar-2' },
        { index: i, timestamp: c.timestamp, price: c.close, role: 'bar-3' },
      ],
    }
  }
  return null
}

const threeSoldiers: Detector = (candles, i) => {
  if (i < 2) return null
  const c = candles[i]
  const p1 = candles[i - 1]
  const p2 = candles[i - 2]
  if (
    isBullish(p2) && isBullish(p1) && isBullish(c) &&
    c.close > p1.close && p1.close > p2.close && c.open > p1.open
  ) {
    return {
      name: 'three-white-soldiers',
      label: 'Three White Soldiers',
      direction: 'bullish',
      status: 'confirmed',
      confidence: 72,
      confidenceBand: 'medium',
      strength: 70,
      invalidationLevel: round(p2.low, 2),
      targetLevel: null,
      evidence: ['three consecutive higher bullish closes'],
      dataRequirements: ['ohlc'],
      points: [
        { index: i - 2, timestamp: p2.timestamp, price: p2.close, role: 'bar-1' },
        { index: i - 1, timestamp: p1.timestamp, price: p1.close, role: 'bar-2' },
        { index: i, timestamp: c.timestamp, price: c.close, role: 'bar-3' },
      ],
    }
  }
  return null
}

const threeCrows: Detector = (candles, i) => {
  if (i < 2) return null
  const c = candles[i]
  const p1 = candles[i - 1]
  const p2 = candles[i - 2]
  if (
    isBearish(p2) && isBearish(p1) && isBearish(c) &&
    c.close < p1.close && p1.close < p2.close && c.open < p1.open
  ) {
    return {
      name: 'three-black-crows',
      label: 'Three Black Crows',
      direction: 'bearish',
      status: 'confirmed',
      confidence: 72,
      confidenceBand: 'medium',
      strength: 70,
      invalidationLevel: round(p2.high, 2),
      targetLevel: null,
      evidence: ['three consecutive lower bearish closes'],
      dataRequirements: ['ohlc'],
      points: [
        { index: i - 2, timestamp: p2.timestamp, price: p2.close, role: 'bar-1' },
        { index: i - 1, timestamp: p1.timestamp, price: p1.close, role: 'bar-2' },
        { index: i, timestamp: c.timestamp, price: c.close, role: 'bar-3' },
      ],
    }
  }
  return null
}

const threeInsideUp: Detector = (candles, i) => {
  if (i < 2) return null
  const c = candles[i]
  const p1 = candles[i - 1]
  const p2 = candles[i - 2]
  // Harami (p1 inside p2) followed by a close above p2's open.
  const harami = body(p1) < body(p2) && p1.high <= p2.high && p1.low >= p2.low
  if (isBearish(p2) && harami && isBullish(c) && c.close > p2.open) {
    return {
      name: 'three-inside-up',
      label: 'Three Inside Up',
      direction: 'bullish',
      status: 'confirmed',
      confidence: 66,
      confidenceBand: 'medium',
      strength: 60,
      invalidationLevel: round(Math.min(c.low, p1.low, p2.low), 2),
      targetLevel: round(p2.high, 2),
      evidence: ['bearish bar, harami, then close above the first open'],
      dataRequirements: ['ohlc'],
      points: [
        { index: i - 2, timestamp: p2.timestamp, price: p2.close, role: 'bar-1' },
        { index: i - 1, timestamp: p1.timestamp, price: p1.close, role: 'bar-2' },
        { index: i, timestamp: c.timestamp, price: c.close, role: 'bar-3' },
      ],
    }
  }
  return null
}

const threeInsideDown: Detector = (candles, i) => {
  if (i < 2) return null
  const c = candles[i]
  const p1 = candles[i - 1]
  const p2 = candles[i - 2]
  const harami = body(p1) < body(p2) && p1.high <= p2.high && p1.low >= p2.low
  if (isBullish(p2) && harami && isBearish(c) && c.close < p2.open) {
    return {
      name: 'three-inside-down',
      label: 'Three Inside Down',
      direction: 'bearish',
      status: 'confirmed',
      confidence: 66,
      confidenceBand: 'medium',
      strength: 60,
      invalidationLevel: round(Math.max(c.high, p1.high, p2.high), 2),
      targetLevel: round(p2.low, 2),
      evidence: ['bullish bar, harami, then close below the first open'],
      dataRequirements: ['ohlc'],
      points: [
        { index: i - 2, timestamp: p2.timestamp, price: p2.close, role: 'bar-1' },
        { index: i - 1, timestamp: p1.timestamp, price: p1.close, role: 'bar-2' },
        { index: i, timestamp: c.timestamp, price: c.close, role: 'bar-3' },
      ],
    }
  }
  return null
}

const DETECTORS: Array<{ name: CandlestickName; fn: Detector }> = [
  { name: 'doji', fn: doji },
  { name: 'dragonfly-doji', fn: dragonflyDoji },
  { name: 'gravestone-doji', fn: gravestoneDoji },
  { name: 'marubozu', fn: marubozu },
  { name: 'hammer', fn: hammer },
  { name: 'inverted-hammer', fn: invertedHammer },
  { name: 'hanging-man', fn: hangingMan },
  { name: 'shooting-star', fn: shootingStar },
  { name: 'bullish-engulfing', fn: bullishEngulfing },
  { name: 'bearish-engulfing', fn: bearishEngulfing },
  { name: 'bullish-harami', fn: bullishHarami },
  { name: 'bearish-harami', fn: bearishHarami },
  { name: 'piercing-line', fn: piercingLine },
  { name: 'dark-cloud-cover', fn: darkCloud },
  { name: 'tweezer-top', fn: tweezerTop },
  { name: 'tweezer-bottom', fn: tweezerBottom },
  { name: 'morning-star', fn: morningStar },
  { name: 'evening-star', fn: eveningStar },
  { name: 'three-white-soldiers', fn: threeSoldiers },
  { name: 'three-black-crows', fn: threeCrows },
  { name: 'three-inside-up', fn: threeInsideUp },
  { name: 'three-inside-down', fn: threeInsideDown },
]

export function detectCandlestickPatterns(
  candles: Candle[],
  options: CandlestickOptions = {},
  technical?: StructuredTechnicalContext,
): CandlestickPattern[] {
  const opts: Required<CandlestickOptions> = {
    dojiBody: options.dojiBody ?? 0.07,
    wickRatio: options.wickRatio ?? 2,
  }
  if (candles.length < 3) return []

  // Require at least one candle with a genuine high-low range; otherwise the
  // feed is close-only and candlestick analysis would be meaningless.
  const hasRange = candles.some((c) => c.high > c.low)
  if (!hasRange) return []

  const ctx = ctxFromTechnical(technical)
  const i = candles.length - 1
  const out: CandlestickPattern[] = []
  for (const d of DETECTORS) {
    const result = d.fn(candles, i, opts, ctx)
    if (result) {
      const c = candles[i]
      out.push({
        id: pid(`cdl-${d.name}`),
        family: 'candlestick',
        detectedAt: c.timestamp,
        barIndex: i,
        confirmedAt: c.timestamp,
        ...result,
      })
    }
  }
  return out
}