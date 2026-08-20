import type { Candle } from '../types'

// Deterministic fixtures for technical tests. These are synthetic but clearly
// test candles used ONLY to validate indicator math — they are never inserted
// into the analyst context (which uses real app series).

function round(n: number) {
  return Math.round(n * 100) / 100
}

/** 300 steadily rising daily candles with volume. Has H/L. */
export function risingCandles(count = 300, start = 100, step = 0.5): Candle[] {
  const day = 24 * 60 * 60 * 1000
  const base = Date.UTC(2025, 0, 1)
  let c = start
  return Array.from({ length: count }, (_, i) => {
    const o = c
    c = c + step
    // wicks must bracket BOTH open and close for valid OHLC
    const hi = Math.max(o, c) + 0.3
    const lo = Math.min(o, c) - 0.3
    return {
      timestamp: base + i * day,
      open: round(o),
      high: round(hi),
      low: round(lo),
      close: round(c),
      volume: 1_000_000 + ((i * 37) % 500_000),
    }
  })
}

/** 300 volatile daily candles built from a seeded pseudo-random walk. */
export function volatileCandles(count = 300, start = 100): Candle[] {
  const day = 24 * 60 * 60 * 1000
  const base = Date.UTC(2025, 0, 1)
  let seed = 42
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  let c = start
  return Array.from({ length: count }, (_, i) => {
    const o = c
    const ret = (rng() - 0.48) * 2
    c = Math.max(1, c + ret)
    const upWick = rng() * 0.8
    const dnWick = rng() * 0.8
    return {
      timestamp: base + i * day,
      open: round(o),
      high: round(Math.max(o, c) + upWick),
      low: round(Math.min(o, c) - dnWick),
      close: round(c),
      volume: Math.round(500_000 + rng() * 2_000_000),
    }
  })
}

/** 260 flat candles with volume and H/L equal-ish to close. */
export function flatCandles(count = 260, price = 100): Candle[] {
  const day = 24 * 60 * 60 * 1000
  const base = Date.UTC(2025, 0, 1)
  return Array.from({ length: count }, (_, i) => ({
    timestamp: base + i * day,
    open: price,
    high: price + 0.1,
    low: price - 0.1,
    close: price,
    volume: 1_000_000,
  }))
}

export function singleCandle(): Candle[] {
  return [{ timestamp: Date.UTC(2025, 0, 1), open: 100, high: 102, low: 99, close: 101, volume: 1_000_000 }]
}

/** Close-only candles (high=low=close, no volume) — mimics index ChartPoint data. */
export function closeOnlyCandles(count = 52, start = 100): Candle[] {
  const day = 24 * 60 * 60 * 1000
  const base = Date.UTC(2025, 0, 1)
  let seed = 7
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  let c = start
  return Array.from({ length: count }, (_, i) => {
    c = c + (rng() - 0.48) * 2
    return { timestamp: base + i * day, open: c, high: c, low: c, close: c, volume: null }
  })
}
