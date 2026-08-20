// ---------------------------------------------------------------------------
// Phase 2E — getMacroContext
//
// Macro indicator levels for context when answering questions about rates,
// inflation or the broader backdrop. Deterministic demo values — tools label
// the source, they never present it as exchange fact.
// ---------------------------------------------------------------------------

import { terminalMacro } from '../../../data/mockMacro'
import type { MacroIndicator } from '../../../types'
import type { AnalystTool, ToolResult } from '../types'
import { successResult } from '../results'

export interface MacroContextInput {
  /** Optional: only return the indicator with this id, e.g. 'repo'. */
  indicatorId?: string
}

export interface MacroContextOutput {
  macro: MacroIndicator[]
}

export const getMacroContext: AnalystTool<MacroContextInput, MacroContextOutput> = {
  name: 'getMacroContext',
  description:
    'Use when the question involves macro conditions — interest rates, inflation, currency, commodity prices — to ground the answer in the current backdrop.',
  inputSchema: {
    type: 'object',
    properties: {
      indicatorId: {
        type: 'string',
        description: 'Optional: a single macro indicator id, e.g. "repo".',
      },
    },
    required: [],
  },
  run(input, context): ToolResult<MacroContextOutput> {
    const indicatorId = typeof input?.indicatorId === 'string' ? input.indicatorId.trim() : undefined
    const macro = indicatorId
      ? terminalMacro.filter((m) => m.id === indicatorId || m.label.toLowerCase() === indicatorId.toLowerCase())
      : terminalMacro

    const warnings = indicatorId && macro.length === 0 ? [`Macro indicator '${indicatorId}' not found.`] : []

    return successResult(this.name, 'market-data', { macro }, {
      available: true,
      now: context.now,
      warnings,
    })
  },
}