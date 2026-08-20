// ---------------------------------------------------------------------------
// Phase 2E — Tool Layer: typed errors
//
// Errors are serializable and never expose raw stack traces. Tools return
// ToolResult objects; unexpected exceptions are caught by the registry and
// converted to INTERNAL_ERROR results. Throwing inside a tool's run() should
// be reserved for programmer errors — normal data/validation problems are
// reported as typed ToolError results instead.
// ---------------------------------------------------------------------------

import type { ToolError as ToolErrorShape, ToolErrorCode } from './types'

export class ToolError extends Error {
  readonly code: ToolErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: ToolErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ToolError'
    this.code = code
    this.details = details
  }

  /** Plain serializable shape stored in a ToolResult — no stack trace. */
  toJSON(): ToolErrorShape {
    const out: ToolErrorShape = { code: this.code, message: this.message }
    if (this.details) out.details = this.details
    return out
  }

  static unknownTool(name: string): ToolError {
    return new ToolError('UNKNOWN_TOOL', `Unknown tool '${name}'. Call list() to see available tools.`, { name })
  }

  static duplicateTool(name: string): ToolError {
    return new ToolError('DUPLICATE_TOOL', `A tool named '${name}' is already registered.`, { name })
  }

  static invalidInput(message: string, details?: Record<string, unknown>): ToolError {
    return new ToolError('INVALID_INPUT', message, details)
  }

  static unsupportedInstrument(query: string): ToolError {
    return new ToolError('UNSUPPORTED_INSTRUMENT', `Instrument '${query}' is not in the supported universe.`, { query })
  }

  static unsupportedTimeframe(tf: string): ToolError {
    return new ToolError(
      'UNSUPPORTED_TIMEFRAME',
      `Timeframe '${tf}' is not supported. Use one of: intraday, daily, weekly, 1D, 1W, 1M, 3M, 1Y, 5Y.`,
      { timeframe: tf },
    )
  }

  static dataUnavailable(message: string, details?: Record<string, unknown>): ToolError {
    return new ToolError('DATA_UNAVAILABLE', message, details)
  }

  static calculationFailed(message: string, details?: Record<string, unknown>): ToolError {
    return new ToolError('CALCULATION_FAILED', message, details)
  }

  static internal(message: string, details?: Record<string, unknown>): ToolError {
    return new ToolError('INTERNAL_ERROR', message, details)
  }
}