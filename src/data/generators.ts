// Deterministic pseudo-random generator so mock data is stable across renders
// but still looks organic. Replace with real API data later.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rng = mulberry32(20260819)

/** Generate a realistic-looking bounded sparkline series. */
export function generateSpark(
  points: number,
  start: number,
  volatility: number,
  drift = 0,
): number[] {
  const out: number[] = []
  let v = start
  for (let i = 0; i < points; i++) {
    const shock = (rng() - 0.5) * 2 * volatility
    v = Math.max(0, v + shock + drift)
    out.push(Number(v.toFixed(2)))
  }
  return out
}

/** Build OHLC candles around a trending mid-price. */
export function generateCandles(
  count: number,
  start: number,
  volatility: number,
  drift = 0,
): [number, number, number, number][] {
  const candles: [number, number, number, number][] = []
  let prevClose = start
  for (let i = 0; i < count; i++) {
    const open = prevClose
    const close = Math.max(1, open + (rng() - 0.5) * 2 * volatility + drift)
    const high = Math.max(open, close) + rng() * volatility * 0.6
    const low = Math.min(open, close) - rng() * volatility * 0.6
    candles.push([
      Number(open.toFixed(2)),
      Number(high.toFixed(2)),
      Number(Math.max(0.5, low).toFixed(2)),
      Number(close.toFixed(2)),
    ])
    prevClose = close
  }
  return candles
}

export function trendFromChange(changePct: number): 'up' | 'down' | 'flat' {
  if (Math.abs(changePct) < 0.05) return 'flat'
  return changePct > 0 ? 'up' : 'down'
}
