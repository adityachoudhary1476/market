// ---------------------------------------------------------------------------
// Phase 2E — getHistoricalValidation
//
// Walk-forward, zero-lookahead validation of the current technical setup
// against the instrument's own history (Phase 2D). Outcomes are statistics,
// never predictions — and with a short demo feed the tool says so honestly.
// ---------------------------------------------------------------------------

import type { AnalystTool, ToolResult } from '../types'
import { successResult } from '../results'
import { requireTimeframe, requireInstrument } from '../validation'
import { ToolError } from '../errors'
import { errorResult } from '../results'

export interface HistoricalValidationInput {
  instrument: string
  /** 'intraday' | 'daily' | 'weekly', or an app timeframe. Default 'daily'. */
  timeframe?: string
}

export interface CompactOutcome {
  setupDescription: string
  pattern: { family: string; name: string; type: string; direction: string } | null
  sampleSize: number
  quality: string
  outcomes: Record<string, {
    count: number
    winRatePct: number | null
    avgReturnPct: number | null
    avgMfePct: number | null
    avgMaePct: number | null
  }>
  warnings: string[]
}

export interface HistoricalValidationOutput {
  instrument: string
  timeframe: string
  available: boolean
  reason?: string
  currentSetup: {
    setupId: string
    similarHistoricalEvents: number
    matchesConsidered: number
    matchesAccepted: number
    similarityThreshold: number
  } | null
  results: CompactOutcome[]
  dataQuality: {
    barsAvailable: number
    capabilities: { hasHighLow: boolean; hasVolume: boolean }
    source: string
    warnings: string[]
  }
  methodology: {
    version: string
    similarityThreshold: number
    horizons: number[]
    minimumSampleSize: number
  }
}

export const getHistoricalValidation: AnalystTool<HistoricalValidationInput, HistoricalValidationOutput> = {
  name: 'getHistoricalValidation',
  description:
    'Use when asked how a technical setup has historically played out on this instrument — win rates and average outcomes from a walk-forward engine with zero lookahead. Returns statistics with sample sizes, never predictions.',
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
  run(input, context): ToolResult<HistoricalValidationOutput> {
    let instrument: ReturnType<typeof requireInstrument>
    let timeframe: ReturnType<typeof requireTimeframe>
    try {
      instrument = requireInstrument(input?.instrument)
      timeframe = requireTimeframe(input?.timeframe ?? 'daily')
    } catch (thrown) {
      const err = thrown instanceof ToolError ? thrown : ToolError.internal('Validation failed unexpectedly')
      return errorResult(this.name, 'historical-validation', err, { now: context.now })
    }

    const ctx = context.data.historical(instrument.id, timeframe.technical)

    if (!ctx.available) {
      return successResult(this.name, 'historical-validation', {
        instrument: instrument.id,
        timeframe: timeframe.app,
        available: false,
        reason: ctx.reason,
        currentSetup: null,
        results: [],
        dataQuality: {
          barsAvailable: ctx.dataQuality.barsAvailable,
          capabilities: ctx.dataQuality.capabilities,
          source: ctx.dataQuality.source,
          warnings: ctx.dataQuality.warnings,
        },
        methodology: {
          version: ctx.methodology.version,
          similarityThreshold: ctx.methodology.similarityThreshold,
          horizons: ctx.methodology.horizons,
          minimumSampleSize: ctx.methodology.minimumSampleSize,
        },
      }, {
        available: false,
        now: context.now,
        warnings: ctx.dataQuality.warnings,
      })
    }

    const results: CompactOutcome[] = ctx.results.map((r) => ({
      setupDescription: r.setupDescription,
      pattern: r.pattern
        ? { family: r.pattern.family, name: r.pattern.name, type: r.pattern.type, direction: r.pattern.direction }
        : null,
      sampleSize: r.sampleSize,
      quality: r.quality,
      outcomes: Object.fromEntries(
        Object.entries(r.outcomes).map(([horizon, stats]) => [
          horizon,
          {
            count: stats.count,
            winRatePct: stats.favorableRate ?? stats.positiveRate ?? null,
            avgReturnPct: stats.meanReturn ?? null,
            avgMfePct: stats.mfe?.mean ?? null,
            avgMaePct: stats.mae?.mean ?? null,
          },
        ]),
      ),
      warnings: r.warnings,
    }))

    const payload: HistoricalValidationOutput = {
      instrument: instrument.id,
      timeframe: timeframe.app,
      available: true,
      currentSetup: ctx.currentSetup
        ? {
            setupId: ctx.currentSetup.setupId,
            similarHistoricalEvents: ctx.currentSetup.similarHistoricalEvents,
            matchesConsidered: ctx.currentSetup.matchesConsidered,
            matchesAccepted: ctx.currentSetup.matchesAccepted,
            similarityThreshold: ctx.currentSetup.similarityThreshold,
          }
        : null,
      results,
      dataQuality: {
        barsAvailable: ctx.dataQuality.barsAvailable,
        capabilities: ctx.dataQuality.capabilities,
        source: ctx.dataQuality.source,
        warnings: ctx.dataQuality.warnings,
      },
      methodology: {
        version: ctx.methodology.version,
        similarityThreshold: ctx.methodology.similarityThreshold,
        horizons: ctx.methodology.horizons,
        minimumSampleSize: ctx.methodology.minimumSampleSize,
      },
    }

    return successResult(this.name, 'historical-validation', payload, {
      available: true,
      now: context.now,
      warnings: ctx.dataQuality.warnings,
    })
  },
}