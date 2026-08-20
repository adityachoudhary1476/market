// Shared pure numeric helpers for the technical engine.

export function mean(values: number[]): number {
  if (values.length === 0) return NaN
  let s = 0
  for (const v of values) s += v
  return s / values.length
}

export function sum(values: number[]): number {
  let s = 0
  for (const v of values) s += v
  return s
}

export function stddevPop(values: number[]): number {
  if (values.length === 0) return NaN
  const m = mean(values)
  let s = 0
  for (const v of values) s += (v - m) ** 2
  return Math.sqrt(s / values.length)
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null
  let s = 0
  for (let i = values.length - period; i < values.length; i++) s += values[i]
  return s / period
}

export function smaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  if (period <= 0) return out
  let running = 0
  for (let i = 0; i < values.length; i++) {
    running += values[i]
    if (i >= period) running -= values[i - period]
    if (i >= period - 1) out[i] = running / period
  }
  return out
}

/** EMA seeded with the SMA of the first `period` values (Wilder convention). */
export function ema(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null
  const k = 2 / (period + 1)
  let s = 0
  for (let i = 0; i < period; i++) s += values[i]
  let prev = s / period
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
  }
  return prev
}

export function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  if (values.length < period || period <= 0) return out
  const k = 2 / (period + 1)
  let s = 0
  for (let i = 0; i < period; i++) s += values[i]
  let prev = s / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

export function last<T>(arr: T[]): T | undefined {
  return arr.length ? arr[arr.length - 1] : undefined
}

export function previous<T>(arr: T[], n = 1): T | undefined {
  return arr.length > n ? arr[arr.length - 1 - n] : undefined
}

export function round(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

export function linearSlope(values: (number | null)[], window = 5): number | null {
  const recent = values.slice(-window).filter((v): v is number => v != null)
  if (recent.length < 2) return null
  const n = recent.length
  const xs = Array.from({ length: n }, (_, i) => i)
  const mx = mean(xs)
  const my = mean(recent)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (recent[i] - my)
    den += (xs[i] - mx) ** 2
  }
  return den === 0 ? 0 : num / den
}

export function directionOf(values: (number | null)[], lookback = 1): TrendDirection {
  const a = last(values)
  const b = previous(values, lookback)
  if (a == null || b == null) return 'insufficient-data'
  const eps = Math.abs(b) * 1e-6 + 1e-9
  if (a > b + eps) return 'rising'
  if (a < b - eps) return 'falling'
  return 'flat'
}

export type TrendDirection = 'rising' | 'falling' | 'flat' | 'insufficient-data'
