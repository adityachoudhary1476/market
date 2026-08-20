// ---------------------------------------------------------------------------
// Phase 2E — detectDivergences
//
// Divergence evidence from the Phase 2B engine: price-vs-oscillator
// divergences (regular/hidden, bullish/bearish) across RSI/MACD/MFI/CCI/WR.
// ---------------------------------------------------------------------------

import type { AnalystTool, ToolResult } from '../types'
import { successResult, unavailableResult } from '../results'
import { requireTimeframe, requireInstrument } from '../validation'
import { ToolError } from '../errors'
import { errorResult } from '../results'

export interface DivergencesInput {
  instrument: string
  /** 'intraday' | 'daily' | 'weekly', or an app timeframe. Default 'daily'. */
  timeframe?: string
}

export interface CompactDivergence {
  id: string
  name: string
  direction: string
  status: string
  confidence: number
  oscillator: string
  price1: { timestamp: number; price: number }
  price2: { timestamp: number; price: number }
  osc1: number
  osc2: number
  detectedAt: number
}

export interface DivergencesOutput {
  instrument: string
  timeframe: string
  divergences: CompactDivergence[]
  summary: {
    total: number
    byOscillator: Record<string, number>
    byDirection: { bullish: number; bearish: number }
  }
}

export const detectDivergences: AnalystTool<DivergencesInput, DivergencesOutput> = {
  name: 'detectDivergences',
  description:
    'Use when asked whether price and an oscillator (RSI, MACD, MFI, CCI, Williams %R) are disagreeing — divergence detection with pivots, direction and confidence.',
  inputSchema: {
    type: 'object',
    properties: {
      instrument: {
        type: 'string',
        description: 'Instrument id/symbol, e.g. "nifty-50".',
      },
      timeframe: {
        type: 'string',
        description: "Timeframe: 'intraday', 'daily', 'weekly' or app timeframe. Default 'daily'.",
        enum: ['intraday', 'daily', 'weekly', '1D', '1W', '1M', '3M', '1Y', '5Y'],
        default: 'daily',
      },
    },
    required: ['instrument'],
  },
  run(input, context): ToolResult<DivergencesOutput> {
    let instrument: ReturnType<typeof requireInstrument>
    let timeframe: ReturnType<typeof requireTimeframe>
    try {
      instrument = requireInstrument(input?.instrument)
      timeframe = requireTimeframe(input?.timeframe ?? 'daily')
    } catch (thrown) {
      const err = thrown instanceof ToolError ? thrown : ToolError.internal('Validation failed unexpectedly')
      return errorResult(this.name, 'technical-engine', err, { now: context.now })
    }

    const technical = context.data.technical(instrument.id, timeframe.technical)
    const patterns = technical.patterns

    if (!patterns || !patterns.available) {
      return unavailableResult<DivergencesOutput>(this.name, 'technical-engine', {
        now: context.now,
        warnings: patterns?.dataQuality.warnings ?? ['Divergence detection unavailable for this instrument.'],
      })
    }

    const divergences = patterns.divergences.map((d) => ({
      id: d.id,
      name: d.name,
      direction: d.direction,
      status: d.status,
      confidence: d.confidence,
      oscillator: d.oscillator,
      price1: { timestamp: d.pivots.price1.timestamp, price: d.pivots.price1.price },
      price2: { timestamp: d.pivots.price2.timestamp, price: d.pivots.price2.price },
      osc1: d.pivots.osc1,
      osc2: d.pivots.osc2,
      detectedAt: d.detectedAt,
    }))

    const byOscillator: Record<string, number> = {}
    let bullish = 0
    let bearish = 0
    for (const d of divergences) {
      byOscillator[d.oscillator] = (byOscillator[d.oscillator] ?? 0) + 1
      if (d.direction === 'bullish') bullish++
      else if (d.direction === 'bearish') bearish++
    }

    const payload: DivergencesOutput = {
      instrument: instrument.id,
      timeframe: timeframe.technical,
      divergences,
      summary: { total: divergences.length, byOscillator, byDirection: { bullish, bearish } },
    }

    return successResult(this.name, 'technical-engine', payload, {
      available: true,
      now: context.now,
      warnings: patterns.dataQuality.warnings,
    })
  },
}