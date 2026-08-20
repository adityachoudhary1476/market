// ---------------------------------------------------------------------------
// Phase 2D — walk-forward scanner
//
// NO-LOOKAHEAD METHODOLOGY:
//
//   for each eligible timestamp T:
//     prefix = candles[0..T]              ← ONLY data available at T
//     context = buildTechnicalContext(prefix)
//     setups = extractSetups(context, T)  ← only confirmed patterns visible at T
//     outcomes computed later from candles[T+1..]
//
// `buildTechnicalContext` recomputes indicators, swings, support/resistance,
// patterns and confluence from the prefix array alone — it holds no state
// across calls — so future candles can never leak into setup detection.
// Indicator results are deliberately NOT cached across prefixes: caching
// would risk look-ahead contamination. Correctness before speed (Phase 2D §43).
// ---------------------------------------------------------------------------

import type { Candle, StructuredTechnicalContext } from '../types'
import { buildTechnicalContext } from '../technicalContext'
import { extractSetups, resetSetupIdCounter } from './setups'
import type { HistoricalConfig } from './config'
import type { HistoricalSetup } from './types'

export interface ScannedBar {
  barIndex: number
  timestamp: number
  context: StructuredTechnicalContext
  setups: HistoricalSetup[]
}

export interface ScanResult {
  scans: ScannedBar[]
  setups: HistoricalSetup[]
  warnings: string[]
}

/**
 * Scan a candle series walk-forward. `timeframe` must be one of the supported
 * technical timeframes ('daily' | 'weekly' | 'intraday').
 */
export function scanHistory(
  instrument: string,
  candles: Candle[],
  timeframe: string,
  config: HistoricalConfig,
): ScanResult {
  resetSetupIdCounter()
  const warnings: string[] = []
  if (!config.supportedTechnicalTimeframes.includes(timeframe as never)) {
    return {
      scans: [],
      setups: [],
      warnings: [`Timeframe '${timeframe}' is not supported by the technical engine.`],
    }
  }

  if (candles.length < config.minimumHistoricalBars) {
    return {
      scans: [],
      setups: [],
      warnings: [`Insufficient historical coverage for reliable validation (${candles.length} bars < ${config.minimumHistoricalBars}).`],
    }
  }

  const lastScannable = candles.length - 1 - config.minimumForwardBars
  const scans: ScannedBar[] = []
  const setups: HistoricalSetup[] = []

  for (let T = config.minimumHistoricalBars - 1; T <= lastScannable; T++) {
    const prefix = candles.slice(0, T + 1)
    const context = buildTechnicalContext(instrument, prefix, { timeframe: timeframe as 'daily' | 'weekly' | 'intraday' })
    const found = extractSetups(context, T, instrument, timeframe)
    if (found.length > 0) {
      scans.push({ barIndex: T, timestamp: candles[T].timestamp, context, setups: found })
      setups.push(...found)
    }
  }

  if (setups.length === 0) {
    warnings.push('No confirmable setups were found in the available history.')
  }

  return { scans, setups, warnings }
}