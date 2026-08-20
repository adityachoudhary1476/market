import type { Candle } from './types'
import type { ChartPoint } from '@/types'

// ---------------------------------------------------------------------------
// Adapters: convert the application's EXISTING data into Candle[] without
// fabricating missing fields.
//
// The app stores two kinds of historical data:
//  - Index series: ChartPoint { t, v, volume? }  (close + optional volume, no H/L)
//  - Stock intraday: [o,h,l,c][] tuples          (OHLC, no volume/timestamps)
//
// We map each honestly: close-only feeds set high=low=close (marking
// hasHighLow=false so H/L-dependent indicators return null), and OHLC tuples
// without volume get volume=null.
// ---------------------------------------------------------------------------

export function candlesFromChartPoints(points: ChartPoint[]): Candle[] {
  return points.map((p) => {
    // Close-only feed: high/low are set equal to close and open=close so the
    // candle is valid OHLC. getCapabilities() correctly reports hasHighLow=false
    // because no candle has a true high>low range, so H/L-dependent indicators
    // (ATR/ADX/Stoch/Ichimoku) return null rather than fabricated wicks.
    return {
      timestamp: p.t,
      open: p.v,
      high: p.v,
      low: p.v,
      close: p.v,
      volume: p.volume ?? null,
    }
  })
}

/** Convert stock intraday OHLC tuples [o,h,l,c] into candles with synthetic timestamps. */
export function candlesFromOHLCTuples(
  tuples: number[][],
  startTime = Date.UTC(2026, 7, 19, 3, 45), // 9:15 IST
  stepMs = 5 * 60 * 1000,
): Candle[] {
  return tuples.map((t, i) => {
    const [o, h, l, c] = t
    return {
      timestamp: startTime + i * stepMs,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: null, // the existing dataset has no intraday volume
    }
  })
}

export function isIntradayTimestamps(points: ChartPoint[]): boolean {
  if (points.length < 2) return false
  const span = points[points.length - 1].t - points[0].t
  // If the whole series is within ~2 days, treat as intraday.
  return span < 2 * 24 * 60 * 60 * 1000
}
