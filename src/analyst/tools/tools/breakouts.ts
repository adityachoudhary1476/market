// ---------------------------------------------------------------------------
// Phase 2E — detectBreakouts
//
// Breakout/breakdown evidence from the Phase 2B engine: level breaches (S/R,
// MA, channel, range, Bollinger, ATR), new highs/lows and retests.
// ---------------------------------------------------------------------------

import type { AnalystTool, ToolResult } from '../types'
import { successResult, unavailableResult } from '../results'
import { requireTimeframe, requireInstrument } from '../validation'
import { ToolError } from '../errors'
import { errorResult } from '../results'

export interface BreakoutsInput {
  instrument: string
  /** 'intraday' | 'daily' | 'weekly', or an app timeframe. Default 'daily'. */
  timeframe?: string
}

export interface CompactBreakout {
  id: string
  name: string
  family: string
  direction: string
  status: string
  confidence: number
  level: number
  /** Percentage move through the level. */
  movePct: number | null
  detectedAt: number
}

export interface BreakoutsOutput {
  instrument: string
  timeframe: string
  breakouts: CompactBreakout[]
  summary: {
    total: number
    breakouts: number
    breakdowns: number
    byDirection: { bullish: number; bearish: number }
  }
}

export const detectBreakouts: AnalystTool<BreakoutsInput, BreakoutsOutput> = {
  name: 'detectBreakouts',
  description:
    'Use when asked whether an instrument broke a level — support/resistance, moving average, channel, range, Bollinger band, ATR, new high/low or a retest of a broken level.',
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
  run(input, context): ToolResult<BreakoutsOutput> {
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
      return unavailableResult<BreakoutsOutput>(this.name, 'technical-engine', {
        now: context.now,
        warnings: patterns?.dataQuality.warnings ?? ['Breakout detection unavailable for this instrument.'],
      })
    }

    const breakouts = patterns.breakouts.map((b) => ({
      id: b.id,
      name: b.name,
      family: b.family,
      direction: b.direction,
      status: b.status,
      confidence: b.confidence,
      level: b.level,
      movePct: 'movePct' in b && b.movePct != null ? (b.movePct as number) : null,
      detectedAt: b.detectedAt,
    }))

    let breakoutCount = 0
    let breakdownCount = 0
    let bullish = 0
    let bearish = 0
    for (const b of breakouts) {
      if (b.family === 'breakout') breakoutCount++
      else breakdownCount++
      if (b.direction === 'bullish') bullish++
      else if (b.direction === 'bearish') bearish++
    }

    const payload: BreakoutsOutput = {
      instrument: instrument.id,
      timeframe: timeframe.technical,
      breakouts,
      summary: { total: breakouts.length, breakouts: breakoutCount, breakdowns: breakdownCount, byDirection: { bullish, bearish } },
    }

    return successResult(this.name, 'technical-engine', payload, {
      available: true,
      now: context.now,
      warnings: patterns.dataQuality.warnings,
    })
  },
}