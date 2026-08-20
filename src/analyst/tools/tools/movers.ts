// ---------------------------------------------------------------------------
// Phase 2E — getMarketMovers
//
// Stock-level movers from the deterministic universe: top gainers, top
// losers, most active, and stocks near their week high/low.
// ---------------------------------------------------------------------------

import {
  topGainers,
  topLosers,
  mostActive,
  nearWeekHigh,
  nearWeekLow,
} from '../../../data/mockTerminalStocks'
import type { AnalystTool, ToolResult } from '../types'
import { successResult } from '../results'
import { clampInteger, optionalString } from '../validation'
import { ToolError } from '../errors'
import { errorResult } from '../results'

export type MoversCategory = 'gainers' | 'losers' | 'active' | 'near-high' | 'near-low'

export interface MoversInput {
  /** Which movers list. Default 'gainers'. */
  category?: string
  /** Max rows (1-20). Default 5. */
  limit?: number
}

export interface MoverRow {
  symbol: string
  name: string
  changePct: number
  price: number
  volume: number
  avgVolume: number
  relVolume?: number
  sector: string
}

export interface MoversOutput {
  category: MoversCategory
  movers: MoverRow[]
}

const CATEGORIES: MoversCategory[] = ['gainers', 'losers', 'active', 'near-high', 'near-low']

export const getMarketMovers: AnalystTool<MoversInput, MoversOutput> = {
  name: 'getMarketMovers',
  description:
    'Use to answer "what is moving today": top gainers, top losers, most active stocks, or stocks near their week-high or week-low.',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: "List: 'gainers', 'losers', 'active', 'near-high' or 'near-low'.",
        enum: CATEGORIES,
        default: 'gainers',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of rows.',
        minimum: 1,
        maximum: 20,
      },
    },
    required: [],
  },
  run(input, context): ToolResult<MoversOutput> {
    const categoryRaw = optionalString(input?.category, 'category')
    const category: MoversCategory = categoryRaw ? (categoryRaw as MoversCategory) : 'gainers'
    if (!CATEGORIES.includes(category)) {
      return errorResult(this.name, 'market-data', ToolError.invalidInput(`'category' must be one of: ${CATEGORIES.join(', ')}.`), {
        now: context.now,
      })
    }

    const limit = clampInteger(input?.limit, 'limit', 1, 20, 5)

    const source =
      category === 'gainers'
        ? topGainers(limit)
        : category === 'losers'
          ? topLosers(limit)
          : category === 'active'
            ? mostActive(limit)
            : category === 'near-high'
              ? nearWeekHigh(limit)
              : nearWeekLow(limit)

    const movers: MoverRow[] = source.map((s) => ({
      symbol: s.symbol,
      name: s.name,
      changePct: s.changePct,
      price: s.price,
      volume: s.volume,
      avgVolume: s.avgVolume,
      relVolume: category === 'active' ? Number((s.volume / Math.max(1, s.avgVolume)).toFixed(2)) : undefined,
      sector: s.sector,
    }))

    return successResult(this.name, 'market-data', { category, movers }, {
      available: true,
      now: context.now,
    })
  },
}