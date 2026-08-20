// ---------------------------------------------------------------------------
// Phase 2E — getMarketBreadth
//
// Market internals: advancing/declining/unchanged, new highs/lows and the
// derived advance ratio and breadth percentage, plus the index regime.
// ---------------------------------------------------------------------------

import { marketBreadth } from '../../../data/mockMarkets'
import { terminalIndices } from '../../../data/mockTerminalIndices'
import type { AnalystTool, ToolResult } from '../types'
import { successResult } from '../results'

export interface MarketBreadthInput {
  /** Number of index rows to attach (default 4). */
  indexLimit?: number
}

export interface MarketBreadthOutput {
  breadth: {
    advancing: number
    declining: number
    unchanged: number
    newHighs: number
    newLows: number
    ratio: number
    advPct: number
  }
  indices: {
    id: string
    symbol: string
    name: string
    value: number
    changePct: number
    trend: string
  }[]
}

export const getMarketBreadth: AnalystTool<MarketBreadthInput, MarketBreadthOutput> = {
  name: 'getMarketBreadth',
  description:
    'Use when the question is about market internals — how many stocks are rising vs falling, new highs vs new lows, or whether breadth confirms the index move.',
  inputSchema: {
    type: 'object',
    properties: {
      indexLimit: {
        type: 'number',
        description: 'Number of index rows to include (1-10).',
        minimum: 1,
        maximum: 10,
      },
    },
    required: [],
  },
  run(input, context): ToolResult<MarketBreadthOutput> {
    const limit = Math.min(
      10,
      Math.max(1, Math.round(typeof input?.indexLimit === 'number' ? input.indexLimit : 4)),
    )
    const total = marketBreadth.advancing + marketBreadth.declining + marketBreadth.unchanged || 1
    const ratio = Number((marketBreadth.advancing / Math.max(1, marketBreadth.declining)).toFixed(2))
    const advPct = Number(((marketBreadth.advancing / total) * 100).toFixed(1))

    const payload: MarketBreadthOutput = {
      breadth: {
        advancing: marketBreadth.advancing,
        declining: marketBreadth.declining,
        unchanged: marketBreadth.unchanged,
        newHighs: marketBreadth.newHighs,
        newLows: marketBreadth.newLows,
        ratio,
        advPct,
      },
      indices: terminalIndices.slice(0, limit).map((i) => ({
        id: i.id,
        symbol: i.symbol,
        name: i.name,
        value: i.value,
        changePct: i.changePct,
        trend: i.trend,
      })),
    }

    return successResult(this.name, 'market-data', payload, {
      available: true,
      now: context.now,
    })
  },
}