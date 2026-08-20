// ---------------------------------------------------------------------------
// Phase 2E — compareInstruments
//
// Side-by-side comparison of 2-5 instruments on the same timeframe: quote
// change, trend, momentum bias, confluence bias and nearest levels. Every row
// carries its own `available` flag — a stock without a series is reported
// honestly, never filled in.
// ---------------------------------------------------------------------------

import type { AnalystTool, ToolResult } from '../types'
import { successResult } from '../results'
import { requireTimeframe, resolveInstrument } from '../validation'
import type { ResolvedInstrument } from '../validation'
import { ToolError } from '../errors'
import { errorResult } from '../results'

export interface ComparisonInput {
  /** 2-5 instrument ids/symbols. */
  instruments: string[]
  /** 'intraday' | 'daily' | 'weekly', or an app timeframe. Default 'daily'. */
  timeframe?: string
}

export interface ComparisonRow {
  id: string
  name: string
  type: 'index' | 'stock'
  available: boolean
  price: number | null
  changePct: number | null
  trend: string | null
  trendStrength: number | null
  momentumBias: string | null
  confluenceBias: string | null
  nearestSupport: number | null
  nearestResistance: number | null
  signalsCount: number | null
  warnings: string[]
}

export interface ComparisonOutput {
  timeframe: string
  instruments: ComparisonRow[]
  summary: {
    bestDailyMove: string | null
    worstDailyMove: string | null
    strongestTrend: string | null
    mostBullishMomentum: string | null
    mostBearishMomentum: string | null
  }
}

export const compareInstruments: AnalystTool<ComparisonInput, ComparisonOutput> = {
  name: 'compareInstruments',
  description:
    'Use to compare 2-5 instruments side-by-side on one timeframe: today\'s change, trend, momentum bias, confluence bias and nearest key levels.',
  inputSchema: {
    type: 'object',
    properties: {
      instruments: {
        type: 'array',
        description: 'Instrument ids/symbols to compare (2-5), e.g. ["nifty-50", "sensex", "bank-nifty"].',
      },
      timeframe: {
        type: 'string',
        description: "Timeframe: 'intraday', 'daily', 'weekly' or app timeframe. Default 'daily'.",
        enum: ['intraday', 'daily', 'weekly', '1D', '1W', '1M', '3M', '1Y', '5Y'],
        default: 'daily',
      },
    },
    required: ['instruments'],
  },
  run(input, context): ToolResult<ComparisonOutput> {
    let timeframe: ReturnType<typeof requireTimeframe>
    try {
      timeframe = requireTimeframe(input?.timeframe ?? 'daily')
    } catch (thrown) {
      const err = thrown instanceof ToolError ? thrown : ToolError.internal('Validation failed unexpectedly')
      return errorResult(this.name, 'market-data', err, { now: context.now })
    }

    if (!Array.isArray(input?.instruments) || input.instruments.length < 2 || input.instruments.length > 5) {
      return errorResult(this.name, 'market-data', ToolError.invalidInput("'instruments' must be an array of 2-5 instruments."), {
        now: context.now,
      })
    }

    const resolved: ResolvedInstrument[] = []
    for (const q of input.instruments) {
      const r = resolveInstrument(q)
      if (!r) {
        return errorResult(this.name, 'market-data', ToolError.unsupportedInstrument(String(q)), { now: context.now })
      }
      resolved.push(r)
    }

    const market = context.data.market()

    const rows: ComparisonRow[] = resolved.map((ins) => {
      const quoteChangePct =
        ins.type === 'index'
          ? market.indices.find((i) => i.id === ins.id)?.changePct ?? null
          : market.stocks.find((s) => s.symbol === ins.id)?.changePct ?? null
      const quotePrice =
        ins.type === 'index'
          ? market.indices.find((i) => i.id === ins.id)?.value ?? null
          : market.stocks.find((s) => s.symbol === ins.id)?.price ?? null

      const technical = context.data.technical(ins.id, timeframe.technical)
      if (!technical.available) {
        return {
          id: ins.id,
          name: ins.displayName,
          type: ins.type,
          available: false,
          price: quotePrice,
          changePct: quoteChangePct,
          trend: null,
          trendStrength: null,
          momentumBias: null,
          confluenceBias: null,
          nearestSupport: null,
          nearestResistance: null,
          signalsCount: null,
          warnings: technical.dataQuality.warnings,
        }
      }

      return {
        id: ins.id,
        name: ins.displayName,
        type: ins.type,
        available: true,
        price: technical.price.current,
        changePct: technical.price.changePercent ?? quoteChangePct,
        trend: technical.trend.overall.direction,
        trendStrength: technical.trend.overall.strength,
        momentumBias: technical.momentum.bias,
        confluenceBias: technical.confluence?.available ? technical.confluence.bias : null,
        nearestSupport: technical.supportResistance?.nearestSupport
          ? (technical.supportResistance.nearestSupport.low + technical.supportResistance.nearestSupport.high) / 2
          : null,
        nearestResistance: technical.supportResistance?.nearestResistance
          ? (technical.supportResistance.nearestResistance.low + technical.supportResistance.nearestResistance.high) / 2
          : null,
        signalsCount: technical.signals.length,
        warnings: [],
      }
    })

    const available = rows.filter((r) => r.available)
    const bestDailyMove = available.length ? available.reduce((a, b) => (b.changePct ?? -Infinity) > (a.changePct ?? -Infinity) ? b : a).id : null
    const worstDailyMove = available.length ? available.reduce((a, b) => (b.changePct ?? Infinity) < (a.changePct ?? Infinity) ? b : a).id : null
    const strongestTrend = available.length ? available.reduce((a, b) => (b.trendStrength ?? -Infinity) > (a.trendStrength ?? -Infinity) ? b : a).id : null
    const mostBullishMomentum = available.filter((r) => r.momentumBias === 'bullish').map((r) => r.id)[0] ?? null
    const mostBearishMomentum = available.filter((r) => r.momentumBias === 'bearish').map((r) => r.id)[0] ?? null

    const payload: ComparisonOutput = {
      timeframe: timeframe.technical,
      instruments: rows,
      summary: {
        bestDailyMove,
        worstDailyMove,
        strongestTrend,
        mostBullishMomentum,
        mostBearishMomentum,
      },
    }

    const warnings = rows.filter((r) => !r.available).map((r) => `No series for '${r.id}': technical columns are null.`)
    return successResult(this.name, 'market-data', payload, {
      available: true,
      now: context.now,
      warnings,
    })
  },
}