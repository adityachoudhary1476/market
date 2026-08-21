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
import type { MarketDataset, ToolContext, ToolDataSources, ToolDataMode } from './types'
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
export interface DefaultToolContextOptions {
  marketDataEndpoint?: string
}

function browserMarketDataEndpoint(): string | undefined {
  try {
    const api = (import.meta.env as Record<string, string | undefined>).FINOVA_ANALYST_API_URL
    if (!api) return undefined
    const url = new URL(api)
    url.pathname = url.pathname.replace(/\/analyze\/?$/, '/market-data')
    if (!url.pathname.endsWith('/market-data')) url.pathname = '/api/market-data'
    return url.toString()
  } catch {
    return undefined
  }
}

export function createDefaultToolContext(now: number = Date.now(), options: DefaultToolContextOptions = {}): ToolContext {
  const technicalCache = new Map<string, StructuredTechnicalContext>()
  const historicalCache = new Map<string, HistoricalValidationContext>()

  let dataset = marketDataset()
  let dataMode: ToolDataMode = 'synthetic-demo'
  const data: ToolDataSources = {
    market: () => dataset,

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

  const endpoint = options.marketDataEndpoint ?? browserMarketDataEndpoint()
  const refresh = endpoint
    ? async (): Promise<void> => {
        try {
          const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
          if (!response.ok) return
          const body = (await response.json()) as { instruments?: Record<string, { value: number; timestamp: string; dataMode?: ToolDataMode; change?: number; changePct?: number }> }
          const instruments = body.instruments ?? {}
          const macro = dataset.macro.map((item) => {
            const key = item.id === 'brent' ? 'brent' : item.id === 'gold' ? 'gold' : item.id === 'wti' ? 'wti' : item.id === 'bitcoin' ? 'btc' : item.id === 'ethereum' ? 'eth' : item.id === 'eurusd' ? 'eurusd' : item.id === 'gbpusd' ? 'gbpusd' : item.id === 'usdjpy' ? 'usdjpy' : item.id === 'usdinr' ? 'usdinr' : null
            const point = key ? instruments[key] : undefined
            if (!point || !Number.isFinite(point.value)) return item
            const updated = { ...item, value: String(point.value), changePct: point.changePct ?? 0, change: point.change } as Record<string, unknown>
            if (point.dataMode) updated.dataMode = point.dataMode
            return updated as unknown as typeof item
          })
          const extra = Object.entries(instruments)
            .filter(([key]) => !macro.some((item) => item.id === key))
            .map(([key, point]) => {
              const labels: Record<string, string> = {
                nifty: 'NIFTY 50',
                sensex: 'SENSEX',
                banknifty: 'BANK NIFTY',
                niftyit: 'NIFTY IT',
              }
              const units: Record<string, string> = {
                nifty: 'pts',
                sensex: 'pts',
                banknifty: 'pts',
                niftyit: 'pts',
              }
              return {
                id: key,
                label: labels[key] ?? key.toUpperCase(),
                value: String(point.value),
                changePct: point.changePct ?? 0,
                change: point.change,
                trend: (point.changePct !== undefined ? (point.changePct > 0 ? 'up' : point.changePct < 0 ? 'down' : 'flat') : 'flat') as 'up' | 'down' | 'flat',
                unit: units[key] ?? 'pts',
                dataMode: point.dataMode ?? 'delayed',
              }
            })
          if (Object.keys(instruments).length > 0) {
            dataset = { ...dataset, macro: [...macro, ...extra] }
            dataMode = 'daily'
          }
        } catch {
          // Keep the explicit synthetic dataset when the optional free source is unavailable.
        }
      }
    : undefined

  return { now, data, ...(refresh ? { refresh } : {}), get dataMode() { return dataMode } }
}

export { TERMINAL_INDICES }
export type { IndexSeries, MarketBreadth }