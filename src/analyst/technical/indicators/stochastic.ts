import type { Candle, StochasticResult, TrendDirection } from '../types'
import { last, previous } from '../numeric'

// Stochastic needs high/low. Returns insufficient-data on close-only feeds.

export function stochasticSeries(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3,
  smooth = 3,
): { k: (number | null)[]; d: (number | null)[] } | null {
  if (!candles.length) return null
  for (const c of candles) if (!(c.high > c.low)) return null

  const n = candles.length
  const rawK: (number | null)[] = new Array(n).fill(null)
  for (let i = kPeriod - 1; i < n; i++) {
    let hh = -Infinity
    let ll = Infinity
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high
      if (candles[j].low < ll) ll = candles[j].low
    }
    const range = hh - ll
    rawK[i] = range === 0 ? 50 : ((candles[i].close - ll) / range) * 100
  }

  const k: (number | null)[] = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    if (rawK[i] != null) {
      const w = rawK
        .slice(Math.max(0, i - smooth + 1), i + 1)
        .filter((v): v is number => v != null)
      if (w.length === smooth) k[i] = w.reduce((a, b) => a + b, 0) / smooth
    }
  }
  const d: (number | null)[] = new Array(n).fill(null)
  for (let i = dPeriod - 1; i < n; i++) {
    const w = k.slice(i - dPeriod + 1, i + 1).filter((v): v is number => v != null)
    if (w.length === dPeriod) d[i] = w.reduce((a, b) => a + b, 0) / dPeriod
  }
  return { k, d }
}

export function calculateStochastic(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3,
  smooth = 3,
  overbought = 80,
  oversold = 20,
): StochasticResult {
  const series = stochasticSeries(candles, kPeriod, dPeriod, smooth)
  const k = series ? last(series.k) ?? null : null
  const d = series ? last(series.d) ?? null : null
  const prevK = series ? previous(series.k) ?? null : null
  const prevD = series ? previous(series.d) ?? null : null

  let crossover: StochasticResult['crossover'] = 'none'
  if (k != null && d != null && prevK != null && prevD != null) {
    if (prevK <= prevD && k > d) crossover = 'bullish'
    else if (prevK >= prevD && k < d) crossover = 'bearish'
  }

  let zone: StochasticResult['zone'] = 'insufficient-data'
  if (k != null) {
    if (k >= overbought) zone = 'overbought'
    else if (k <= oversold) zone = 'oversold'
    else zone = 'neutral'
  }

  let direction: TrendDirection = 'insufficient-data'
  if (k != null && prevK != null) {
    direction = k > prevK + 0.05 ? 'rising' : k < prevK - 0.05 ? 'falling' : 'flat'
  }

  return {
    kPeriod,
    dPeriod,
    k: k != null ? Number(k.toFixed(2)) : null,
    d: d != null ? Number(d.toFixed(2)) : null,
    crossover,
    zone,
    direction,
  }
}
