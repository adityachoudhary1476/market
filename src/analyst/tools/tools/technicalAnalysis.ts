// ---------------------------------------------------------------------------
// Phase 2E — getTechnicalAnalysis
//
// Compact technical evidence for one instrument on one timeframe, straight
// from the Phase 2A engine: trend, momentum, volatility, volume, structure,
// key levels and the generated signals. Compact by design — the full engine
// context stays internal; only the summary crosses the tool boundary.
// ---------------------------------------------------------------------------

import type { AnalystTool, ToolResult } from '../types'
import { successResult, unavailableResult } from '../results'
import { requireTimeframe, requireInstrument } from '../validation'
import { ToolError } from '../errors'
import { errorResult } from '../results'

export interface TechnicalAnalysisInput {
  instrument: string
  /** 'intraday' | 'daily' | 'weekly', or app timeframe '1D'..'5Y'. Default 'daily'. */
  timeframe?: string
  /** Max key levels to include (0-10). Default 4. */
  levelLimit?: number
  /** Include the full signal list. Default true. */
  includeSignals?: boolean
}

export interface CompactLevel {
  type: 'support' | 'resistance'
  low: number
  high: number
  strength: number
  touches: number
}

export interface TechnicalAnalysisOutput {
  instrument: string
  timeframe: string
  price: {
    current: number
    change: number | null
    changePercent: number | null
  }
  dataQuality: {
    candleCount: number
    hasHighLow: boolean
    hasVolume: boolean
    warnings: string[]
  }
  trend: {
    shortTerm: { direction: string; strength: number }
    mediumTerm: { direction: string; strength: number }
    longTerm: { direction: string; strength: number }
    overall: { direction: string; strength: number }
  }
  momentum: {
    rsi: number | null
    macdHistogram: number | null
    stochasticK: number | null
    roc: number | null
    cci: number | null
    williamsR: number | null
    bias: string
  }
  volatility: {
    atrPercent: number | null
    bollingerBandwidth: number | null
    state: string
    change: string
  }
  volume: {
    relativeVolume: number | null
    state: string
    priceVolume: string
    available: boolean
  }
  structure: {
    state: string
    higherHighs: number
    higherLows: number
    lowerHighs: number
    lowerLows: number
  }
  supportResistance: {
    nearestSupport: CompactLevel | null
    nearestResistance: CompactLevel | null
    distanceToResistancePercent: number | null
    distanceToSupportPercent: number | null
    levels: CompactLevel[]
  }
  signals: {
    id: string
    category: string
    name: string
    direction: string
    strength: number
    confidence: number
  }[]
}

export const getTechnicalAnalysis: AnalystTool<TechnicalAnalysisInput, TechnicalAnalysisOutput> = {
  name: 'getTechnicalAnalysis',
  description:
    'Use when asked to analyze one instrument\'s chart: trend, momentum (RSI/MACD), volatility, volume, market structure, key support/resistance levels and engine signals. One instrument per call; pick a timeframe when needed.',
  inputSchema: {
    type: 'object',
    properties: {
      instrument: {
        type: 'string',
        description: 'Instrument id/symbol, e.g. "nifty-50", "sensex", "bank-nifty", "nifty-it" or a stock symbol.',
      },
      timeframe: {
        type: 'string',
        description: "Timeframe: 'intraday', 'daily', 'weekly', or an app timeframe '1D'..'5Y'. Default 'daily'.",
        enum: ['intraday', 'daily', 'weekly', '1D', '1W', '1M', '3M', '1Y', '5Y'],
        default: 'daily',
      },
      levelLimit: {
        type: 'number',
        description: 'Maximum key levels to include (0-10).',
        minimum: 0,
        maximum: 10,
      },
      includeSignals: {
        type: 'boolean',
        description: 'Include the engine signal list. Default true.',
      },
    },
    required: ['instrument'],
  },
  run(input, context): ToolResult<TechnicalAnalysisOutput> {
    let instrument: ReturnType<typeof requireInstrument>
    let timeframe: ReturnType<typeof requireTimeframe>
    try {
      instrument = requireInstrument(input?.instrument)
      timeframe = requireTimeframe(input?.timeframe ?? 'daily')
    } catch (thrown) {
      const err = thrown instanceof ToolError ? thrown : ToolError.internal('Validation failed unexpectedly')
      return errorResult(this.name, 'technical-engine', err, { now: context.now })
    }

    const ctx = context.data.technical(instrument.id, timeframe.technical)

    if (!ctx.available) {
      return unavailableResult<TechnicalAnalysisOutput>(this.name, 'technical-engine', {
        now: context.now,
        warnings: ctx.dataQuality.warnings.length ? ctx.dataQuality.warnings : ['Technical context unavailable for this instrument.'],
      })
    }

    const levelLimit = Math.min(10, Math.max(0, Math.round(input?.levelLimit ?? 4)))
    const includeSignals = input?.includeSignals !== false

    const levels: CompactLevel[] = (ctx.supportResistance?.levels ?? [])
      .slice(0, levelLimit)
      .map((l) => ({ type: l.type, low: l.low, high: l.high, strength: l.strength, touches: l.touches }))

    const payload: TechnicalAnalysisOutput = {
      instrument: instrument.id,
      timeframe: timeframe.technical,
      price: {
        current: ctx.price.current,
        change: ctx.price.change,
        changePercent: ctx.price.changePercent,
      },
      dataQuality: {
        candleCount: ctx.dataQuality.candleCount,
        hasHighLow: ctx.dataQuality.hasHighLow,
        hasVolume: ctx.dataQuality.hasVolume,
        warnings: ctx.dataQuality.warnings,
      },
      trend: {
        shortTerm: { direction: ctx.trend.shortTerm.direction, strength: ctx.trend.shortTerm.strength },
        mediumTerm: { direction: ctx.trend.mediumTerm.direction, strength: ctx.trend.mediumTerm.strength },
        longTerm: { direction: ctx.trend.longTerm.direction, strength: ctx.trend.longTerm.strength },
        overall: { direction: ctx.trend.overall.direction, strength: ctx.trend.overall.strength },
      },
      momentum: {
        rsi: ctx.momentum.rsi,
        macdHistogram: ctx.momentum.macdHistogram,
        stochasticK: ctx.momentum.stochasticK,
        roc: ctx.momentum.roc,
        cci: ctx.momentum.cci,
        williamsR: ctx.momentum.williamsR,
        bias: ctx.momentum.bias,
      },
      volatility: {
        atrPercent: ctx.volatility.atrPercent,
        bollingerBandwidth: ctx.volatility.bollingerBandwidth,
        state: ctx.volatility.state,
        change: ctx.volatility.change,
      },
      volume: {
        relativeVolume: ctx.volume.relativeVolume,
        state: ctx.volume.state,
        priceVolume: ctx.volume.priceVolume,
        available: ctx.volume.available,
      },
      structure: {
        state: ctx.structure.state,
        higherHighs: ctx.structure.higherHighs,
        higherLows: ctx.structure.higherLows,
        lowerHighs: ctx.structure.lowerHighs,
        lowerLows: ctx.structure.lowerLows,
      },
      supportResistance: {
        nearestSupport: ctx.supportResistance?.nearestSupport
          ? { type: 'support', low: ctx.supportResistance.nearestSupport.low, high: ctx.supportResistance.nearestSupport.high, strength: ctx.supportResistance.nearestSupport.strength, touches: ctx.supportResistance.nearestSupport.touches }
          : null,
        nearestResistance: ctx.supportResistance?.nearestResistance
          ? { type: 'resistance', low: ctx.supportResistance.nearestResistance.low, high: ctx.supportResistance.nearestResistance.high, strength: ctx.supportResistance.nearestResistance.strength, touches: ctx.supportResistance.nearestResistance.touches }
          : null,
        distanceToResistancePercent: ctx.supportResistance?.distanceToResistancePercent ?? null,
        distanceToSupportPercent: ctx.supportResistance?.distanceToSupportPercent ?? null,
        levels,
      },
      signals: includeSignals
        ? ctx.signals.map((s) => ({
            id: s.id,
            category: s.category,
            name: s.name,
            direction: s.direction,
            strength: s.strength,
            confidence: s.confidence,
          }))
        : [],
    }

    return successResult(this.name, 'technical-engine', payload, {
      available: true,
      now: context.now,
      warnings: ctx.dataQuality.warnings,
    })
  },
}