// ---------------------------------------------------------------------------
// Phase 2E — Tool Layer: result builders
//
// Small helpers that construct ToolResult objects consistently so every tool
// reports the same metadata shape (provenance, availability, warnings).
// ---------------------------------------------------------------------------

import type { ToolError, ToolMetadata, ToolResult, ToolSource, ToolDataMode } from './types'
import { ToolError as ToolErrorClass } from './errors'

export interface ResultOptions {
  available?: boolean
  warnings?: string[]
  /** Override the metadata timestamp (defaults to the context `now`). */
  now?: number
  dataMode?: ToolDataMode
}

export function resultMetadata(
  tool: string,
  source: ToolSource,
  options: ResultOptions = {},
): ToolMetadata {
  return {
    tool,
    timestamp: new Date(options.now ?? Date.now()).toISOString(),
    source,
    dataMode: options.dataMode ?? (source === 'web-search' ? 'live' : 'synthetic-demo'),
    available: options.available ?? false,
    warnings: options.warnings ?? [],
  }
}

export function successResult<T>(
  tool: string,
  source: ToolSource,
  data: T,
  options: ResultOptions = {},
): ToolResult<T> {
  return {
    ok: true,
    data,
    error: null,
    metadata: resultMetadata(tool, source, options),
  }
}

export function errorResult<T = null>(
  tool: string,
  source: ToolSource,
  error: ToolError,
  options: ResultOptions = {},
): ToolResult<T> {
  return {
    ok: false,
    data: null,
    error: error instanceof ToolErrorClass ? error.toJSON() : error,
    metadata: resultMetadata(tool, source, options),
  }
}

/** Convert an unexpected thrown value into a serialized INTERNAL_ERROR result. */
export function internalErrorResult(
  tool: string,
  source: ToolSource,
  thrown: unknown,
  options: ResultOptions = {},
): ToolResult<null> {
  const message = thrown instanceof Error ? thrown.message : 'Unexpected internal error'
  return errorResult(tool, source, ToolErrorClass.internal(message), { ...options, available: false })
}

/**
 * A well-formed "ok but no evidence" result: the engine is fine, the data is
 * simply not there. `data` is null and `available` is false — consumers must
 * treat null data + available:false as "no answer", never as a value.
 */
export function unavailableResult<T = null>(
  tool: string,
  source: ToolSource,
  options: ResultOptions = {},
): ToolResult<T> {
  return {
    ok: true,
    data: null as T,
    error: null,
    metadata: resultMetadata(tool, source, { ...options, available: false }),
  }
}