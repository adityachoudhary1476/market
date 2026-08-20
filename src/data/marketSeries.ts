import type { IndexSeries, Timeframe, Trend, ChartPoint } from '@/types'

// ---------------------------------------------------------------------------
// Chart series generator (Markets terminal)
// Deterministic per (symbol, timeframe) so values are stable across renders
// and internally consistent (current/change/high/low all derive from the
// series). Uses its own seeded RNG — does not touch the homepage generators.
// ---------------------------------------------------------------------------

// Reference "now" for the demo — fixed so labels are stable.
const NOW = Date.UTC(2026, 7, 19, 10, 12) // 19 Aug 2026, 15:42 IST

// Anchors for each major index. `current` is the live price; `prevClose` is
// the prior session close (drives the 1D change); `dayHigh/Low` bracket the
// intraday range. All values are fictional / illustrative.
interface Anchor {
  current: number
  prevClose: number
  dayHigh: number
  dayLow: number
  decimals: number
}

const ANCHORS: Record<string, Anchor> = {
  'nifty-50': { current: 24816.45, prevClose: 24630.25, dayHigh: 24901.2, dayLow: 24604.15, decimals: 2 },
  sensex: { current: 81492.7, prevClose: 80918.92, dayHigh: 81742.1, dayLow: 80824.6, decimals: 2 },
  'bank-nifty': { current: 53218.9, prevClose: 52615.4, dayHigh: 53342.0, dayLow: 52598.3, decimals: 2 },
  'nifty-it': { current: 41286.35, prevClose: 41102.8, dayHigh: 41418.6, dayLow: 40988.25, decimals: 2 },
}

interface TFConfig {
  points: number
  startFrac: number // start = current * (1 + startFrac)
  vol: number // per-step volatility as fraction of price
  drift: number // per-step drift fraction (gives period trend)
  labelEvery: number // show an axis label every N points
}

const TF: Record<Timeframe, TFConfig> = {
  '1D': { points: 78, startFrac: -0.0012, vol: 0.0011, drift: 0.000018, labelEvery: 13 },
  '1W': { points: 35, startFrac: -0.013, vol: 0.0032, drift: 0.00045, labelEvery: 7 },
  '1M': { points: 44, startFrac: -0.034, vol: 0.005, drift: 0.00085, labelEvery: 8 },
  '3M': { points: 60, startFrac: -0.062, vol: 0.0075, drift: 0.0011, labelEvery: 12 },
  '1Y': { points: 52, startFrac: -0.145, vol: 0.009, drift: 0.0029, labelEvery: 10 },
  '5Y': { points: 60, startFrac: -0.52, vol: 0.012, drift: 0.011, labelEvery: 12 },
}

// Deterministic PRNG (mulberry32), seeded per symbol+timeframe.
function makeRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function trendFrom(v: number): Trend {
  if (Math.abs(v) < 0.02) return 'flat'
  return v > 0 ? 'up' : 'down'
}

// Build a realistic-looking close series by layering low-frequency sine waves
// (smooth trend) with light noise, then linearly rescaling so the series
// starts near an "open" gap and ends exactly at `current`, while the overall
// min/max fit within (or define) the day range.
function build1D(anchor: Anchor, rng: () => number, labelEvery: number): ChartPoint[] {
  const n = TF['1D'].points
  const out: ChartPoint[] = []
  const gap = anchor.prevClose * 0.0009
  const open = anchor.prevClose + gap
  const span = anchor.dayHigh - anchor.dayLow

  // session minutes from 9:15 to 15:30 = 375 min
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1)
    // smooth intraday shape: rise into midday, mild pullback, close firm
    const wave =
      Math.sin(f * Math.PI) * 0.55 +
      Math.sin(f * Math.PI * 2.3) * 0.18 +
      Math.sin(f * Math.PI * 5.1) * 0.07
    const noise = (rng() - 0.5) * 0.18
    let raw = 0.2 + wave * 0.7 + noise
    raw = Math.max(0.02, Math.min(0.98, raw))
    const price = anchor.dayLow + raw * span
    // session timestamp: 9:15 + i * ~4.87 min
    const t = NOW - (n - 1 - i) * 4.87 * 60 * 1000
    out.push({
      t,
      label: i % labelEvery === 0 ? labelFor('1D', t) : '',
      v: round(price, anchor.decimals),
      volume: intradayVolume(i, n, rng),
    })
  }
  // pin open and close
  out[0].v = round(open, anchor.decimals)
  out[n - 1].v = round(anchor.current, anchor.decimals)
  // Ensure the session actually prints the stated day high/low so the chart
  // agrees with the index card. Place them at realistic intraday locations.
  const hiIdx = Math.round(n * 0.62)
  const loIdx = Math.round(n * 0.18)
  if (hiIdx > 1 && hiIdx < n - 2) out[hiIdx].v = round(anchor.dayHigh, anchor.decimals)
  if (loIdx > 1 && loIdx < n - 2) out[loIdx].v = round(anchor.dayLow, anchor.decimals)
  return out
}

function buildMultiDay(
  anchor: Anchor,
  tf: Exclude<Timeframe, '1D'>,
  rng: () => number,
  labelEvery: number,
): ChartPoint[] {
  const cfg = TF[tf]
  const n = cfg.points
  const start = anchor.current * (1 + cfg.startFrac)
  const out: ChartPoint[] = []
  const stepMs = stepFor(tf)

  // raw trending series
  let v = start
  const raw: number[] = []
  for (let i = 0; i < n; i++) {
    const cycle =
      Math.sin(i / 7.5) * 0.6 +
      Math.sin(i / 3.1) * 0.25 +
      Math.sin(i / 13.0) * 0.4
    const noise = (rng() - 0.5) * 0.9
    v += cfg.drift * anchor.current + cycle * cfg.vol * anchor.current * 0.25 + noise * cfg.vol * anchor.current
    raw.push(v)
  }
  // rescale so last point = current
  const last = raw[n - 1]
  const scale = anchor.current / last
  const scaled = raw.map((x) => x * scale)

  for (let i = 0; i < n; i++) {
    const t = NOW - (n - 1 - i) * stepMs
    out.push({
      t,
      label: i % labelEvery === 0 ? labelFor(tf, t) : '',
      v: round(scaled[i], anchor.decimals),
      volume: multiDayVolume(rng),
    })
  }
  out[n - 1].v = round(anchor.current, anchor.decimals)
  return out
}

function stepFor(tf: Exclude<Timeframe, '1D'>): number {
  switch (tf) {
    case '1W':
      return 45 * 60 * 1000 // ~45m bars over 5 sessions
    case '1M':
      return 105 * 60 * 1000
    case '3M':
      return 1 * 24 * 60 * 60 * 1000 // daily
    case '1Y':
      return 7 * 24 * 60 * 60 * 1000 // weekly
    case '5Y':
      return 30 * 24 * 60 * 60 * 1000 // ~monthly
  }
}

function labelFor(tf: Timeframe, t: number): string {
  const d = new Date(t)
  if (tf === '1D' || tf === '1W' || tf === '1M') {
    return d.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    })
  }
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  })
}

// U-shaped intraday volume profile (open/close heavy).
function intradayVolume(i: number, n: number, rng: () => number): number {
  const f = i / (n - 1)
  const profile = 0.55 + 0.9 * Math.exp(-Math.pow((f - 0.05) * 6, 2)) + 0.8 * Math.exp(-Math.pow((f - 0.95) * 6, 2))
  return Math.round((8_000_000 + rng() * 6_000_000) * profile)
}

function multiDayVolume(rng: () => number): number {
  return Math.round(120_000_000 + rng() * 90_000_000)
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals)
  return Math.round(n * f) / f
}

export function getIndexSeries(id: string, timeframe: Timeframe): IndexSeries {
  const key = id in ANCHORS ? id : 'nifty-50'
  const anchor = ANCHORS[key]
  const rng = makeRng(hashStr(`${key}:${timeframe}`))

  const points =
    timeframe === '1D'
      ? build1D(anchor, rng, TF['1D'].labelEvery)
      : buildMultiDay(anchor, timeframe, rng, TF[timeframe].labelEvery)

  const values = points.map((p) => p.v)
  const high = round(Math.max(...values), anchor.decimals)
  const low = round(Math.min(...values), anchor.decimals)
  const open = points[0].v
  const prevClose = timeframe === '1D' ? anchor.prevClose : open
  const current = points[points.length - 1].v
  const change = round(current - prevClose, anchor.decimals)
  const changePct = round((change / prevClose) * 100, 2)

  return {
    symbol: key,
    timeframe,
    points,
    current,
    change,
    changePct,
    high,
    low,
    open,
    prevClose,
    trend: trendFrom(changePct),
  }
}

export const TERMINAL_INDICES: string[] = Object.keys(ANCHORS)
