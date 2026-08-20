// ---------------------------------------------------------------------------
// Phase 2E — Tool Layer: default execution context
//
// createDefaultToolContext() wires the tools to the application's real,
// deterministic data modules. Caching is per-context (created once per
// request/agent turn) — never global — so repeated tool calls are cheap while
// each turn still observes a consistent dataset.
// ---------------------------------------------------------------------------

import { getIndexSeries, TERMINAL_INDICES } from '../../data/marketSeries'
import { terminalIndices } from '../../data/mockTerminalIndices'
import { terminalSectors } from '../../data/mockTerminalSectors'
import { terminalStocks } from '../../data/mockTerminalStocks'
import { marketBreadth } from '../../data/mockMarkets'
import { terminalMacro } from '../../data/mockMacro'
import { globalMarkets } from '../../data/mockGlobalMarkets'
import type { IndexSeries, MarketBreadth, Timeframe } from '../../types'
import type { MarketDataset, ToolContext, ToolDataSources } from './types'
import { validateHistory, localHistoricalDataProvider } from '../technical/historical'
import type { HistoricalValidationContext } from '../technical/historical'
import { buildTechnicalContext, candlesFromChartPoints, isIntradayTimestamps } from '../technical'
import type { StructuredTechnicalContext, TimeframeLabel } from '../technical'

function marketDataset(): MarketDataset {
  return {
    indices: terminalIndices,
    sectors: terminalSectors,
    breadth: marketBreadth,
    stocks: terminalStocks,
    macro: terminalMacro,
    global: globalMarkets,
  }
}

/**
 * Builds the default ToolContext backed by the application's deterministic
 * demo data. `now` fixes the wall clock for the whole turn so every tool's
 * metadata timestamp is identical and repeatable.
 */
export function createDefaultToolContext(now: number = Date.now()): ToolContext {
  const technicalCache = new Map<string, StructuredTechnicalContext>()
  const historicalCache = new Map<string, HistoricalValidationContext>()

  const data: ToolDataSources = {
    market: marketDataset,

    series(instrument: string, appTimeframe: Timeframe): IndexSeries {
      // getIndexSeries() falls back to nifty-50 for unknown ids — the tool
      // layer must never let that fallback fabricate evidence under a stock's
      // name, so unknown instruments get an empty series instead.
      if (!TERMINAL_INDICES.includes(instrument)) {
        return {
          symbol: instrument,
          timeframe: appTimeframe,
          points: [],
          current: 0,
          change: 0,
          changePct: 0,
          high: 0,
          low: 0,
          open: 0,
          prevClose: 0,
          trend: 'flat',
        }
      }
      return getIndexSeries(instrument, appTimeframe)
    },

    technical(instrument: string, timeframe: TimeframeLabel): StructuredTechnicalContext {
      const key = `${instrument}::${timeframe}`
      const cached = technicalCache.get(key)
      if (cached) return cached

      if (!TERMINAL_INDICES.includes(instrument)) {
        const empty = buildTechnicalContext(instrument, [], {
          timeframe,
          isIntraday: false,
        })
        empty.dataQuality.warnings = [
          `No series data available for '${instrument}'. Only index instruments (${TERMINAL_INDICES.join(', ')}) have series in this build.`,
        ]
        technicalCache.set(key, empty)
        return empty
      }

      const appTf: Timeframe =
        timeframe === 'intraday' ? '1D' : timeframe === 'daily' ? '3M' : '1Y'
      const series = getIndexSeries(instrument, appTf)
      const candles = candlesFromChartPoints(series.points)
      const ctx = buildTechnicalContext(instrument, candles, {
        timeframe,
        isIntraday: isIntradayTimestamps(series.points),
      })
      technicalCache.set(key, ctx)
      return ctx
    },

    historical(instrument: string, timeframe: TimeframeLabel): HistoricalValidationContext {
      const appTf: Timeframe =
        timeframe === 'intraday' ? '1D' : timeframe === 'daily' ? '3M' : '1Y'
      const key = `${instrument}::${appTf}`
      const cached = historicalCache.get(key)
      if (cached) return cached

      const ctx = validateHistory(localHistoricalDataProvider.getHistory(instrument, appTf))
      historicalCache.set(key, ctx)
      return ctx
    },
  }

  return { now, data }
}

export { TERMINAL_INDICES }
export type { IndexSeries, MarketBreadth }