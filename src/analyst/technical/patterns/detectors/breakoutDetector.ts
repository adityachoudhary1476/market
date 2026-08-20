import type {
  Candle,
  Breakout,
  BreakoutName,
  Direction,
  StructuredTechnicalContext,
  PriceLevel,
} from '../types'
import { pid, round } from '../helpers'

// ---------------------------------------------------------------------------
// Breakout / breakdown detector.
//
// Identifies when the current close decisively crosses a meaningful level:
// support/resistance zones, moving averages, Bollinger bands, recent range
// extremes, and new highs/lows. Each breakout carries penetration % and, when
// volume is available, a volume-confirmation ratio. Evidence only — no
// directional recommendation.
// ---------------------------------------------------------------------------

export interface BreakoutOptions {
  /** Close must be at least this fraction beyond a level to count as broken. */
  penetrationThresholdPct?: number
  /** Lookback (bars) for "new high/low" range detection. */
  rangeLookback?: number
  /** Bars to scan back for historical breakout events (failures/retests). */
  historyLookback?: number
  /** A historical breakout fails if price re-enters within this many bars. */
  failWindow?: number
}

function lastClose(candles: Candle[]) {
  return candles[candles.length - 1].close
}

function prevClose(candles: Candle[]) {
  return candles.length > 1 ? candles[candles.length - 2].close : candles[0].close
}

function volumeRatio(candles: Candle[]): number | null {
  const last = candles[candles.length - 1].volume
  if (last == null) return null
  const lookback = Math.min(20, candles.length - 1)
  const vols = candles.slice(-lookback - 1, -1).map((c) => c.volume).filter((v): v is number => v != null)
  if (vols.length < 5) return null
  const avg = vols.reduce((a, b) => a + b, 0) / vols.length
  return avg === 0 ? null : Number((last / avg).toFixed(2))
}

function makeBreakout(
  candles: Candle[],
  name: BreakoutName,
  label: string,
  direction: Direction,
  level: number,
  evidence: string[],
  opts: {
    family?: 'breakout' | 'breakdown'
    target?: number | null
    invalidation?: number | null
    status?: 'confirmed' | 'failed'
    metadata?: Record<string, unknown>
  } = {},
): Breakout {
  const close = lastClose(candles)
  const penetration = ((close - level) / level) * 100
  const status = opts.status ?? 'confirmed'
  return {
    id: pid(`brk-${name}`),
    family: opts.family ?? (direction === 'bullish' ? 'breakout' : 'breakdown'),
    name,
    label,
    direction,
    status,
    confidence:
      status === 'failed' ? 50 :
      Math.min(85, 55 + Math.abs(penetration) * 5),
    confidenceBand: status === 'failed' ? 'low' : Math.abs(penetration) > 1 ? 'medium' : 'low',
    strength: Math.min(90, 40 + Math.abs(penetration) * 8),
    detectedAt: candles[candles.length - 1].timestamp,
    barIndex: candles.length - 1,
    invalidationLevel: opts.invalidation != null ? opts.invalidation : round(level, 2),
    targetLevel: opts.target ?? null,
    evidence,
    level: round(level, 2),
    penetrationPercent: Number(penetration.toFixed(2)),
    volumeConfirmation: volumeRatio(candles),
    dataRequirements: ['close', 'ohlc-for-range', 'volume-for-confirmation'],
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
  }
}

function zoneBreakouts(
  candles: Candle[],
  levels: PriceLevel[],
  threshold: number,
): Breakout[] {
  const out: Breakout[] = []
  const close = lastClose(candles)
  const prev = prevClose(candles)
  for (const lvl of levels) {
    if (lvl.type === 'resistance' && close > lvl.low && prev <= lvl.high) {
      const pen = ((close - lvl.high) / lvl.high) * 100
      if (pen >= threshold) {
        out.push(
          makeBreakout(candles, 'resistance-breakout', 'Resistance Breakout', 'bullish', lvl.high, [
            `close ${close.toFixed(2)} above resistance ${lvl.high.toFixed(2)}`,
            `penetration ${pen.toFixed(2)}%`,
            lvl.touches ? `${lvl.touches} prior touches` : '',
          ].filter(Boolean), { target: round(close + (lvl.high - lvl.low) * 2, 2) }),
        )
      }
    }
    if (lvl.type === 'support' && close < lvl.high && prev >= lvl.low) {
      const pen = ((lvl.low - close) / lvl.low) * 100
      if (pen >= threshold) {
        out.push(
          makeBreakout(candles, 'support-breakdown', 'Support Breakdown', 'bearish', lvl.low, [
            `close ${close.toFixed(2)} below support ${lvl.low.toFixed(2)}`,
            `penetration ${pen.toFixed(2)}%`,
          ].filter(Boolean), { target: round(close - (lvl.high - lvl.low) * 2, 2) }),
        )
      }
    }
  }
  return out
}

function maBreakouts(candles: Candle[], technical: StructuredTechnicalContext, threshold: number): Breakout[] {
  const out: Breakout[] = []
  const close = lastClose(candles)
  const prev = prevClose(candles)
  const mas = technical.indicators.movingAverages
  for (const [key, result] of Object.entries(mas.ema)) {
    if (result.value == null) continue
    const period = Number(key)
    if (![20, 50, 200].includes(period)) continue
    if (close > result.value && prev <= result.value) {
      const pen = ((close - result.value) / result.value) * 100
      if (pen >= threshold * 0.4) {
        out.push(
          makeBreakout(candles, 'ema-breakout', `EMA${period} Breakout`, 'bullish', result.value, [
            `close crossed above EMA${period} (${result.value.toFixed(2)})`,
          ], { target: null, invalidation: round(result.value, 2) }),
        )
      }
    }
    if (close < result.value && prev >= result.value) {
      const pen = ((result.value - close) / result.value) * 100
      if (pen >= threshold * 0.4) {
        out.push(
          makeBreakout(candles, 'ema-breakdown', `EMA${period} Breakdown`, 'bearish', result.value, [
            `close crossed below EMA${period} (${result.value.toFixed(2)})`,
          ], { target: null, invalidation: round(result.value, 2) }),
        )
      }
    }
  }
  for (const [key, result] of Object.entries(mas.sma)) {
    if (result.value == null) continue
    const period = Number(key)
    if (![50, 200].includes(period)) continue
    if (close > result.value && prev <= result.value) {
      out.push(
        makeBreakout(candles, 'sma-breakout', `SMA${period} Breakout`, 'bullish', result.value, [
          `close crossed above SMA${period} (${result.value.toFixed(2)})`,
        ]),
      )
    }
    if (close < result.value && prev >= result.value) {
      out.push(
        makeBreakout(candles, 'sma-breakdown', `SMA${period} Breakdown`, 'bearish', result.value, [
          `close crossed below SMA${period} (${result.value.toFixed(2)})`,
        ]),
      )
    }
  }
  return out
}

function bollingerBreakouts(candles: Candle[], technical: StructuredTechnicalContext, threshold: number): Breakout[] {
  const out: Breakout[] = []
  const bb = technical.indicators.bollinger
  const close = lastClose(candles)
  const prev = prevClose(candles)
  if (bb.upper != null && close > bb.upper && prev <= bb.upper) {
    const pen = ((close - bb.upper) / bb.upper) * 100
    if (pen >= threshold * 0.3) {
      out.push(makeBreakout(candles, 'bolinger-band-breakout', 'Upper Bollinger Breakout', 'bullish', bb.upper, [
        `close ${close.toFixed(2)} above upper band ${bb.upper.toFixed(2)}`,
      ]))
    }
  }
  if (bb.lower != null && close < bb.lower && prev >= bb.lower) {
    const pen = ((bb.lower - close) / bb.lower) * 100
    if (pen >= threshold * 0.3) {
      out.push(makeBreakout(candles, 'bollinger-band-breakdown', 'Lower Bollinger Breakdown', 'bearish', bb.lower, [
        `close ${close.toFixed(2)} below lower band ${bb.lower.toFixed(2)}`,
      ]))
    }
  }
  return out
}

function rangeBreakouts(candles: Candle[], lookback: number, threshold: number): Breakout[] {
  const out: Breakout[] = []
  if (candles.length < lookback + 1) return out
  const close = lastClose(candles)
  const prev = prevClose(candles)
  const window = candles.slice(-lookback - 1, -1)
  const hi = Math.max(...window.map((c) => c.high))
  const lo = Math.min(...window.map((c) => c.low))
  if (close > hi && prev <= hi) {
    const pen = ((close - hi) / hi) * 100
    if (pen >= threshold) {
      out.push(makeBreakout(candles, 'range-breakout', `${lookback}-bar Range Breakout`, 'bullish', hi, [
        `new ${lookback}-bar high at ${close.toFixed(2)}`,
      ], { target: round(close + (close - lo) * 0.5, 2) }))
    }
  }
  if (close < lo && prev >= lo) {
    const pen = ((lo - close) / lo) * 100
    if (pen >= threshold) {
      out.push(makeBreakout(candles, 'range-breakdown', `${lookback}-bar Range Breakdown`, 'bearish', lo, [
        `new ${lookback}-bar low at ${close.toFixed(2)}`,
      ], { target: round(close - (hi - close) * 0.5, 2) }))
    }
  }
  return out
}

function newHighLow(candles: Candle[]): Breakout[] {
  const out: Breakout[] = []
  if (candles.length < 20) return out
  const close = lastClose(candles)
  const window = candles.slice(0, -1)
  const hi = Math.max(...window.map((c) => c.high))
  const lo = Math.min(...window.map((c) => c.low))
  if (close >= hi) {
    out.push(makeBreakout(candles, 'new-high', 'New High', 'bullish', hi, [
      `close at or above all-time visible high ${hi.toFixed(2)}`,
    ]))
  }
  if (close <= lo) {
    out.push(makeBreakout(candles, 'new-low', 'New Low', 'bearish', lo, [
      `close at or below all-time visible low ${lo.toFixed(2)}`,
    ]))
  }
  return out
}

// --- Failed breakouts & retests --------------------------------------------
//
// A breakout that closes back inside the previous range within `failWindow`
// bars is a FAILED breakout (status 'failed'), with reentryLevel,
// failureDistance and barsSinceBreakout. A breakout that is followed by a
// return toward the broken level WITHOUT re-entering is a RETEST. Both are
// historical events — detected from the last `historyLookback` bars.
function scanBreakoutHistory(candles: Candle[], opts: Required<BreakoutOptions>): Breakout[] {
  const out: Breakout[] = []
  const n = candles.length
  const lookback = opts.rangeLookback
  const threshold = opts.penetrationThresholdPct
  const start = Math.max(lookback + 1, n - opts.historyLookback)
  if (n - start < 4) return out

  const last = n - 1
  for (let i = start; i <= n - 2; i++) {
    const window = candles.slice(i - lookback, i)
    const hi = Math.max(...window.map((c) => c.high))
    const lo = Math.min(...window.map((c) => c.low))
    const prevClose = candles[i - 1].close
    const close = candles[i].close

    // Bullish breakout event at bar i.
    if (close > hi && prevClose <= hi && ((close - hi) / hi) * 100 >= threshold) {
      let failed = false
      let retestAt: number | null = null
      let retestHeld = false
      let reentry: number | null = null
      for (let j = i + 1; j <= Math.min(n - 1, i + opts.failWindow); j++) {
        const cj = candles[j].close
        if (cj < hi) {
          failed = true
          reentry = cj
          break
        }
        if (cj >= hi && candles[j].low <= hi * 1.01 && retestAt == null) {
          retestAt = candles[j].low
          retestHeld = true
        }
      }
      const level = round(hi, 2)
      if (failed && reentry != null) {
        out.push({
          id: pid('brk-failed-up'),
          family: 'breakout',
          name: 'resistance-breakout',
          label: 'Failed Resistance Breakout',
          direction: 'bullish',
          status: 'failed',
          confidence: 50,
          confidenceBand: 'low',
          strength: 40,
          detectedAt: candles[i].timestamp,
          barIndex: i,
          invalidationLevel: level,
          targetLevel: null,
          evidence: [
            `broke resistance ${level.toFixed(2)} at bar ${i}`,
            `re-entered at ${reentry.toFixed(2)} within ${opts.failWindow} bars`,
          ],
          level,
          penetrationPercent: Number((((close - hi) / hi) * 100).toFixed(2)),
          volumeConfirmation: null,
          dataRequirements: ['ohlc'],
          metadata: {
            reentryLevel: round(reentry, 2),
            failureDistance: round(hi - reentry, 2),
            barsSinceBreakout: last - i,
            breakoutBarIndex: i,
          },
        })
      } else if (retestHeld && retestAt != null) {
        out.push({
          id: pid('brk-retest-up'),
          family: 'breakout',
          name: 'breakout-retest',
          label: 'Breakout Retest',
          direction: 'bullish',
          status: 'confirmed',
          confidence: 58,
          confidenceBand: 'medium',
          strength: 45,
          detectedAt: candles[i].timestamp,
          barIndex: i,
          invalidationLevel: level,
          targetLevel: null,
          evidence: [
            `broke resistance ${level.toFixed(2)} at bar ${i}`,
            `retested level at ${retestAt.toFixed(2)} and held`,
          ],
          level,
          penetrationPercent: Number((((close - hi) / hi) * 100).toFixed(2)),
          volumeConfirmation: null,
          dataRequirements: ['ohlc'],
          metadata: {
            originalBreakoutLevel: level,
            retestLow: round(retestAt, 2),
            retestDistance: round(retestAt - hi, 2),
            retestHeld: true,
            barsSinceBreakout: last - i,
          },
        })
      }
    }

    // Bearish breakdown event at bar i.
    if (close < lo && prevClose >= lo && ((lo - close) / lo) * 100 >= threshold) {
      let failed = false
      let retestAt: number | null = null
      let retestHeld = false
      let reentry: number | null = null
      for (let j = i + 1; j <= Math.min(n - 1, i + opts.failWindow); j++) {
        const cj = candles[j].close
        if (cj > lo) {
          failed = true
          reentry = cj
          break
        }
        if (cj <= lo && candles[j].high >= lo * 0.99 && retestAt == null) {
          retestAt = candles[j].high
          retestHeld = true
        }
      }
      const level = round(lo, 2)
      if (failed && reentry != null) {
        out.push({
          id: pid('brk-failed-down'),
          family: 'breakdown',
          name: 'support-breakdown',
          label: 'Failed Support Breakdown',
          direction: 'bearish',
          status: 'failed',
          confidence: 50,
          confidenceBand: 'low',
          strength: 40,
          detectedAt: candles[i].timestamp,
          barIndex: i,
          invalidationLevel: level,
          targetLevel: null,
          evidence: [
            `broke support ${level.toFixed(2)} at bar ${i}`,
            `re-entered at ${reentry.toFixed(2)} within ${opts.failWindow} bars`,
          ],
          level,
          penetrationPercent: Number((((lo - close) / lo) * 100).toFixed(2)),
          volumeConfirmation: null,
          dataRequirements: ['ohlc'],
          metadata: {
            reentryLevel: round(reentry, 2),
            failureDistance: round(reentry - lo, 2),
            barsSinceBreakout: last - i,
            breakoutBarIndex: i,
          },
        })
      } else if (retestHeld && retestAt != null) {
        out.push({
          id: pid('brk-retest-down'),
          family: 'breakdown',
          name: 'breakdown-retest',
          label: 'Breakdown Retest',
          direction: 'bearish',
          status: 'confirmed',
          confidence: 58,
          confidenceBand: 'medium',
          strength: 45,
          detectedAt: candles[i].timestamp,
          barIndex: i,
          invalidationLevel: level,
          targetLevel: null,
          evidence: [
            `broke support ${level.toFixed(2)} at bar ${i}`,
            `retested level at ${retestAt.toFixed(2)} and held`,
          ],
          level,
          penetrationPercent: Number((((lo - close) / lo) * 100).toFixed(2)),
          volumeConfirmation: null,
          dataRequirements: ['ohlc'],
          metadata: {
            originalBreakoutLevel: level,
            retestHigh: round(retestAt, 2),
            retestDistance: round(lo - retestAt, 2),
            retestHeld: true,
            barsSinceBreakout: last - i,
          },
        })
      }
    }
  }
  return out
}

export function detectBreakouts(
  candles: Candle[],
  technical: StructuredTechnicalContext,
  options: BreakoutOptions = {},
): Breakout[] {
  const opts: Required<BreakoutOptions> = {
    penetrationThresholdPct: options.penetrationThresholdPct ?? 0.3,
    rangeLookback: options.rangeLookback ?? 20,
    historyLookback: options.historyLookback ?? 40,
    failWindow: options.failWindow ?? 5,
  }
  const { penetrationThresholdPct: threshold, rangeLookback } = opts

  return [
    ...zoneBreakouts(candles, technical.supportResistance.levels, threshold),
    ...maBreakouts(candles, technical, threshold),
    ...bollingerBreakouts(candles, technical, threshold),
    ...rangeBreakouts(candles, rangeLookback, threshold),
    ...newHighLow(candles),
    ...scanBreakoutHistory(candles, opts),
  ].sort((a, b) => b.confidence - a.confidence)
}
