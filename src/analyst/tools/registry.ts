// ---------------------------------------------------------------------------
// Phase 2E — Tool Layer: registry
//
// The registry owns the tool universe. `execute()` is the single entry point:
// it validates the name, runs the tool, catches unexpected throws and always
// returns a well-formed ToolResult — never throws.
// ---------------------------------------------------------------------------

import type { AnalystTool, ToolContext, ToolDefinition, ToolResult } from './types'
import { ToolError } from './errors'
import { errorResult, internalErrorResult } from './results'
import { getMarketSnapshot } from './tools/marketSnapshot'
import { getMarketBreadth } from './tools/breadth'
import { analyzeSectors } from './tools/sectors'
import { getMarketMovers } from './tools/movers'
import { getMacroContext } from './tools/macro'
import { getTechnicalAnalysis } from './tools/technicalAnalysis'
import { detectPatterns } from './tools/patterns'
import { detectDivergences } from './tools/divergences'
import { detectBreakouts } from './tools/breakouts'
import { getConfluence } from './tools/confluence'
import { getHistoricalValidation } from './tools/historical'
import { compareInstruments } from './tools/comparison'
import { searchWeb } from './tools/searchWeb'
import { searchNews } from './tools/searchNews'

export class AnalystToolRegistry {
  private readonly tools = new Map<string, AnalystTool>()

  register(tool: AnalystTool): void {
    if (this.tools.has(tool.name)) {
      throw ToolError.duplicateTool(tool.name)
    }
    this.tools.set(tool.name, tool)
  }

  get(name: string): AnalystTool | undefined {
    return this.tools.get(name)
  }

  list(): AnalystTool[] {
    return [...this.tools.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  /** LLM-facing, provider-agnostic tool definitions (OpenAI-style). */
  definitions(): ToolDefinition[] {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    }))
  }

  execute<Input = unknown>(name: string, input: Input, context: ToolContext): ToolResult {
    const tool = this.tools.get(name)
    if (!tool) {
      return errorResult('unknown', 'market-data', ToolError.unknownTool(name), {
        available: false,
        now: context.now,
      })
    }

    const started = Date.now()
    try {
      const result = tool.run(input, context)
      if (result.metadata.durationMs === undefined) {
        result.metadata.durationMs = Date.now() - started
        result.metadata.timestamp = new Date(context.now).toISOString()
      }
      return result
    } catch (thrown) {
      return internalErrorResult(name, 'market-data', thrown, {
        available: false,
        now: context.now,
      })
    }
  }
}

/**
 * The default Phase 2E tool universe (extended in Phase 3C.1 with searchWeb).
 * Deterministic, framework-independent, ready for LLM consumption (Phase 3A) —
 * no UI, no prose, no recommendations. searchWeb is offered to the model only
 * when the agent session has a search transport (the orchestrator decides).
 */
export function createDefaultAnalystToolRegistry(): AnalystToolRegistry {
  const registry = new AnalystToolRegistry()
  const tools: AnalystTool[] = [
    getMarketSnapshot,
    getTechnicalAnalysis,
    detectPatterns,
    detectDivergences,
    detectBreakouts,
    getConfluence,
    getHistoricalValidation,
    getMarketBreadth,
    analyzeSectors,
    getMarketMovers,
    compareInstruments,
    getMacroContext,
    searchWeb,
    searchNews,
  ]
  for (const tool of tools) registry.register(tool)
  return registry
}