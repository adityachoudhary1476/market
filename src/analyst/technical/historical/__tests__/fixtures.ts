// ---------------------------------------------------------------------------
// Phase 2D — deterministic test fixtures
//
// A seeded generator (mulberry32) producing candle series that reliably fire
// the technical engine's breakout detector: a quiet range phase followed by a
// sustained rally (or crash). Every rally bar closes above the prior 20-bar
// high, which is exactly what `rangeBreakout` + `newHigh` require — so the
// walk-forward scanner finds confirmed setups at every rally bar.
//
// Variants:
//   closeOnly   — high === low === close (index-style feed; MFE/MAE impossible)
//   withVolume  — volume attached to every candle
//   rally/crash — direction of the second phase
// ---------------------------------------------------------------------------

import type { Candle } from '../../types'

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface FixtureOptions {
  /** Total bars. Must be >= minimumHistoricalBars + minimumForwardBars + margin. */
  bars?: number
  /** Bars in the quiet range phase. */
  rangeBars?: number
  /** Bars in the trending phase. */
  trendBars?: number
  direction?: 'rally' | 'crash'
  /** high === low === close (close-only feed). */
  closeOnly?: boolean
  withVolume?: boolean
  /** Per-bar drift in the trending phase (fraction). */
  drift?: number
  /** Noise amplitude as fraction of price. */
  noise?: number
  seed?: number
}

export interface Fixture {
  candles: Candle[]
  /** Bar index where the trending phase starts. */
  trendStart: number
}

const DAY = 86_400_000

export function generateFixtureCandles(opts: FixtureOptions = {}): Fixture {
  const rnd = mulberry32(opts.seed ?? 42)
  const bars = opts.bars ?? 240
  const rangeBars = opts.rangeBars ?? 130
  const trendBars = opts.trendBars ?? 60
  const drift = opts.drift ?? 0.004
  const noise = opts.noise ?? 0.004
  const direction = opts.direction ?? 'rally'
  const sign = direction === 'rally' ? 1 : -1

  const candles: Candle[] = []
  let close = 100
  let baseTime = Date.UTC(2020, 0, 1)

  for (let i = 0; i < bars; i++) {
    const inTrend = i >= rangeBars && i < rangeBars + trendBars
    const step = inTrend ? sign * drift * close + (rnd() - 0.5) * noise * close * 0.2 : (rnd() - 0.5) * noise * close

    // After the trend phase the market holds (mild oscillation), so later
    // setups are not created but earlier ones keep their horizons intact.
    if (i >= rangeBars + trendBars) {
      // drift back slightly so we do not keep making new highs
      const retrace = sign * -0.001 * close * 0.5
      close += step * 0.4 + retrace
    } else {
      close += step
    }

    const high = opts.closeOnly ? close : close * (1 + (rnd() * 0.006 + 0.001))
    const low = opts.closeOnly ? close : close * (1 - (rnd() * 0.006 + 0.001))
    candles.push({
      timestamp: baseTime + i * DAY,
      open: opts.closeOnly ? close : close - step,
      high,
      low,
      close,
      volume: opts.withVolume ? Math.round(1_000_000 + rnd() * 4_000_000) : null,
    })
  }

  return { candles, trendStart: rangeBars }
}

export function closeOnlyFrom(f: Fixture): Candle[] {
  return f.candles.map((c) => ({
    timestamp: c.timestamp,
    open: c.close,
    high: c.close,
    low: c.close,
    close: c.close,
    volume: c.volume,
  }))
}

export function withVolume(f: Fixture): Candle[] {
  return f.candles.map((c) => ({
    ...c,
    volume: c.volume ?? Math.round(1_000_000 + mulberry32(c.timestamp)() * 4_000_000),
  }))
}

/** A deliberately short series (below minimumHistoricalBars). */
export function shortSeries(bars = 52): Candle[] {
  const rnd = mulberry32(7)
  let close = 100
  const out: Candle[] = []
  for (let i = 0; i < bars; i++) {
    close += (rnd() - 0.5) * 0.8
    out.push({
      timestamp: Date.UTC(2021, 0, 1) + i * DAY,
      open: close - 0.2,
      high: close,
      low: close,
      close,
      volume: null,
    })
  }
  return out
}

export function makeCandle(timestamp: number, close: number, high?: number, low?: number, volume?: number): Candle {
  const h = high ?? close
  const l = low ?? close
  return { timestamp, open: close, high: Math.max(h, close), low: Math.min(l, close), close, volume: volume ?? null }
}