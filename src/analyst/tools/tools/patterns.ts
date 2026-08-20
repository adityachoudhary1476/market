// ---------------------------------------------------------------------------
// Phase 2E — detectPatterns
//
// Pattern-detection evidence from the Phase 2B engine: candlestick patterns,
// chart patterns and the combined ranked list with lifecycle and summary.
// Detection only — no prose, no recommendations.
// ---------------------------------------------------------------------------

import type { AnalystTool, ToolResult } from '../types'
import { successResult, unavailableResult } from '../results'
import { requireTimeframe, requireInstrument } from '../validation'
import { ToolError } from '../errors'
import { errorResult } from '../results'

export interface PatternsInput {
  instrument: string
  /** 'intraday' | 'daily' | 'weekly', or an app timeframe. Default 'daily'. */
  timeframe?: string
  /** Max patterns in the ranked list (1-30). Default 15. */
  limit?: number
}

export interface CompactPattern {
  id: string
  name: string
  family: string
  direction: string
  status: string
  confidence: number
  detectedAt: number
}

export interface PatternsOutput {
  instrument: string
  timeframe: string
  barCount: number
  hasOHLC: boolean
  hasVolume: boolean
  summary: {
    total: number
    directionalBias: string
    byFamily: Record<string, { count: number; bullish: number; bearish: number; neutral: number }>
    lifecycle: Record<string, number>
  }
  active: CompactPattern[]
  recent: CompactPattern[]
  ranked: CompactPattern[]
  dataQuality: {
    candleCount: number
    warnings: string[]
    unavailableDetectors: string[]
  }
}

export const detectPatterns: AnalystTool<PatternsInput, PatternsOutput> = {
  name: 'detectPatterns',
  description:
    'Use when asked about chart patterns — candlesticks (doji, engulfing...), chart formations (double top, cup-and-handle...), and their lifecycle/status. Returns detected patterns only, with confidence and direction.',
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
      limit: {
        type: 'number',
        description: 'Maximum patterns in the ranked list.',
        minimum: 1,
        maximum: 30,
      },
    },
    required: ['instrument'],
  },
  run(input, context): ToolResult<PatternsOutput> {
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
      return unavailableResult<PatternsOutput>(this.name, 'technical-engine', {
        now: context.now,
        warnings: patterns?.dataQuality.warnings ?? ['Pattern detection unavailable for this instrument.'],
      })
    }

    const limit = Math.min(30, Math.max(1, Math.round(input?.limit ?? 15)))

    const compact = (p: CompactPattern): CompactPattern => p

    const payload: PatternsOutput = {
      instrument: instrument.id,
      timeframe: timeframe.technical,
      barCount: patterns.barCount,
      hasOHLC: patterns.hasOHLC,
      hasVolume: patterns.hasVolume,
      summary: {
        total: patterns.summary.total,
        directionalBias: patterns.summary.directionalBias,
        byFamily: patterns.summary.byFamily as Record<string, { count: number; bullish: number; bearish: number; neutral: number }>,
        lifecycle: Object.fromEntries(Object.entries(patterns.summary.lifecycle)),
      },
      active: patterns.activePatterns.slice(0, limit).map((p) => compact({
        id: p.id,
        name: p.name,
        family: p.family,
        direction: p.direction,
        status: p.status,
        confidence: p.confidence,
        detectedAt: p.detectedAt,
      })),
      recent: patterns.recentPatterns.slice(0, limit).map((p) => compact({
        id: p.id,
        name: p.name,
        family: p.family,
        direction: p.direction,
        status: p.status,
        confidence: p.confidence,
        detectedAt: p.detectedAt,
      })),
      ranked: patterns.all.slice(0, limit).map((p) => compact({
        id: p.id,
        name: p.name,
        family: p.family,
        direction: p.direction,
        status: p.status,
        confidence: p.confidence,
        detectedAt: p.detectedAt,
      })),
      dataQuality: {
        candleCount: patterns.dataQuality.candleCount,
        warnings: patterns.dataQuality.warnings,
        unavailableDetectors: patterns.dataQuality.unavailableDetectors,
      },
    }

    return successResult(this.name, 'technical-engine', payload, {
      available: true,
      now: context.now,
      warnings: patterns.dataQuality.warnings,
    })
  },
}