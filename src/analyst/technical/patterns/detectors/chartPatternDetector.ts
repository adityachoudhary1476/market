import type { Candle, ChartPattern, ChartPatternName, PatternPoint, PatternStatus } from '../types'
import { near, pid, round } from '../helpers'

// ---------------------------------------------------------------------------
// Chart-pattern detector.
//
// Operates on a configurable window of recent candles and identifies
// classical patterns from swing pivots. It produces EVIDENCE (pivots,
// boundaries, target, invalidation) and never a trading recommendation.
//
// Data capability:
//  - OHLC feeds use genuine swing highs/lows.
//  - Close-only feeds (high==low everywhere) fall back to close-based pivots
//    so structure detection still works, marked metadata.pivotSource='close'
//    and with confidence reduced. If fewer than 2 pivots exist, returns [].
//
// Lifecycle:
//  - forming: structure exists, confirmation not met
//  - confirmed: neckline/boundary broken in the pattern's direction
//  - invalidated: price breaks the OPPOSITE side of the pattern structure
//    (e.g. double top closes above its peaks, double bottom closes below its
//    lows, ascending triangle closes below support)
//  - cup-and-handle with insufficient history: 'unavailable'
// ---------------------------------------------------------------------------

export interface ChartPatternOptions {
  /** Number of recent bars to scan. */
  window?: number
  /** Pivot strength: a high/low must exceed `lookback` bars on each side. */
  lookback?: number
  /** Two pivots "match" as a double/triple if within this % tolerance. */
  pivotTolerancePct?: number
  /** Minimum bars between the two pivots of a double top/bottom. */
  minSeparation?: number
  /** Minimum touches for a triangle/channel boundary line. */
  minBoundaryTouches?: number
}

interface Pivot {
  index: number
  price: number
  t: number
}

interface Pivots {
  highs: Pivot[]
  lows: Pivot[]
}

/** Identify fractal pivot highs/lows in the candle window. */
function findPivots(candles: Candle[], lookback: number, startIdx: number): Pivots {
  const hasHighLow = candles.some((c) => c.high > c.low)
  const highs: Pivots['highs'] = []
  const lows: Pivots['lows'] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const high = hasHighLow ? candles[i].high : candles[i].close
    const low = hasHighLow ? candles[i].low : candles[i].close
    let isHigh = true
    let isLow = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      const cjHigh = hasHighLow ? candles[j].high : candles[j].close
      const cjLow = hasHighLow ? candles[j].low : candles[j].close
      if (cjHigh >= high) isHigh = false
      if (cjLow <= low) isLow = false
    }
    if (isHigh) highs.push({ index: startIdx + i, price: high, t: candles[i].timestamp })
    if (isLow) lows.push({ index: startIdx + i, price: low, t: candles[i].timestamp })
  }
  return { highs, lows }
}

/** Simple best-fit line (slope, intercept) via least squares. */
function fitLine(points: Array<{ index: number; price: number }>): { slope: number; intercept: number } | null {
  if (points.length < 2) return null
  const n = points.length
  const sx = points.reduce((a, p) => a + p.index, 0)
  const sy = points.reduce((a, p) => a + p.price, 0)
  const sxx = points.reduce((a, p) => a + p.index * p.index, 0)
  const sxy = points.reduce((a, p) => a + p.index * p.price, 0)
  const denom = n * sxx - sx * sx
  if (denom === 0) return null
  const slope = (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n
  return { slope, intercept }
}

function toPatternPoint(p: { index: number; price: number; t: number }, role: string): PatternPoint {
  return { index: p.index, timestamp: p.t, price: round(p.price, 2), role }
}

const FLAT_SLOPE = 0.0005
const PARALLEL_SLOPE_DELTA = 0.0008

// --- Double / triple tops & bottoms ---------------------------------------
//
// Only the MOST RECENT matched structure is reported (the one whose second
// peak is nearest the right edge). Historical coincidences of near-equal
// pivots are not patterns — a double top is the structure price is currently
// working through, not every similar pair in the dataset.
const MIN_DEPTH_PCT = 0.025
/** A right shoulder/peak older than this many bars is history, not a live pattern (unless confirmed). */
const LIVE_WINDOW = 20

function findReversalPatterns(
  pivots: Pivots,
  tol: number,
  minSep: number,
  candles: Candle[],
): ChartPattern[] {
  const out: ChartPattern[] = []
  const lastClose = candles[candles.length - 1].close

  // Double top: two near-equal highs, with a trough between them.
  for (let j = pivots.highs.length - 1; j >= 1; j--) {
    const b = pivots.highs[j]
    let matched = false
    for (let i = j - 1; i >= 0; i--) {
      const a = pivots.highs[i]
      if (b.index - a.index < minSep) continue
      if (!near(a.price, b.price, tol)) continue
      const trough = pivots.lows.find((l) => l.index > a.index && l.index < b.index)
      if (!trough) continue
      // Structural integrity: the neckline trough must not undercut the last
      // swing low before the first peak (otherwise the "pattern" is a
      // continuation of a decline, not a double top).
      const priorLow = [...pivots.lows].reverse().find((l) => l.index < a.index)
      if (priorLow && trough.price < priorLow.price) continue
      // The two peaks must be the two highest highs of the pattern span.
      const maxBetween = pivots.highs
        .filter((h) => h.index > a.index && h.index < b.index)
        .reduce((m, h) => Math.max(m, h.price), 0)
      if (maxBetween >= Math.min(a.price, b.price)) continue
      // Only a recent second peak is a live pattern.
      if (candles.length - 1 - b.index > LIVE_WINDOW) continue
      const neckline = trough.price
      const depth = a.price - neckline
      if (depth / a.price < MIN_DEPTH_PCT) continue
      const points: PatternPoint[] = [toPatternPoint(a, 'peak-1'), toPatternPoint(b, 'peak-2'), toPatternPoint(trough, 'neckline')]
      // Lifecycle: close below neckline confirms; close above the peaks
      // invalidates the pattern structure entirely.
      let status: PatternStatus = 'forming'
      if (lastClose > Math.max(a.price, b.price)) status = 'invalidated'
      else if (lastClose < neckline) status = 'confirmed'
      const separation = b.index - a.index
      const similarity = Math.abs(a.price - b.price) / Math.max(a.price, b.price)
      out.push({
        id: pid('chart-double-top'),
        family: 'chart',
        name: 'double-top',
        label: 'Double Top',
        direction: 'bearish',
        status,
        confidence: status === 'confirmed' ? 70 : status === 'invalidated' ? 40 : 55,
        confidenceBand: status === 'confirmed' ? 'medium' : status === 'invalidated' ? 'low' : 'low',
        strength: Math.min(90, 45 + separation * 2),
        detectedAt: candles[candles.length - 1].timestamp,
        barIndex: candles.length - 1,
        startIndex: a.index,
        endIndex: candles.length - 1,
        invalidationLevel: round(Math.max(a.price, b.price), 2),
        targetLevel: round(neckline - depth, 2),
        evidence: [
          `two highs at ${a.price.toFixed(2)} and ${b.price.toFixed(2)} within ${(tol * 100).toFixed(1)}%`,
          `separation ${separation} bars`,
          status === 'confirmed' ? 'price closed below neckline' :
          status === 'invalidated' ? 'price closed above the pattern highs' : 'neckline not yet broken',
        ],
        points,
        dataRequirements: ['ohlc-or-close-pivots'],
        metadata: {
          firstPeak: round(a.price, 2),
          secondPeak: round(b.price, 2),
          neckline: round(neckline, 2),
          peakSimilarity: Number((similarity * 100).toFixed(2)),
          separation,
          breakoutStatus: status === 'confirmed' ? 'broken-down' : status === 'invalidated' ? 'invalidated' : 'intact',
        },
      })
      matched = true
      break
    }
    if (matched) break
  }

  // Double bottom
  for (let j = pivots.lows.length - 1; j >= 1; j--) {
    const b = pivots.lows[j]
    let matched = false
    for (let i = j - 1; i >= 0; i--) {
      const a = pivots.lows[i]
      if (b.index - a.index < minSep) continue
      if (!near(a.price, b.price, tol)) continue
      const peak = pivots.highs.find((h) => h.index > a.index && h.index < b.index)
      if (!peak) continue
      // Structural integrity: the neckline peak must be a lower high than the
      // last swing high before the first low (the pattern forms inside a
      // decline, not after a breakout).
      const priorHigh = [...pivots.highs].reverse().find((h) => h.index < a.index)
      if (priorHigh && peak.price >= priorHigh.price) continue
      // Only a recent second low is a live pattern.
      if (candles.length - 1 - b.index > LIVE_WINDOW) continue
      const neckline = peak.price
      const depth = neckline - a.price
      if (depth / a.price < MIN_DEPTH_PCT) continue
      const points: PatternPoint[] = [toPatternPoint(a, 'low-1'), toPatternPoint(b, 'low-2'), toPatternPoint(peak, 'neckline')]
      let status: PatternStatus = 'forming'
      if (lastClose < Math.min(a.price, b.price)) status = 'invalidated'
      else if (lastClose > neckline) status = 'confirmed'
      const separation = b.index - a.index
      out.push({
        id: pid('chart-double-bottom'),
        family: 'chart',
        name: 'double-bottom',
        label: 'Double Bottom',
        direction: 'bullish',
        status,
        confidence: status === 'confirmed' ? 70 : status === 'invalidated' ? 40 : 55,
        confidenceBand: status === 'confirmed' ? 'medium' : status === 'invalidated' ? 'low' : 'low',
        strength: Math.min(90, 45 + separation * 2),
        detectedAt: candles[candles.length - 1].timestamp,
        barIndex: candles.length - 1,
        startIndex: a.index,
        endIndex: candles.length - 1,
        invalidationLevel: round(Math.min(a.price, b.price), 2),
        targetLevel: round(neckline + depth, 2),
        evidence: [
          `two lows at ${a.price.toFixed(2)} and ${b.price.toFixed(2)} within ${(tol * 100).toFixed(1)}%`,
          `separation ${separation} bars`,
          status === 'confirmed' ? 'price closed above neckline' :
          status === 'invalidated' ? 'price closed below the pattern lows' : 'neckline not yet broken',
        ],
        points,
        dataRequirements: ['ohlc-or-close-pivots'],
        metadata: {
          firstBottom: round(a.price, 2),
          secondBottom: round(b.price, 2),
          neckline: round(neckline, 2),
          peakSimilarity: Number((Math.abs(a.price - b.price) / Math.max(a.price, b.price) * 100).toFixed(2)),
          separation,
          breakoutStatus: status === 'confirmed' ? 'broken-up' : status === 'invalidated' ? 'invalidated' : 'intact',
        },
      })
      matched = true
      break
    }
    if (matched) break
  }

  // Triple top: three near-equal highs (most recent match only).
  const matchedHighs = matchTriple(pivots.highs, tol, minSep)
  if (matchedHighs) {
    const [a, b, c] = matchedHighs
    // Only a recent third peak is a live pattern.
    if (candles.length - 1 - c.index <= LIVE_WINDOW) {
      const troughs = pivots.lows.filter((l) => l.index > a.index && l.index < c.index)
      if (troughs.length >= 2) {
        const neckline = Math.min(...troughs.map((t) => t.price))
        const depth = a.price - neckline
        if (depth / a.price >= MIN_DEPTH_PCT) {
          let status: PatternStatus = 'forming'
          if (lastClose > Math.max(a.price, b.price, c.price)) status = 'invalidated'
          else if (lastClose < neckline) status = 'confirmed'
          out.push({
            id: pid('chart-triple-top'),
            family: 'chart',
            name: 'triple-top',
            label: 'Triple Top',
            direction: 'bearish',
            status,
            confidence: status === 'confirmed' ? 72 : status === 'invalidated' ? 42 : 58,
            confidenceBand: status === 'confirmed' ? 'medium' : 'low',
            strength: Math.min(90, 50 + (c.index - a.index) * 1.5),
            detectedAt: candles[candles.length - 1].timestamp,
            barIndex: candles.length - 1,
            startIndex: a.index,
            endIndex: candles.length - 1,
            invalidationLevel: round(Math.max(a.price, b.price, c.price), 2),
            targetLevel: round(neckline - depth, 2),
            evidence: [`three matched highs near ${a.price.toFixed(2)}`],
            points: [toPatternPoint(a, 'high-1'), toPatternPoint(b, 'high-2'), toPatternPoint(c, 'high-3')],
            dataRequirements: ['ohlc-or-close-pivots'],
            metadata: { breakoutStatus: status === 'confirmed' ? 'broken-down' : status === 'invalidated' ? 'invalidated' : 'intact' },
          })
        }
      }
    }
  }

  // Triple bottom
  const matchedLows = matchTriple(pivots.lows, tol, minSep)
  if (matchedLows) {
    const [a, b, c] = matchedLows
    // Only a recent third low is a live pattern.
    if (candles.length - 1 - c.index <= LIVE_WINDOW) {
      const peaks = pivots.highs.filter((h) => h.index > a.index && h.index < c.index)
      if (peaks.length >= 2) {
        const neckline = Math.max(...peaks.map((h) => h.price))
        const depth = neckline - a.price
        if (depth / a.price >= MIN_DEPTH_PCT) {
          let status: PatternStatus = 'forming'
          if (lastClose < Math.min(a.price, b.price, c.price)) status = 'invalidated'
          else if (lastClose > neckline) status = 'confirmed'
          out.push({
            id: pid('chart-triple-bottom'),
            family: 'chart',
            name: 'triple-bottom',
            label: 'Triple Bottom',
            direction: 'bullish',
            status,
            confidence: status === 'confirmed' ? 72 : status === 'invalidated' ? 42 : 58,
            confidenceBand: status === 'confirmed' ? 'medium' : 'low',
            strength: Math.min(90, 50 + (c.index - a.index) * 1.5),
            detectedAt: candles[candles.length - 1].timestamp,
            barIndex: candles.length - 1,
            startIndex: a.index,
            endIndex: candles.length - 1,
            invalidationLevel: round(Math.min(a.price, b.price, c.price), 2),
            targetLevel: round(neckline + depth, 2),
            evidence: [`three matched lows near ${a.price.toFixed(2)}`],
            points: [toPatternPoint(a, 'low-1'), toPatternPoint(b, 'low-2'), toPatternPoint(c, 'low-3')],
            dataRequirements: ['ohlc-or-close-pivots'],
            metadata: { breakoutStatus: status === 'confirmed' ? 'broken-up' : status === 'invalidated' ? 'invalidated' : 'intact' },
          })
        }
      }
    }
  }

  return out
}

function matchTriple(
  pivots: Pivot[],
  tol: number,
  minSep: number,
): [Pivot, Pivot, Pivot] | null {
  for (let k = pivots.length - 1; k >= 2; k--) {
    for (let j = k - 1; j >= 1; j--) {
      if (pivots[k].index - pivots[j].index < minSep) continue
      if (!near(pivots[j].price, pivots[k].price, tol)) continue
      for (let i = j - 1; i >= 0; i--) {
        if (pivots[j].index - pivots[i].index < minSep) continue
        if (near(pivots[i].price, pivots[j].price, tol) && near(pivots[i].price, pivots[k].price, tol)) {
          return [pivots[i], pivots[j], pivots[k]]
        }
      }
    }
  }
  return null
}

// --- Head & shoulders ------------------------------------------------------

function findHeadAndShoulders(
  pivots: Pivots,
  tol: number,
  candles: Candle[],
): ChartPattern[] {
  const out: ChartPattern[] = []
  const lastClose = candles[candles.length - 1].close
  // Bearish head & shoulders: three highs, middle higher. Only the most
  // recent completed structure is reported.
  for (let i = pivots.highs.length - 3; i >= 0; i--) {
    const ls = pivots.highs[i]
    const head = pivots.highs[i + 1]
    const rs = pivots.highs[i + 2]
    if (head.price <= ls.price * 1.005 || head.price <= rs.price * 1.005) continue
    if (!near(ls.price, rs.price, tol * 1.5)) continue
    // neckline from the lows between ls-head and head-rs
    const l1 = pivots.lows.find((l) => l.index > ls.index && l.index < head.index)
    const l2 = pivots.lows.find((l) => l.index > head.index && l.index < rs.index)
    if (!l1 || !l2) continue
    // Only a recent right shoulder is a live pattern; an old one that never
    // confirmed is historical noise.
    const lastBarIndex = candles.length - 1
    const old = rs.index < lastBarIndex - LIVE_WINDOW
    const neckline = (l1.price + l2.price) / 2
    const depth = head.price - neckline
    let status: PatternStatus = 'forming'
    if (lastClose > head.price) status = 'invalidated'
    else if (lastClose < neckline) status = 'confirmed'
    if (old && status === 'forming') continue
    if (depth / neckline < MIN_DEPTH_PCT) continue
    const necklineSlope = (l2.price - l1.price) / (l2.index - l1.index)
    const symmetry = Math.abs(ls.price - rs.price) / Math.max(ls.price, rs.price)
    out.push({
      id: pid('chart-hns'),
      family: 'chart',
      name: 'head-and-shoulders',
      label: 'Head & Shoulders',
      direction: 'bearish',
      status,
      confidence: status === 'confirmed' ? 72 : status === 'invalidated' ? 42 : 58,
      confidenceBand: status === 'confirmed' ? 'medium' : 'low',
      strength: Math.min(90, 45 + (depth / neckline) * 200),
      detectedAt: candles[candles.length - 1].timestamp,
      barIndex: candles.length - 1,
      startIndex: ls.index,
      endIndex: candles.length - 1,
      invalidationLevel: round(head.price, 2),
      targetLevel: round(neckline - depth, 2),
      evidence: [
        `head ${head.price.toFixed(2)} above shoulders ${ls.price.toFixed(2)}/${rs.price.toFixed(2)}`,
        status === 'confirmed' ? 'neckline broken' : status === 'invalidated' ? 'price above head — pattern void' : 'neckline intact',
      ],
      points: [toPatternPoint(ls, 'left-shoulder'), toPatternPoint(head, 'head'), toPatternPoint(rs, 'right-shoulder'), toPatternPoint(l1, 'neckline'), toPatternPoint(l2, 'neckline')],
      dataRequirements: ['ohlc-or-close-pivots'],
      metadata: {
        leftShoulder: round(ls.price, 2),
        head: round(head.price, 2),
        rightShoulder: round(rs.price, 2),
        neckline: round(neckline, 2),
        necklineSlope: Number(necklineSlope.toFixed(4)),
        symmetry: Number((symmetry * 100).toFixed(2)),
        confirmationStatus: status,
      },
    })
    break
  }
  // Inverse
  for (let i = pivots.lows.length - 3; i >= 0; i--) {
    const ls = pivots.lows[i]
    const head = pivots.lows[i + 1]
    const rs = pivots.lows[i + 2]
    if (head.price >= ls.price * 0.995 || head.price >= rs.price * 0.995) continue
    if (!near(ls.price, rs.price, tol * 1.5)) continue
    const h1 = pivots.highs.find((h) => h.index > ls.index && h.index < head.index)
    const h2 = pivots.highs.find((h) => h.index > head.index && h.index < rs.index)
    if (!h1 || !h2) continue
    const lastBarIndex = candles.length - 1
    const old = rs.index < lastBarIndex - LIVE_WINDOW
    const neckline = (h1.price + h2.price) / 2
    const depth = neckline - head.price
    let status: PatternStatus = 'forming'
    if (lastClose < head.price) status = 'invalidated'
    else if (lastClose > neckline) status = 'confirmed'
    if (old && status === 'forming') continue
    if (depth / neckline < MIN_DEPTH_PCT) continue
    const necklineSlope = (h2.price - h1.price) / (h2.index - h1.index)
    const symmetry = Math.abs(ls.price - rs.price) / Math.max(ls.price, rs.price)
    out.push({
      id: pid('chart-ihns'),
      family: 'chart',
      name: 'inverse-head-and-shoulders',
      label: 'Inverse Head & Shoulders',
      direction: 'bullish',
      status,
      confidence: status === 'confirmed' ? 72 : status === 'invalidated' ? 42 : 58,
      confidenceBand: status === 'confirmed' ? 'medium' : 'low',
      strength: Math.min(90, 45 + (depth / neckline) * 200),
      detectedAt: candles[candles.length - 1].timestamp,
      barIndex: candles.length - 1,
      startIndex: ls.index,
      endIndex: candles.length - 1,
      invalidationLevel: round(head.price, 2),
      targetLevel: round(neckline + depth, 2),
      evidence: [
        `head ${head.price.toFixed(2)} below shoulders ${ls.price.toFixed(2)}/${rs.price.toFixed(2)}`,
        status === 'confirmed' ? 'neckline broken' : status === 'invalidated' ? 'price below head — pattern void' : 'neckline intact',
      ],
      points: [toPatternPoint(ls, 'left-shoulder'), toPatternPoint(head, 'head'), toPatternPoint(rs, 'right-shoulder')],
      dataRequirements: ['ohlc-or-close-pivots'],
      metadata: {
        leftShoulder: round(ls.price, 2),
        head: round(head.price, 2),
        rightShoulder: round(rs.price, 2),
        neckline: round(neckline, 2),
        necklineSlope: Number(necklineSlope.toFixed(4)),
        symmetry: Number((symmetry * 100).toFixed(2)),
        confirmationStatus: status,
      },
    })
    break
  }
  return out
}

// --- Triangles, wedges, channels ------------------------------------------

interface BoundaryResult {
  name: ChartPatternName
  label: string
  direction: 'bullish' | 'bearish' | 'neutral'
  resistance: { slope: number; intercept: number }
  support: { slope: number; intercept: number }
  evidence: string[]
  targetLevel: number | null
  invalidationLevel: number
  touches: number
  converging: boolean
}

function findBoundaries(
  pivots: Pivots,
  candles: Candle[],
  minTouches: number,
): ChartPattern[] {
  const out: ChartPattern[] = []
  const resPivots = pivots.highs
  const supPivots = pivots.lows
  if (resPivots.length < minTouches || supPivots.length < minTouches) return out

  const res = fitLine(resPivots.slice(-minTouches - 1))
  const sup = fitLine(supPivots.slice(-minTouches - 1))
  if (!res || !sup) return out

  const last = candles.length - 1
  const resY = res.slope * last + res.intercept
  const supY = sup.slope * last + sup.intercept
  const resRising = res.slope > 0
  const resFalling = res.slope < 0
  const supRising = sup.slope > 0
  const supFalling = sup.slope < 0
  const flat = (m: number) => Math.abs(m) < FLAT_SLOPE
  const lastClose = candles[last].close
  const touches = minTouches
  const width = resY - supY

  let found: BoundaryResult | null = null

  if (flat(res.slope) && supRising) {
    found = {
      name: 'ascending-triangle',
      label: 'Ascending Triangle',
      direction: 'bullish',
      resistance: res,
      support: sup,
      evidence: ['flat resistance', 'rising support'],
      targetLevel: round(resY + (resY - supY), 2),
      invalidationLevel: round(supY, 2),
      touches,
      converging: false,
    }
  } else if (flat(sup.slope) && resFalling) {
    found = {
      name: 'descending-triangle',
      label: 'Descending Triangle',
      direction: 'bearish',
      resistance: res,
      support: sup,
      evidence: ['falling resistance', 'flat support'],
      targetLevel: round(supY - (resY - supY), 2),
      invalidationLevel: round(resY, 2),
      touches,
      converging: false,
    }
  } else if (resFalling && supRising) {
    found = {
      name: 'symmetrical-triangle',
      label: 'Symmetrical Triangle',
      direction: 'neutral',
      resistance: res,
      support: sup,
      evidence: ['converging trendlines'],
      targetLevel: null,
      invalidationLevel: round(lastClose > (resY + supY) / 2 ? supY : resY, 2),
      touches,
      converging: true,
    }
  } else if (resRising && supRising && res.slope < sup.slope) {
    found = {
      name: 'rising-wedge',
      label: 'Rising Wedge',
      direction: 'bearish',
      resistance: res,
      support: sup,
      evidence: ['both boundaries rising', 'resistance slope < support slope'],
      targetLevel: null,
      invalidationLevel: round(supY, 2),
      touches,
      converging: true,
    }
  } else if (resFalling && supFalling && res.slope > sup.slope) {
    found = {
      name: 'falling-wedge',
      label: 'Falling Wedge',
      direction: 'bullish',
      resistance: res,
      support: sup,
      evidence: ['both boundaries falling', 'resistance slope > support slope'],
      targetLevel: null,
      invalidationLevel: round(resY, 2),
      touches,
      converging: true,
    }
  } else if (resRising && supRising && Math.abs(res.slope - sup.slope) < PARALLEL_SLOPE_DELTA) {
    found = {
      name: 'channel-up',
      label: 'Ascending Channel',
      direction: 'bullish',
      resistance: res,
      support: sup,
      evidence: ['parallel rising boundaries'],
      targetLevel: null,
      invalidationLevel: round(supY, 2),
      touches,
      converging: false,
    }
  } else if (resFalling && supFalling && Math.abs(res.slope - sup.slope) < PARALLEL_SLOPE_DELTA) {
    found = {
      name: 'channel-down',
      label: 'Descending Channel',
      direction: 'bearish',
      resistance: res,
      support: sup,
      evidence: ['parallel falling boundaries'],
      targetLevel: null,
      invalidationLevel: round(resY, 2),
      touches,
      converging: false,
    }
  } else if (flat(res.slope) && flat(sup.slope)) {
    found = {
      name: 'rectangle',
      label: 'Rectangle / Range',
      direction: 'neutral',
      resistance: res,
      support: sup,
      evidence: ['horizontal support and resistance'],
      targetLevel: null,
      invalidationLevel: round(lastClose > (resY + supY) / 2 ? supY : resY, 2),
      touches,
      converging: false,
    }
  }

  if (found) {
    const brokenUp = lastClose > resY * 1.002
    const brokenDown = lastClose < supY * 0.998
    // A triangle/wedge that broke the OPPOSITE side is invalidated, not confirmed.
    let status: PatternStatus = 'forming'
    if (found.name === 'ascending-triangle' || found.name === 'falling-wedge' || found.name === 'symmetrical-triangle') {
      if (brokenDown) status = 'invalidated'
      else if (brokenUp) status = 'confirmed'
    } else if (found.name === 'descending-triangle' || found.name === 'rising-wedge') {
      if (brokenUp) status = 'invalidated'
      else if (brokenDown) status = 'confirmed'
    } else {
      // Channels / rectangle: either side is a breakout, not invalidation.
      if (brokenUp || brokenDown) status = 'confirmed'
    }
    const apexIndex = width > 0 ? Math.round((resY - supY) / (sup.slope - res.slope)) + last : null
    const positionWithinChannel = width > 0 ? (lastClose - supY) / width : null
    out.push({
      id: pid(`chart-${found.name}`),
      family: 'chart',
      name: found.name,
      label: found.label,
      direction: found.direction,
      status,
      confidence: status === 'confirmed' ? 66 : status === 'invalidated' ? 40 : 54,
      confidenceBand: status === 'confirmed' ? 'medium' : 'low',
      strength: Math.min(90, 40 + touches * 8),
      detectedAt: candles[last].timestamp,
      barIndex: last,
      startIndex: resPivots[0]?.index,
      endIndex: last,
      invalidationLevel: found.invalidationLevel,
      targetLevel: found.targetLevel,
      evidence: [
        ...found.evidence,
        `${touches} touches per boundary`,
        brokenUp ? 'upward breakout' : brokenDown ? 'downward breakdown' : 'price inside pattern',
      ],
      boundaries: { resistance: found.resistance, support: found.support },
      dataRequirements: ['ohlc-or-close-pivots'],
      metadata: {
        upperSlope: Number(found.resistance.slope.toFixed(5)),
        lowerSlope: Number(found.support.slope.toFixed(5)),
        touchCount: touches,
        convergence: found.converging,
        apexIndex,
        apexEstimate: apexIndex != null ? round(found.resistance.slope * apexIndex + found.resistance.intercept, 2) : null,
        breakoutLevel: round(found.direction === 'bullish' ? resY : found.direction === 'bearish' ? supY : Math.max(resY, supY), 2),
        width: round(width, 2),
        positionWithinChannel: positionWithinChannel != null ? Number(positionWithinChannel.toFixed(3)) : null,
        status,
      },
    })
  }
  return out
}

// --- Flags & pennants ------------------------------------------------------

function findFlagsAndPennants(candles: Candle[]): ChartPattern[] {
  const out: ChartPattern[] = []
  if (candles.length < 14) return out
  const recent = candles.slice(-14)
  const legStart = recent[0].close
  const legEnd = recent[4]?.close ?? legStart
  const flagEnd = recent[recent.length - 1].close
  const legPct = (legEnd - legStart) / legStart
  const flagPct = (flagEnd - legEnd) / legEnd
  const legHigh = Math.max(...recent.slice(0, 5).map((c) => c.high))
  const legLow = Math.min(...recent.slice(0, 5).map((c) => c.low))
  const polePct = (legHigh - legLow) / legLow
  const poleDuration = 5
  const consolidationDuration = 9

  const consolidation = recent.slice(5)
  const consHigh = Math.max(...consolidation.map((c) => c.high))
  const consLow = Math.min(...consolidation.map((c) => c.low))
  const consolidationRange = (consHigh - consLow) / consLow

  const base = {
    poleDuration,
    consolidationDuration,
    consolidationRange: Number((consolidationRange * 100).toFixed(2)),
  }

  // Bull flag: strong prior up-leg then a tight downward drift.
  if (legPct > 0.03 && flagPct < 0 && flagPct > -0.025 && consolidationRange < 0.03) {
    out.push({
      id: pid('chart-bull-flag'),
      family: 'chart',
      name: 'bull-flag',
      label: 'Bull Flag',
      direction: 'bullish',
      status: 'forming',
      confidence: 56,
      confidenceBand: 'low',
      strength: Math.min(90, 40 + polePct * 400),
      detectedAt: candles[candles.length - 1].timestamp,
      barIndex: candles.length - 1,
      startIndex: candles.length - 14,
      endIndex: candles.length - 1,
      invalidationLevel: round(Math.min(...consolidation.map((c) => c.low)), 2),
      targetLevel: round(legEnd + (legEnd - legStart) * 0.5, 2),
      evidence: [`strong prior leg +${(legPct * 100).toFixed(1)}%`, 'tight downward consolidation'],
      points: [
        { index: candles.length - 14, timestamp: recent[0].timestamp, price: round(recent[0].close, 2), role: 'pole-start' },
        { index: candles.length - 10, timestamp: recent[4].timestamp, price: round(recent[4].close, 2), role: 'pole-end' },
      ],
      dataRequirements: ['ohlc-or-close'],
      metadata: { poleMagnitude: Number((polePct * 100).toFixed(2)), ...base },
    })
  }
  // Bear flag
  if (legPct < -0.03 && flagPct > 0 && flagPct < 0.025 && consolidationRange < 0.03) {
    out.push({
      id: pid('chart-bear-flag'),
      family: 'chart',
      name: 'bear-flag',
      label: 'Bear Flag',
      direction: 'bearish',
      status: 'forming',
      confidence: 56,
      confidenceBand: 'low',
      strength: Math.min(90, 40 + Math.abs(polePct) * 400),
      detectedAt: candles[candles.length - 1].timestamp,
      barIndex: candles.length - 1,
      startIndex: candles.length - 14,
      endIndex: candles.length - 1,
      invalidationLevel: round(Math.max(...consolidation.map((c) => c.high)), 2),
      targetLevel: round(legEnd - (legStart - legEnd) * 0.5, 2),
      evidence: [`strong prior leg ${(legPct * 100).toFixed(1)}%`, 'tight upward consolidation'],
      points: [
        { index: candles.length - 14, timestamp: recent[0].timestamp, price: round(recent[0].close, 2), role: 'pole-start' },
        { index: candles.length - 10, timestamp: recent[4].timestamp, price: round(recent[4].close, 2), role: 'pole-end' },
      ],
      dataRequirements: ['ohlc-or-close'],
      metadata: { poleMagnitude: Number((Math.abs(polePct) * 100).toFixed(2)), ...base },
    })
  }

  // Pennant: strong prior leg + contracting consolidation.
  const firstHalf = consolidation.slice(0, 4)
  const secondHalf = consolidation.slice(4)
  const firstRange = Math.max(...firstHalf.map((c) => c.high)) - Math.min(...firstHalf.map((c) => c.low))
  const secondRange = Math.max(...secondHalf.map((c) => c.high)) - Math.min(...secondHalf.map((c) => c.low))
  const contracting = secondHalf.length > 0 && secondRange < firstRange * 0.8
  if (legPct > 0.03 && contracting && consolidationRange < 0.035) {
    out.push({
      id: pid('chart-bull-pennant'),
      family: 'chart',
      name: 'bull-pennant',
      label: 'Bull Pennant',
      direction: 'bullish',
      status: 'forming',
      confidence: 58,
      confidenceBand: 'medium',
      strength: Math.min(90, 45 + polePct * 350),
      detectedAt: candles[candles.length - 1].timestamp,
      barIndex: candles.length - 1,
      startIndex: candles.length - 14,
      endIndex: candles.length - 1,
      invalidationLevel: round(Math.min(...consolidation.map((c) => c.low)), 2),
      targetLevel: round(legEnd + (legEnd - legStart) * 0.5, 2),
      evidence: [`strong prior leg +${(legPct * 100).toFixed(1)}%`, 'contracting consolidation'],
      dataRequirements: ['ohlc-or-close'],
      metadata: { poleMagnitude: Number((polePct * 100).toFixed(2)), contracting: true, ...base },
    })
  }
  if (legPct < -0.03 && contracting && consolidationRange < 0.035) {
    out.push({
      id: pid('chart-bear-pennant'),
      family: 'chart',
      name: 'bear-pennant',
      label: 'Bear Pennant',
      direction: 'bearish',
      status: 'forming',
      confidence: 58,
      confidenceBand: 'medium',
      strength: Math.min(90, 45 + Math.abs(polePct) * 350),
      detectedAt: candles[candles.length - 1].timestamp,
      barIndex: candles.length - 1,
      startIndex: candles.length - 14,
      endIndex: candles.length - 1,
      invalidationLevel: round(Math.max(...consolidation.map((c) => c.high)), 2),
      targetLevel: round(legEnd - (legStart - legEnd) * 0.5, 2),
      evidence: [`strong prior leg ${(legPct * 100).toFixed(1)}%`, 'contracting consolidation'],
      dataRequirements: ['ohlc-or-close'],
      metadata: { poleMagnitude: Number((Math.abs(polePct) * 100).toFixed(2)), contracting: true, ...base },
    })
  }
  return out
}

// --- Cup & handle ----------------------------------------------------------

/**
 * Cup and handle: left rim ≈ right rim (prior resistance), a rounded
 * decline-recovery (U-shape) of meaningful depth, then a small handle
 * pullback. Requires genuine structure; with insufficient history returns
 * status 'unavailable' rather than forcing a pattern.
 */
function findCupAndHandle(candles: Candle[], pivots: Pivots): ChartPattern[] {
  const out: ChartPattern[] = []
  if (candles.length < 30) {
    out.push(unavailablePattern('cup-and-handle', 'Insufficient history for cup & handle (need ≥30 bars)'))
    return out
  }
  if (pivots.highs.length < 3 || pivots.lows.length < 2) {
    out.push(unavailablePattern('cup-and-handle', 'Insufficient swing structure for cup & handle'))
    return out
  }

  // Left rim = highest high; right rim = the last high near it.
  const rim = pivots.highs[pivots.highs.length - 1]
  const leftCandidates = pivots.highs.filter((h) => h.index < rim.index)
  if (leftCandidates.length === 0) return []
  const leftRim = leftCandidates[leftCandidates.length - 1]
  if (!near(leftRim.price, rim.price, 0.03)) return []

  // Bottom = lowest low between the rims.
  const bottoms = pivots.lows.filter((l) => l.index > leftRim.index && l.index < rim.index)
  if (bottoms.length === 0) return []
  const bottom = bottoms.reduce((a, b) => (b.price < a.price ? b : a), bottoms[0])

  const depth = leftRim.price - bottom.price
  const depthPct = depth / leftRim.price
  if (depthPct < 0.08) return [] // too shallow to be a cup
  if (bottom.index - leftRim.index < 3 || rim.index - bottom.index < 3) return []

  // Approximate symmetry: time up vs time down (allow 0.5x..2x).
  const downBars = bottom.index - leftRim.index
  const upBars = rim.index - bottom.index
  const symmetry = Math.min(downBars, upBars) / Math.max(1, Math.max(downBars, upBars))
  if (symmetry < 0.45) return []

  // Handle: after the right rim, a small pullback of ≤ half the cup depth.
  const afterRim = candles.slice(rim.index + 1)
  if (afterRim.length < 2) return []
  const handleHigh = Math.max(...afterRim.map((c) => c.high))
  const handleLow = Math.min(...afterRim.map((c) => c.low))
  const handleDepth = (handleHigh - handleLow) / handleHigh
  if (handleDepth > Math.max(0.05, depthPct * 0.5)) return []

  const lastClose = candles[candles.length - 1].close
  const status: PatternStatus = lastClose > rim.price ? 'confirmed' : 'forming'
  const rimLevel = round(rim.price, 2)
  out.push({
    id: pid('chart-cup-handle'),
    family: 'chart',
    name: 'cup-and-handle',
    label: 'Cup and Handle',
    direction: 'bullish',
    status,
    confidence: status === 'confirmed' ? 68 : 55,
    confidenceBand: 'medium',
    strength: Math.min(90, 40 + depthPct * 200),
    detectedAt: candles[candles.length - 1].timestamp,
    barIndex: candles.length - 1,
    startIndex: leftRim.index,
    endIndex: candles.length - 1,
    invalidationLevel: round(bottom.price, 2),
    targetLevel: round(rimLevel + depth, 2),
    evidence: [
      `rims at ${leftRim.price.toFixed(2)} / ${rim.price.toFixed(2)}`,
      `cup bottom ${bottom.price.toFixed(2)} (${(depthPct * 100).toFixed(1)}% depth)`,
      status === 'confirmed' ? 'price closed above the rim' : 'handle below the rim',
    ],
    points: [
      toPatternPoint(leftRim, 'left-rim'),
      toPatternPoint(bottom, 'bottom'),
      toPatternPoint(rim, 'right-rim'),
      { index: candles.length - 1, timestamp: candles[candles.length - 1].timestamp, price: round(handleHigh, 2), role: 'handle-high' },
    ],
    dataRequirements: ['ohlc-or-close-pivots', 'min-30-bars'],
    metadata: {
      leftRim: round(leftRim.price, 2),
      bottom: round(bottom.price, 2),
      rightRim: rimLevel,
      handleHigh: round(handleHigh, 2),
      handleLow: round(handleLow, 2),
      rimLevel,
      depth: round(depth, 2),
      depthPercent: Number((depthPct * 100).toFixed(2)),
      symmetry: Number((symmetry * 100).toFixed(1)),
    },
  })

  // Inverse cup and handle: mirrored (rounded top, bearish continuation).
  const rimLow = pivots.lows[pivots.lows.length - 1]
  const leftLowCandidates = pivots.lows.filter((l) => l.index < rimLow.index)
  if (leftLowCandidates.length === 0) return out
  const leftRimLow = leftLowCandidates[leftLowCandidates.length - 1]
  if (!near(leftRimLow.price, rimLow.price, 0.03)) return out
  const top = pivots.highs.filter((h) => h.index > leftRimLow.index && h.index < rimLow.index)
  if (top.length === 0) return out
  const peak = top.reduce((a, b) => (b.price > a.price ? b : a), top[0])
  const invDepth = peak.price - leftRimLow.price
  if (invDepth / peak.price < 0.08) return out
  if (peak.index - leftRimLow.index < 3 || rimLow.index - peak.index < 3) return out
  const invSymmetry = Math.min(peak.index - leftRimLow.index, rimLow.index - peak.index) / Math.max(1, Math.max(peak.index - leftRimLow.index, rimLow.index - peak.index))
  if (invSymmetry < 0.45) return out
  const invAfter = candles.slice(rimLow.index + 1)
  if (invAfter.length < 2) return out
  const invHandleDepth = (Math.max(...invAfter.map((c) => c.high)) - Math.min(...invAfter.map((c) => c.low))) / Math.max(...invAfter.map((c) => c.high))
  if (invHandleDepth > Math.max(0.05, invDepth / peak.price * 0.5)) return out
  const invStatus: PatternStatus = lastClose < rimLow.price ? 'confirmed' : 'forming'
  out.push({
    id: pid('chart-inv-cup-handle'),
    family: 'chart',
    name: 'inverse-cup-and-handle',
    label: 'Inverse Cup and Handle',
    direction: 'bearish',
    status: invStatus,
    confidence: invStatus === 'confirmed' ? 68 : 55,
    confidenceBand: 'medium',
    strength: Math.min(90, 40 + (invDepth / peak.price) * 200),
    detectedAt: candles[candles.length - 1].timestamp,
    barIndex: candles.length - 1,
    startIndex: leftRimLow.index,
    endIndex: candles.length - 1,
    invalidationLevel: round(peak.price, 2),
    targetLevel: round(rimLow.price - invDepth, 2),
    evidence: [
      `rims at ${leftRimLow.price.toFixed(2)} / ${rimLow.price.toFixed(2)}`,
      `cup top ${peak.price.toFixed(2)}`,
      invStatus === 'confirmed' ? 'price closed below the rim' : 'handle above the rim',
    ],
    dataRequirements: ['ohlc-or-close-pivots', 'min-30-bars'],
    metadata: {
      leftRim: round(leftRimLow.price, 2),
      top: round(peak.price, 2),
      rightRim: round(rimLow.price, 2),
      rimLevel: round(rimLow.price, 2),
      depth: round(invDepth, 2),
      depthPercent: Number((invDepth / peak.price * 100).toFixed(2)),
      symmetry: Number((invSymmetry * 100).toFixed(1)),
    },
  })
  return out
}

function unavailablePattern(name: 'cup-and-handle', label: string): ChartPattern {
  return {
    id: pid(`chart-${name}-unavailable`),
    family: 'chart',
    name,
    label,
    direction: 'neutral',
    status: 'unavailable',
    confidence: 0,
    confidenceBand: 'low',
    strength: 0,
    detectedAt: 0,
    barIndex: 0,
    invalidationLevel: null,
    targetLevel: null,
    evidence: ['Not enough data to detect this pattern reliably'],
    dataRequirements: ['ohlc-or-close-pivots', 'min-30-bars'],
    metadata: { unavailableReason: label },
  }
}

// --- Orchestrator ---------------------------------------------------------

export function detectChartPatterns(
  candles: Candle[],
  options: ChartPatternOptions = {},
): ChartPattern[] {
  const window = options.window ?? Math.min(80, candles.length)
  const lookback = options.lookback ?? 3
  const tol = options.pivotTolerancePct ?? 0.02
  const minSep = options.minSeparation ?? 5
  const minTouches = options.minBoundaryTouches ?? 3

  if (candles.length < lookback * 2 + 4) return []
  const startIdx = Math.max(0, candles.length - window)
  const slice = candles.slice(startIdx)
  const pivots = findPivots(slice, lookback, startIdx)
  if (pivots.highs.length < 2 && pivots.lows.length < 2) {
    // Too little structure — only cup-and-handle may report itself unavailable.
    return findCupAndHandle(candles, pivots)
  }

  return [
    ...findReversalPatterns(pivots, tol, minSep, candles),
    ...findHeadAndShoulders(pivots, tol, candles),
    ...findBoundaries(pivots, candles, minTouches),
    ...findFlagsAndPennants(candles),
    ...findCupAndHandle(candles, pivots),
  ].sort((a, b) => b.confidence - a.confidence)
}

// Re-export for potential external pivot use.
export type { Pivots }