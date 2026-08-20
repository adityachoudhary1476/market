// ---------------------------------------------------------------------------
// Phase 2E — Tool Layer: core types
//
// TOOLS = EVIDENCE · LLM = REASONING · UI = PRESENTATION
//
// The tool layer is the deterministic, provider-independent contract between
// Finova's intelligence engines and a future LLM/agent (Phase 3A). It exposes
// the existing market-data, technical, pattern, confluence and historical
// engines through safe, machine-readable, JSON-serializable tools.
//
// Rules:
//   - No LLM, no agent loop, no recommendation labels.
//   - Tools never fabricate data — missing input yields null / available:false
//     with a warning, never an invented value.
//   - Framework-independent: no React, DOM, browser state or UI hooks.
// ---------------------------------------------------------------------------

import type { MarketIndex, Sector, MarketBreadth, StockQuote, MacroIndicator, GlobalMarket, IndexSeries, Timeframe } from '../../types'
import type { StructuredTechnicalContext, TimeframeLabel } from '../technical'
import type { HistoricalValidationContext } from '../technical/historical'

export type { TimeframeLabel }
export type { Timeframe }

// --- Errors ----------------------------------------------------------------

export type ToolErrorCode =
  | 'UNKNOWN_TOOL'
  | 'DUPLICATE_TOOL'
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_INSTRUMENT'
  | 'UNSUPPORTED_TIMEFRAME'
  | 'DATA_UNAVAILABLE'
  | 'CALCULATION_FAILED'
  | 'INTERNAL_ERROR'

/** Serialized form of a tool error — never a raw stack trace. */
export interface ToolError {
  code: ToolErrorCode
  message: string
  details?: Record<string, unknown>
}

// --- Results ---------------------------------------------------------------

/** Where a tool's evidence came from (provenance). */
export type ToolSource =
  | 'market-data'
  | 'technical-engine'
  | 'confluence-engine'
  | 'historical-validation'
  /** Phase 3C.1 — normalized, validated web search evidence. */
  | 'web-search'

export interface ToolMetadata {
  tool: string
  /** ISO timestamp the tool ran (from the execution context). */
  timestamp: string
  source: ToolSource
  /** True when the underlying data/engine could produce evidence. */
  available: boolean
  warnings: string[]
  /** Wall time of the execution (present on executed results). */
  durationMs?: number
}

export interface ToolResult<T = unknown> {
  ok: boolean
  data: T | null
  error: ToolError | null
  metadata: ToolMetadata
}

// --- Tool contract ---------------------------------------------------------

export interface ToolInputField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  /** Allowed values for string/enum inputs. */
  enum?: string[]
  minimum?: number
  maximum?: number
  default?: string | number | boolean
}

/** Plain, JSON-compatible input schema — directly convertible to LLM tool definitions. */
export interface ToolInputSchema {
  type: 'object'
  properties: Record<string, ToolInputField>
  required: string[]
}

export interface AnalystTool<Input = unknown, Output = unknown> {
  /** Stable machine name, e.g. "getTechnicalAnalysis". */
  name: string
  /** Written for a future LLM: WHEN to use the tool, not how it works. */
  description: string
  inputSchema: ToolInputSchema
  /** Synchronous, deterministic. Returns a structured result — never throws. */
  run(input: Input, context: ToolContext): ToolResult<Output>
}

/** Generic LLM-facing tool definition (provider-agnostic). */
export interface ToolDefinition {
  name: string
  description: string
  parameters: ToolInputSchema
}

// --- Execution context -----------------------------------------------------

/** Full set of current market data (deterministic demo datasets). */
export interface MarketDataset {
  indices: MarketIndex[]
  sectors: Sector[]
  breadth: MarketBreadth
  stocks: StockQuote[]
  macro: MacroIndicator[]
  global: GlobalMarket[]
}

/**
 * Lazy data accessors the tools consume. Defaults are wired to the real
 * modules by createDefaultToolContext(); tests inject deterministic sources.
 * All accessors are synchronous and deterministic.
 */
export interface ToolDataSources {
  market(): MarketDataset
  series(instrument: string, appTimeframe: Timeframe): IndexSeries
  technical(instrument: string, timeframe: TimeframeLabel): StructuredTechnicalContext
  historical(instrument: string, timeframe: TimeframeLabel): HistoricalValidationContext
}

/** Shared, framework-independent execution context passed to every tool. */
export interface ToolContext {
  /** Fixed wall-clock reference so tools are deterministic. */
  now: number
  data: ToolDataSources
}