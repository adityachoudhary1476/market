// ---------------------------------------------------------------------------
// Phase 2D — historical data providers
//
// The engine consumes candles ONLY through HistoricalDataProvider. The local
// provider adapts the application's existing series and reports honestly what
// kind of data it is: the current index series are deterministic demo data
// (fictional values, seeded RNG) — never presented as exchange facts.
// ---------------------------------------------------------------------------

import type { Candle } from '../types'
import type {
  HistoricalCapabilities,
  HistoricalDataProvider,
  HistoricalSeries,
} from './types'
import { getIndexSeries, TERMINAL_INDICES } from '@/data/marketSeries'
import { candlesFromChartPoints } from '../adapters'

const APP_TIMEFRAME_TO_TECHNICAL: Record<string, string> = {
  '1D': 'intraday',
  '1W': 'daily',
  '1M': 'daily',
  '3M': 'daily',
  '1Y': 'weekly',
  '5Y': 'weekly',
}

export const LOCAL_HISTORICAL_INSTRUMENTS: string[] = TERMINAL_INDICES

/** Resolve an application timeframe (1D/1M/1Y/...) to a technical label. */
export function resolveTechnicalTimeframe(tf: string): string | null {
  return APP_TIMEFRAME_TO_TECHNICAL[tf] ?? null
}

function capabilitiesOf(candles: Candle[]): HistoricalCapabilities {
  const hasHighLow = candles.some((c) => c.high > c.low)
  const hasVolume = candles.some((c) => c.volume != null && c.volume > 0)
  return { hasHighLow, hasVolume }
}

/**
 * Local provider over the application's deterministic demo series.
 * All values are fictional/illustrative — the engine must never present these
 * as exchange facts.
 */
export const localHistoricalDataProvider: HistoricalDataProvider = {
  getHistory(instrument: string, timeframe: string): HistoricalSeries {
    const known = TERMINAL_INDICES.includes(instrument)
    const technicalTf = resolveTechnicalTimeframe(timeframe)
    const warnings: string[] = []
    let candles: Candle[] = []
    let capabilities: HistoricalCapabilities = { hasHighLow: false, hasVolume: false }

    if (known && technicalTf) {
      const series = getIndexSeries(instrument, timeframe as Parameters<typeof getIndexSeries>[1])
      candles = candlesFromChartPoints(series.points)
      capabilities = capabilitiesOf(candles)
      warnings.push('Source is deterministic demo data with fictional values — statistics are illustrative, not market facts.')
      warnings.push('Historical universe may contain survivorship bias: only currently-listed instruments are present.')
      warnings.push('Corporate-action adjustment status unknown — prices may not be split/dividend adjusted.')
      if (!capabilities.hasHighLow) {
        warnings.push('Close-only index feed: MFE/MAE and H/L-dependent outcomes are unavailable.')
      }
      if (!capabilities.hasVolume) {
        warnings.push('Volume unavailable: volume-conditional breakdowns are disabled.')
      }
    } else {
      warnings.push(known ? `Timeframe '${timeframe}' is not supported for this instrument.` : `Unknown instrument '${instrument}'.`)
    }

    return {
      instrument,
      timeframe: technicalTf ?? timeframe,
      candles,
      capabilities,
      source: 'synthetic-demo',
      warnings,
    }
  },
}

export const DEFAULT_HISTORICAL_DATA_PROVIDER: HistoricalDataProvider = localHistoricalDataProvider