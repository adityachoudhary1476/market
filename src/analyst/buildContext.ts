import type { AnalystContext } from './types'
import { terminalIndices } from '../data/mockTerminalIndices'
import { terminalSectors } from '../data/mockTerminalSectors'
import { marketBreadth } from '../data/mockMarkets'
import { topGainers, topLosers, mostActive } from '../data/mockTerminalStocks'
import { terminalMacro } from '../data/mockMacro'
import { globalMarkets } from '../data/mockGlobalMarkets'
import { getIndexSeries } from '../data/marketSeries'
import { buildTechnicalContext } from './technical'
import { candlesFromChartPoints, isIntradayTimestamps } from './technical/adapters'
import { localHistoricalDataProvider } from './technical/historical/dataProvider'
import { validateHistory } from './technical/historical/validationEngine'

// ---------------------------------------------------------------------------
// buildAnalystContext()
//
// Produces a compact, normalized snapshot of the market for the analyst.
// This is the single hand-off point between application data and the analyst
// engine. When real APIs arrive, only this module changes — the engine and
// UI continue to consume the same typed context.
//
// Data is deliberately summarized (top N, not every instrument) to keep the
// context small and relevant, mirroring how a human analyst would brief.
// ---------------------------------------------------------------------------

export type MarketSnapshotData = Omit<AnalystContext, 'technical' | 'historicalValidation'>

/**
 * Build the compact, normalized market snapshot consumed by the analyst and
 * the Phase 2E tool layer. Data is deliberately summarized (top N, not every
 * instrument) to keep the context small and relevant, mirroring how a human
 * analyst would brief.
 */
export function buildMarketSnapshotData(): MarketSnapshotData {
  const total =
    marketBreadth.advancing + marketBreadth.declining + marketBreadth.unchanged || 1
  const advPct = (marketBreadth.advancing / total) * 100
  const ratio = marketBreadth.advancing / Math.max(1, marketBreadth.declining)

  const avgIndexPct =
    terminalIndices.reduce((s, i) => s + i.changePct, 0) /
    Math.max(1, terminalIndices.length)
  const globalUp = globalMarkets.filter((g) => g.trend === 'up').length

  // A simple, transparent "regime" classification — no black box.
  let regime: AnalystContext['regime'] = 'neutral'
  if (avgIndexPct > 0.4 && advPct > 55 && globalUp >= globalMarkets.length * 0.6) {
    regime = 'risk-on'
  } else if (avgIndexPct < -0.3 || advPct < 40) {
    regime = 'risk-off'
  } else if (Math.abs(avgIndexPct) < 0.3 && advPct >= 45) {
    regime = 'mixed'
  }

  return {
    generatedAt: new Date().toISOString(),
    regime,
    indices: terminalIndices.map((i) => ({
      id: i.id,
      symbol: i.symbol,
      name: i.name,
      value: i.value,
      changePct: i.changePct,
      trend: i.trend,
      prevClose: i.prevClose ?? i.value - i.change,
      dayHigh: i.dayHigh ?? i.value,
      dayLow: i.dayLow ?? i.value,
    })),
    sectors: terminalSectors.map((s) => ({
      id: s.id,
      name: s.name,
      changePct: s.changePct,
      strength: s.strength,
      advancers: s.advancers,
      decliners: s.decliners,
    })),
    breadth: {
      advancing: marketBreadth.advancing,
      declining: marketBreadth.declining,
      unchanged: marketBreadth.unchanged,
      newHighs: marketBreadth.newHighs,
      newLows: marketBreadth.newLows,
      ratio: Number(ratio.toFixed(2)),
      advPct: Number(advPct.toFixed(1)),
    },
    gainers: topGainers(5).map((s) => ({
      symbol: s.symbol,
      name: s.name,
      changePct: s.changePct,
      price: s.price,
      volume: s.volume,
      avgVolume: s.avgVolume,
      sector: s.sector,
    })),
    losers: topLosers(5).map((s) => ({
      symbol: s.symbol,
      name: s.name,
      changePct: s.changePct,
      price: s.price,
      volume: s.volume,
      avgVolume: s.avgVolume,
      sector: s.sector,
    })),
    active: mostActive(5).map((s) => ({
      symbol: s.symbol,
      name: s.name,
      changePct: s.changePct,
      volume: s.volume,
      relVolume: Number((s.volume / Math.max(1, s.avgVolume)).toFixed(2)),
      sector: s.sector,
    })),
    macro: terminalMacro.map((m) => ({
      id: m.id,
      label: m.label,
      value: m.value,
      changePct: m.changePct,
      ...(m.invertColor !== undefined ? { invertColor: m.invertColor } : {}),
    })),
    global: globalMarkets.map((g) => ({
      id: g.id,
      name: g.name,
      region: g.region,
      changePct: g.changePct,
      trend: g.trend,
    })),
  }
}

export function buildAnalystContext(): AnalystContext {
  const snapshot = buildMarketSnapshotData()
  return {
    ...snapshot,
    // Technical evidence from the genuine NIFTY 50 historical series already
    // present in the app. Close-only indicators (MA/RSI/MACD/BB/ROC/CCI/OBV
    // on volume) are computed; H/L- and volume-dependent indicators report
    // null honestly because the source is close-only. No candles fabricated.
    technical: (() => {
      const daily = getIndexSeries('nifty-50', '1Y')
      const candles = candlesFromChartPoints(daily.points)
      return buildTechnicalContext('NIFTY 50', candles, {
        timeframe: 'daily',
        isIntraday: isIntradayTimestamps(daily.points),
      })
    })(),
    // Empirical validation from the SAME series, walk-forward (zero lookahead).
    // With a 52-bar close-only demo feed the engine returns `available: false`
    // and says so — that is the correct, honest behaviour.
    historicalValidation: validateHistory(
      localHistoricalDataProvider.getHistory('nifty-50', '1Y'),
    ),
  }
}
