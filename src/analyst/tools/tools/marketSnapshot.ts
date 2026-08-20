// ---------------------------------------------------------------------------
// Phase 2E — getMarketSnapshot
//
// Compact, normalized picture of the whole market in one call: regime,
// indices, breadth, sectors, movers, macro and global markets. The same data
// the in-app analyst uses, replayed deterministically with the context clock.
// ---------------------------------------------------------------------------

import { buildMarketSnapshotData } from '../../buildContext'
import type { AnalystTool, ToolResult } from '../types'
import { successResult } from '../results'

export interface MarketSnapshotInput {
  /** Optional: include the full sector list instead of the top movers. */
  includeSectors?: boolean
}

export const getMarketSnapshot: AnalystTool<MarketSnapshotInput, object> = {
  name: 'getMarketSnapshot',
  description:
    'Use when you need a current one-shot overview of the whole market: regime, index levels, breadth, top sector movers, gainers/losers, macro and global markets. Prefer this over many individual quote calls.',
  inputSchema: {
    type: 'object',
    properties: {
      includeSectors: {
        type: 'boolean',
        description: 'Include the complete sector list in the response.',
      },
    },
    required: [],
  },
  run(input, context): ToolResult<object> {
    const includeSectors = input?.includeSectors === true
    const snapshot = buildMarketSnapshotData()

    const payload: object = {
      regime: snapshot.regime,
      generatedAt: new Date(context.now).toISOString(),
      indices: snapshot.indices,
      breadth: snapshot.breadth,
      sectors: includeSectors ? snapshot.sectors : snapshot.sectors.slice(0, 3),
      gainers: snapshot.gainers,
      losers: snapshot.losers,
      active: snapshot.active,
      macro: snapshot.macro,
      global: snapshot.global,
    }

    return successResult(this.name, 'market-data', payload, {
      available: true,
      now: context.now,
    })
  },
}