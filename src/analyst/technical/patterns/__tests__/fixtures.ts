import type { Candle } from '../../types'

const DAY = 24 * 60 * 60 * 1000

function c(t: number, o: number, h: number, l: number, cl: number, v = 1_000_000): Candle {
  return { timestamp: t, open: o, high: h, low: l, close: cl, volume: v }
}

/** A clean uptrend of `n` daily candles. */
export function uptrend(n = 60, start = 100): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  return Array.from({ length: n }, (_, i) => {
    const prev = start + i
    const cl = start + i + 1
    return c(base + i * DAY, prev, cl + 0.3, prev - 0.3, cl)
  })
}

/** A clean downtrend. */
export function downtrend(n = 60, start = 200): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  return Array.from({ length: n }, (_, i) => {
    const prev = start - i
    const cl = start - i - 1
    return c(base + i * DAY, prev, prev + 0.3, cl - 0.3, cl)
  })
}

/** Constructs a double top: two equal highs with a trough between. */
export function doubleTop(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  const out: Candle[] = []
  // rise to 110
  for (let i = 0; i < 10; i++) out.push(c(base + out.length * DAY, 90 + i, 90 + i + 0.5, 89 + i, 90 + i + 1))
  // top 1 at 110
  out.push(c(base + out.length * DAY, 110, 110.5, 108, 110))
  // decline to 100
  for (let i = 0; i < 6; i++) out.push(c(base + out.length * DAY, 110 - i, 110 - i + 0.3, 100 + i - 6, 109 - i))
  // recover to 110 (top 2)
  for (let i = 0; i < 6; i++) out.push(c(base + out.length * DAY, 100 + i, 100 + i + 0.8, 99 + i, 101 + i))
  out.push(c(base + out.length * DAY, 110, 110.4, 108, 109.8))
  // break below neckline ~100
  for (let i = 0; i < 4; i++) out.push(c(base + out.length * DAY, 109 - i * 2, 109 - i * 2, 98 - i * 2, 99 - i * 2))
  return out
}

/** Constructs a double bottom: two near-equal lows with a peak between, then a neckline break. */
export function doubleBottom(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  const out: Candle[] = []
  // decline from 110 to ~92
  for (let i = 0; i < 10; i++) out.push(c(base + out.length * DAY, 111 - i * 2, 112 - i * 2, 110 - i * 2, 110 - i * 2))
  // first bottom ~90
  out.push(c(base + out.length * DAY, 92, 93, 89.5, 90))
  // rally to neckline ~102
  for (let i = 0; i < 5; i++) out.push(c(base + out.length * DAY, 90 + i * 2, 94 + i * 2, 89 + i * 2, 92 + i * 2))
  // decline back to ~90 (lows stay above 89.6)
  for (let i = 0; i < 5; i++) out.push(c(base + out.length * DAY, 100 - i * 2, 101 - i * 2, 92 - i, 98 - i * 2))
  // second bottom ~90
  out.push(c(base + out.length * DAY, 91, 92, 89.6, 90.2))
  // breakout above neckline
  for (let i = 0; i < 4; i++) out.push(c(base + out.length * DAY, 92 + i * 3, 94 + i * 3, 91 + i * 3, 93 + i * 3))
  return out
}

/** A clear bullish engulfing candle at the end of a decline. */
export function bullishEngulfing(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  const out: Candle[] = []
  for (let i = 0; i < 8; i++) out.push(c(base + i * DAY, 110 - i, 110 - i, 107 - i, 108 - i))
  // small bearish candle
  out.push(c(base + out.length * DAY, 102, 102.5, 100.5, 101))
  // large bullish engulfing
  out.push(c(base + out.length * DAY, 100.5, 105, 100.2, 104.5, 2_000_000))
  return out
}

/** A doji: open ≈ close with wicks. */
export function dojiCandle(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  return [
    c(base, 100, 101, 99, 100),
    c(base + DAY, 101, 102, 100, 101),
    c(base + 2 * DAY, 100, 102, 98, 100.05), // near-doji
  ]
}

/** A hammer at the end of a downtrend. */
export function hammerCandle(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  const out: Candle[] = []
  for (let i = 0; i < 8; i++) out.push(c(base + i * DAY, 110 - i, 110 - i, 107 - i, 108 - i))
  // hammer: small body at top, long lower wick
  out.push(c(base + out.length * DAY, 101, 101.5, 96, 101.4))
  return out
}

/** A shooting star at the end of an uptrend. */
export function shootingStarCandle(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  const out: Candle[] = []
  for (let i = 0; i < 8; i++) out.push(c(base + i * DAY, 100 + i, 101 + i, 99 + i, 101 + i))
  // shooting star: small bearish body at bottom, long upper wick
  out.push(c(base + out.length * DAY, 109.5, 115, 108.9, 108.9))
  return out
}

/** Morning star: bearish, small middle, bullish close into first range. */
export function morningStarCandle(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  return [
    c(base, 108, 109, 105, 106),
    c(base + DAY, 106, 106.5, 104, 105),
    c(base + 2 * DAY, 104, 105, 100.5, 101), // bearish, big
    c(base + 3 * DAY, 100.8, 101, 99.5, 100.2), // small body (star)
    c(base + 4 * DAY, 100, 104, 99.5, 103.5), // bullish close above first-open midpoint
  ]
}

/** Evening star: bullish, small middle, bearish close into first range. */
export function eveningStarCandle(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  return [
    c(base, 98, 99, 97, 98),
    c(base + DAY, 98, 99.5, 98, 99.3), // bullish, big
    c(base + 2 * DAY, 99.5, 100, 98.5, 99.2), // small body (star)
    c(base + 3 * DAY, 99.5, 99.8, 96, 96.5), // bearish close below first-open midpoint
  ]
}

/** A series with a clear resistance level then a breakout. */
export function resistanceBreakout(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  const out: Candle[] = []
  // base near 95-100, resistance at 100
  for (let i = 0; i < 25; i++) {
    const cl = 98 + Math.sin(i / 3) * 1.5
    out.push(c(base + i * DAY, cl, cl + 1, cl - 1, cl))
  }
  // strong breakout candle
  out.push(c(base + out.length * DAY, 100, 104, 99.5, 103.5, 3_000_000))
  return out
}

/** Close-only series (high=low=close), like the index data. */
export function closeOnlySeries(n = 52): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  let seed = 7
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  let p = 100
  return Array.from({ length: n }, (_, i) => {
    p = p + (rng() - 0.48) * 2
    return c(base + i * DAY, p, p, p, p, 1_000_000 + i * 1000)
  })
}

// --- False-positive datasets (§27) -----------------------------------------

/**
 * A random walk with enough pivots to tempt the detectors but no real
 * structure. A high-quality detector should find NO classic pattern here.
 */
export function randomWalk(n = 80, start = 100, vol = 1.2): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  let seed = 12345
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  let p = start
  const out: Candle[] = []
  for (let i = 0; i < n; i++) {
    p = p + (rng() - 0.5) * vol
    out.push(c(base + i * DAY, p, p + rng() * 0.6, p - rng() * 0.6, p, 1_000_000))
  }
  return out
}

/** Second "peak" sits well below the first (beyond the 2% tolerance). */
export function almostDoubleTop(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  const out: Candle[] = []
  for (let i = 0; i < 10; i++) out.push(c(base + out.length * DAY, 90 + i, 90 + i + 0.5, 89 + i, 90 + i + 1))
  out.push(c(base + out.length * DAY, 110, 110.5, 108, 110))
  for (let i = 0; i < 6; i++) out.push(c(base + out.length * DAY, 110 - i, 110 - i + 0.3, 104 - i, 108 - i))
  // second high only reaches ~106 — 3.6% below the first peak → NOT a double top
  for (let i = 0; i < 6; i++) out.push(c(base + out.length * DAY, 100 + i, 104 + i * 0.4, 99 + i, 102 + i))
  out.push(c(base + out.length * DAY, 105, 106.5, 104, 106))
  for (let i = 0; i < 4; i++) out.push(c(base + out.length * DAY, 105 - i, 105 - i, 100 - i, 102 - i))
  return out
}

/** Two equal highs only 3 bars apart — below the minimum 5-bar separation. */
export function insufficientSeparation(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  const out: Candle[] = []
  for (let i = 0; i < 10; i++) out.push(c(base + out.length * DAY, 90 + i, 90 + i + 0.5, 89 + i, 90 + i + 1))
  out.push(c(base + out.length * DAY, 110, 110.5, 108, 110))
  out.push(c(base + out.length * DAY, 109, 110, 108, 109))
  out.push(c(base + out.length * DAY, 108, 109, 107, 108))
  out.push(c(base + out.length * DAY, 108, 110, 107, 109.5))
  out.push(c(base + out.length * DAY, 109, 110.4, 108, 109.8))
  for (let i = 0; i < 4; i++) out.push(c(base + out.length * DAY, 109 - i * 2, 109 - i * 2, 105 - i * 2, 106 - i * 2))
  return out
}

/** Three highs but the "head" does not exceed the shoulders → no H&S. */
export function incompleteHeadAndShoulders(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  const out: Candle[] = []
  for (let i = 0; i < 8; i++) out.push(c(base + out.length * DAY, 95 + i, 96 + i, 94 + i, 95 + i))
  out.push(c(base + out.length * DAY, 108, 109, 106, 108)) // left shoulder
  for (let i = 0; i < 4; i++) out.push(c(base + out.length * DAY, 106 - i, 107 - i, 102 - i, 104 - i))
  out.push(c(base + out.length * DAY, 107, 108, 105, 107.5)) // head NOT above shoulder
  for (let i = 0; i < 4; i++) out.push(c(base + out.length * DAY, 105 - i, 106 - i, 101 - i, 103 - i))
  out.push(c(base + out.length * DAY, 106, 107, 104, 106.5)) // right shoulder
  for (let i = 0; i < 4; i++) out.push(c(base + out.length * DAY, 104 - i, 105 - i, 100 - i, 102 - i))
  return out
}

/** Close pokes above a flat range for one bar, then collapses back inside. */
export function fakeBreakout(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  const out: Candle[] = []
  for (let i = 0; i < 24; i++) {
    const cl = 98 + Math.sin(i / 3) * 1.5
    out.push(c(base + i * DAY, cl, cl + 1, cl - 1, cl))
  }
  // fake breakout: closes above 101 (range high ~100.5)
  out.push(c(base + out.length * DAY, 100.5, 102.5, 100, 101.8, 900_000))
  // immediately fails and returns inside
  out.push(c(base + out.length * DAY, 101, 101.5, 99, 99.5))
  out.push(c(base + out.length * DAY, 99.5, 100, 98.5, 99))
  return out
}

/** Breakout above a level, then a pullback that holds ABOVE the level. */
export function retestSeries(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  const out: Candle[] = []
  for (let i = 0; i < 22; i++) {
    const cl = 98 + Math.sin(i / 3) * 1.5
    out.push(c(base + i * DAY, cl, cl + 1, cl - 1, cl))
  }
  // breakout bar
  out.push(c(base + out.length * DAY, 100.5, 104, 100, 103.2, 3_000_000))
  // pullback that retests ~101 (the level) but holds above it
  out.push(c(base + out.length * DAY, 103, 103.5, 101.2, 102.5))
  out.push(c(base + out.length * DAY, 102.5, 104.5, 102, 104))
  return out
}

/** A market with no volume at all. */
export function noVolumeSeries(n = 60, start = 100): Candle[] {
  return uptrend(n, start).map((x) => ({ ...x, volume: null }))
}

/** A perfectly flat market — nothing should trigger. */
export function flatMarket(n = 60): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  return Array.from({ length: n }, (_, i) => c(base + i * DAY, 100, 100.2, 99.8, 100, 1_000_000))
}

/** Extreme-volatility candles — wicks far outside the body. */
export function extremeVolatility(n = 60, start = 100): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  const out: Candle[] = []
  for (let i = 0; i < n; i++) {
    const mid = start + (i % 6 < 3 ? 1 : -1)
    out.push(c(base + i * DAY, mid, mid + 4, mid - 4, mid + (i % 2 ? 0.3 : -0.3), 1_000_000))
  }
  return out
}

/** Duplicate timestamps — validation must reject the feed. */
export function duplicateTimestamps(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  return [
    c(base, 100, 101, 99, 100),
    c(base, 100, 101, 99, 100),
    c(base + DAY, 101, 102, 100, 101),
  ]
}

/** Malformed OHLC — high below low. */
export function malformedOHLC(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  return [
    c(base, 100, 101, 99, 100),
    c(base + DAY, 101, 99, 102, 101),
    c(base + 2 * DAY, 101, 102, 100, 101),
  ]
}
