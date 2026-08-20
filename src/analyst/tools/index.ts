// ---------------------------------------------------------------------------
// Phase 2E — Tool Layer (public entry)
//
// TOOLS = EVIDENCE · LLM = REASONING · UI = PRESENTATION
//
// The deterministic, provider-independent tool layer. Exposes Finova's
// engines (market-data, technical, patterns, confluence, historical) as
// machine-readable, JSON-serializable tools with honest availability.
// ---------------------------------------------------------------------------

export type {
  AnalystTool,
  ToolContext,
  ToolDataSources,
  MarketDataset,
  ToolResult,
  ToolMetadata,
  ToolError,
  ToolErrorCode,
  ToolInputSchema,
  ToolInputField,
  ToolDefinition,
  ToolSource,
} from './types'
export type { NormalizedTimeframe, ResolvedInstrument } from './validation'
export { ToolError as ToolErrorClass } from './errors'
export {
  successResult,
  errorResult,
  internalErrorResult,
  resultMetadata,
} from './results'
export {
  APP_TIMEFRAMES,
  TECHNICAL_TIMEFRAMES,
  APP_TO_TECHNICAL,
  TECHNICAL_TO_APP,
  normalizeTimeframe,
  resolveInstrument,
  isKnownInstrument,
} from './validation'
export { createDefaultToolContext } from './context'
export { AnalystToolRegistry, createDefaultAnalystToolRegistry } from './registry'
export { createSearchWebTool, searchWeb, type SearchWebInput, type SearchWebToolOutput, type SearchWebToolOptions } from './tools/searchWeb'
export * from './tools'