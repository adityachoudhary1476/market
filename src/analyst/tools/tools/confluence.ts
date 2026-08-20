// ---------------------------------------------------------------------------
// Phase 2E — getConfluence
//
// The Phase 2C confluence model for one instrument: overall bias, the fully
// decomposable score, evidence groups, conflicts and the structured thesis.
// A scorecard — never a recommendation.
// ---------------------------------------------------------------------------

import type { AnalystTool, ToolResult } from '../types'
import { successResult, unavailableResult } from '../results'
import { requireTimeframe, requireInstrument } from '../validation'
import { ToolError } from '../errors'
import { errorResult } from '../results'

export interface ConfluenceInput {
  instrument: string
  /** 'intraday' | 'daily' | 'weekly', or an app timeframe. Default 'daily'. */
  timeframe?: string
  /** Include the evidence item list (default true). */
  includeEvidence?: boolean
  /** Include the structured thesis (default true). */
  includeThesis?: boolean
}

export interface ConfluenceOutput {
  instrument: string
  timeframe: string
  bias: string
  score: {
    bullish: number
    bearish: number
    balance: number
    confidence: number
    quality: string
    contribution: { group: string; net: number }[]
  }
  groups: {
    group: string
    count: number
    bullish: number
    bearish: number
    neutral: number
    net: number
  }[]
  conflicts: {
    id: string
    severity: string
    type: string
    description: string
  }[]
  timeframeConfluence: {
    primary: { timeframe: string; available: boolean; balance: number | null; confidence: number | null; bias: string | null }
    alignment: string
    netAgreement: number
  } | null
  thesis: {
    summary: string
    bias: string
    conditions: { description: string; metric: string; value: number | string | boolean; operator: string }[]
    invalidationConditions: { description: string; metric: string; value: number | string | boolean; operator: string }[]
    keyLevels: { type: string; low: number; high: number; distancePercent: number | null; strength: number; touches: number }[]
  } | null
  evidence: {
    id: string
    source: string
    group: string
    name: string
    direction: string
    strength: number
    confidence: number
    weight: number
    freshness: number
    timestamp: string | null
  }[]
  method: {
    version: string
    evidenceCount: number
    groupsUsed: number
  }
}

export const getConfluence: AnalystTool<ConfluenceInput, ConfluenceOutput> = {
  name: 'getConfluence',
  description:
    'Use when asked how technical evidence stacks up overall — bias, score, which evidence groups agree or conflict, and the structured thesis with its key levels and invalidation conditions.',
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
      includeEvidence: {
        type: 'boolean',
        description: 'Include the evidence item list. Default true.',
      },
      includeThesis: {
        type: 'boolean',
        description: 'Include the structured thesis. Default true.',
      },
    },
    required: ['instrument'],
  },
  run(input, context): ToolResult<ConfluenceOutput> {
    let instrument: ReturnType<typeof requireInstrument>
    let timeframe: ReturnType<typeof requireTimeframe>
    try {
      instrument = requireInstrument(input?.instrument)
      timeframe = requireTimeframe(input?.timeframe ?? 'daily')
    } catch (thrown) {
      const err = thrown instanceof ToolError ? thrown : ToolError.internal('Validation failed unexpectedly')
      return errorResult(this.name, 'confluence-engine', err, { now: context.now })
    }

    const technical = context.data.technical(instrument.id, timeframe.technical)
    const confluence = technical.confluence

    if (!confluence || !confluence.available) {
      return unavailableResult<ConfluenceOutput>(this.name, 'confluence-engine', {
        now: context.now,
        warnings: confluence?.dataQuality.warnings ?? ['Confluence model unavailable for this instrument.'],
      })
    }

    const includeEvidence = input?.includeEvidence !== false
    const includeThesis = input?.includeThesis !== false

    const payload: ConfluenceOutput = {
      instrument: instrument.id,
      timeframe: timeframe.technical,
      bias: confluence.bias,
      score: {
        bullish: confluence.score.bullish,
        bearish: confluence.score.bearish,
        balance: confluence.score.balance,
        confidence: confluence.score.confidence,
        quality: confluence.score.quality,
        contribution: confluence.score.contribution.map((c) => ({ group: c.group, net: c.net })),
      },
      groups: confluence.groups.map((g) => ({
        group: g.group,
        count: g.count,
        bullish: g.bullish,
        bearish: g.bearish,
        neutral: g.neutral,
        net: g.net,
      })),
      conflicts: confluence.conflicts.map((c) => ({
        id: c.id,
        severity: c.severity,
        type: c.type,
        description: c.description,
      })),
      timeframeConfluence: confluence.timeframeConfluence
        ? {
            primary: confluence.timeframeConfluence.primary
              ? {
                  timeframe: confluence.timeframeConfluence.primary.timeframe,
                  available: confluence.timeframeConfluence.primary.available,
                  balance: confluence.timeframeConfluence.primary.balance,
                  confidence: confluence.timeframeConfluence.primary.confidence,
                  bias: confluence.timeframeConfluence.primary.bias,
                }
              : { timeframe: '', available: false, balance: null, confidence: null, bias: null },
            alignment: confluence.timeframeConfluence.alignment,
            netAgreement: confluence.timeframeConfluence.netAgreement,
          }
        : null,
      thesis: includeThesis && confluence.thesis
        ? {
            summary: confluence.thesis.summary,
            bias: confluence.thesis.bias,
            conditions: confluence.thesis.conditions.map((c) => ({
              description: c.description,
              metric: c.metric,
              value: c.value,
              operator: c.operator,
            })),
            invalidationConditions: confluence.thesis.invalidationConditions.map((c) => ({
              description: c.description,
              metric: c.metric,
              value: c.value,
              operator: c.operator,
            })),
            keyLevels: confluence.thesis.keyLevels.map((k) => ({
              type: k.type,
              low: k.low,
              high: k.high,
              distancePercent: k.distancePercent,
              strength: k.strength,
              touches: k.touches,
            })),
          }
        : null,
      evidence: includeEvidence
        ? confluence.evidence.map((e) => ({
            id: e.id,
            source: e.source,
            group: e.group,
            name: e.name,
            direction: e.direction,
            strength: e.strength,
            confidence: e.confidence,
            weight: e.weight,
            freshness: e.freshness,
            timestamp: e.timestamp,
          }))
        : [],
      method: {
        version: confluence.method.version,
        evidenceCount: confluence.method.evidenceCount,
        groupsUsed: confluence.method.groupsUsed,
      },
    }

    return successResult(this.name, 'confluence-engine', payload, {
      available: true,
      now: context.now,
      warnings: confluence.dataQuality.warnings,
    })
  },
}