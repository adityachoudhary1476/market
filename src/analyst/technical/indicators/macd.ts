import type { Candle, MACDResult, TrendDirection } from '../types'
import { emaSeries, last, previous } from '../numeric'

export function macdSeries(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signalP = 9,
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const close = candles.map((c) => c.close)
  const emaFast = emaSeries(close, fast)
  const emaSlow = emaSeries(close, slow)

  const macdLine: (number | null)[] = close.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? (emaFast[i] as number) - (emaSlow[i] as number) : null,
  )

  const signal: (number | null)[] = new Array(close.length).fill(null)
  const firstValid = macdLine.findIndex((v) => v != null)
  if (firstValid >= 0) {
    const valid = macdLine.slice(firstValid).map((v) => v as number)
    if (valid.length >= signalP) {
      const k = 2 / (signalP + 1)
      let s = valid.slice(0, signalP).reduce((a, b) => a + b, 0) / signalP
      for (let i = 0; i < valid.length; i++) {
        if (i < signalP) continue
        if (i === signalP) signal[firstValid + i] = s
        else {
          s = valid[i] * k + s * (1 - k)
          signal[firstValid + i] = s
        }
      }
    }
  }

  const histogram = macdLine.map((m, i) =>
    m != null && signal[i] != null ? m - (signal[i] as number) : null,
  )
  return { macd: macdLine, signal, histogram }
}

export function calculateMACD(candles: Candle[], fast = 12, slow = 26, signalP = 9): MACDResult {
  const { macd, signal, histogram } = macdSeries(candles, fast, slow, signalP)
  const macdLine = last(macd) ?? null
  const signalLine = last(signal) ?? null
  const hist = last(histogram) ?? null
  const prevHist = previous(histogram) ?? null

  let histogramDirection: TrendDirection = 'insufficient-data'
  if (hist != null && prevHist != null) {
    histogramDirection = hist > prevHist + 1e-9 ? 'rising' : hist < prevHist - 1e-9 ? 'falling' : 'flat'
  }

  let crossover: MACDResult['crossover'] = 'none'
  if (hist != null && prevHist != null) {
    if (prevHist <= 0 && hist > 0) crossover = 'bullish'
    else if (prevHist >= 0 && hist < 0) crossover = 'bearish'
  }

  return {
    fast,
    slow,
    signalPeriod: signalP,
    macd: macdLine != null ? Number(macdLine.toFixed(4)) : null,
    signal: signalLine != null ? Number(signalLine.toFixed(4)) : null,
    histogram: hist != null ? Number(hist.toFixed(4)) : null,
    histogramDirection,
    crossover,
  }
}
