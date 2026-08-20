// ---------------------------------------------------------------------------
// Phase 2E — Tool Layer: input validation & instrument/timeframe resolution
//
// Tools receive untyped JSON input (possibly from an LLM). Everything entering
// an engine is validated here first, so invalid input produces a typed
// INVALID_INPUT result instead of a crash or a fabricated fallback.
// ---------------------------------------------------------------------------

import type { Timeframe } from '../../types'
import { TERMINAL_INDICES } from '../../data/marketSeries'
import { terminalStocks } from '../../data/mockTerminalStocks'
import { terminalIndices } from '../../data/mockTerminalIndices'
import type { TimeframeLabel } from '../technical'
import { ToolError } from './errors'

export const APP_TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', '1Y', '5Y']
export const TECHNICAL_TIMEFRAMES: TimeframeLabel[] = ['intraday', 'daily', 'weekly']

/** Technical-engine timeframe → the app timeframe the demo series provides. */
export const TECHNICAL_TO_APP: Record<TimeframeLabel, Timeframe> = {
  intraday: '1D',
  daily: '3M',
  weekly: '1Y',
}

/** App timeframe → technical-engine timeframe (mirrors the Phase 2D provider). */
export const APP_TO_TECHNICAL: Record<Timeframe, TimeframeLabel> = {
  '1D': 'intraday',
  '1W': 'daily',
  '1M': 'daily',
  '3M': 'daily',
  '1Y': 'weekly',
  '5Y': 'weekly',
}

export interface NormalizedTimeframe {
  /** App chart timeframe used to fetch the series (e.g. '3M'). */
  app: Timeframe
  /** Technical-engine label (e.g. 'daily'). */
  technical: TimeframeLabel
}

/**
 * Accepts either an app timeframe ('1D', '3M'...) or a technical label
 * ('intraday', 'daily', 'weekly') and returns both representations, so tool
 * inputs are forgiving without being ambiguous.
 */
export function normalizeTimeframe(tf: unknown): NormalizedTimeframe | null {
  if (typeof tf !== 'string') return null
  const key = tf.trim()
  if (key in APP_TO_TECHNICAL) return { app: key as Timeframe, technical: APP_TO_TECHNICAL[key as Timeframe] }
  if (key in TECHNICAL_TO_APP) return { app: TECHNICAL_TO_APP[key as TimeframeLabel], technical: key as TimeframeLabel }
  return null
}

export interface ResolvedInstrument {
  type: 'index' | 'stock'
  /** Canonical id/symbol, e.g. 'nifty-50' or 'RELIANCE'. */
  id: string
  displayName: string
}

/**
 * Resolves a user/LLM-provided instrument query against the deterministic
 * universe: the 4 terminal indices + the terminal stock quotes.
 * Matching is case-insensitive and accepts symbols as-is.
 */
export function resolveInstrument(query: unknown): ResolvedInstrument | null {
  if (typeof query !== 'string') return null
  const q = query.trim().toLowerCase()
  if (!q) return null

  const indexId = TERMINAL_INDICES.find((id) => id.toLowerCase() === q)
  if (indexId) {
    const index = terminalIndices.find((i) => i.id === indexId)
    return { type: 'index', id: indexId, displayName: index?.name ?? indexId }
  }

  const stock = terminalStocks.find((s) => s.symbol.toLowerCase() === q)
  if (stock) return { type: 'stock', id: stock.symbol, displayName: stock.name }
  return null
}

/** Whether the query matches anything in the deterministic universe. */
export function isKnownInstrument(query: unknown): boolean {
  return resolveInstrument(query) !== null
}

// --- Primitive input checks (throw ToolError.invalidInput) -----------------

export function requireString(input: unknown, name: string): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw ToolError.invalidInput(`'${name}' must be a non-empty string.`)
  }
  return input.trim()
}

export function optionalString(input: unknown, name: string): string | undefined {
  if (input === undefined || input === null || input === '') return undefined
  if (typeof input !== 'string') {
    throw ToolError.invalidInput(`'${name}' must be a string when provided.`)
  }
  return input.trim()
}

export function requireNumber(input: unknown, name: string): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    throw ToolError.invalidInput(`'${name}' must be a finite number.`)
  }
  return input
}

export function optionalNumber(input: unknown, name: string): number | undefined {
  if (input === undefined || input === null) return undefined
  return requireNumber(input, name)
}

export function requireBoolean(input: unknown, name: string): boolean {
  if (typeof input !== 'boolean') {
    throw ToolError.invalidInput(`'${name}' must be a boolean.`)
  }
  return input
}

export function optionalBoolean(input: unknown, name: string): boolean | undefined {
  if (input === undefined || input === null) return undefined
  return requireBoolean(input, name)
}

export function clampInteger(input: unknown, name: string, min: number, max: number, fallback: number): number {
  const n = optionalNumber(input, name) ?? fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Require a normalized timeframe or throw an UNSUPPORTED_TIMEFRAME error. */
export function requireTimeframe(input: unknown): NormalizedTimeframe {
  const normalized = normalizeTimeframe(input)
  if (!normalized) {
    throw ToolError.unsupportedTimeframe(typeof input === 'string' ? input : String(input))
  }
  return normalized
}

/** Require a resolvable instrument or throw an UNSUPPORTED_INSTRUMENT error. */
export function requireInstrument(input: unknown): ResolvedInstrument {
  const resolved = resolveInstrument(input)
  if (!resolved) {
    throw ToolError.unsupportedInstrument(typeof input === 'string' ? input : String(input))
  }
  return resolved
}