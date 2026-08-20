// ---------------------------------------------------------------------------
// Phase 2D — regime classification (price-derived proxy)
//
// The application's regime label set is reused verbatim (risk-on / risk-off /
// mixed / neutral). The application-level regime (breadth + global markets)
// exists only for "now", not historically, so the historical engine derives a
// per-setup regime from the instrument's own technical context with fully
// documented rules. This is a proxy, never the app-level classification.
// ---------------------------------------------------------------------------

import type { StructuredTechnicalContextLike } from '../confluence/types'
import type { RegimeLabel } from './types'

export interface RegimeRules {
  /** Overall trend direction bucket ('bullish' | 'bearish' | 'neutral' | other). */
  trend: string
  /** Market structure state ('bullish' | 'bearish' | 'range' | ...). */
  structure: string
  rsi: number | null
  volatilityState: string
}

export function regimeFromContext(technical: StructuredTechnicalContextLike | null | undefined): RegimeLabel {
  if (!technical) return 'neutral'
  const trend = technical.trend?.overall?.direction ?? 'insufficient-data'
  const structure = technical.structure?.state ?? 'insufficient-data'
  const rsi = technical.indicators?.rsi?.value ?? null
  const volatility = technical.volatility?.state ?? 'insufficient-data'

  const trendBullish = trend === 'bullish'
  const trendBearish = trend === 'bearish'
  const structureBullish = structure === 'bullish'
  const structureBearish = structure === 'bearish'
  const rsiBullish = rsi != null && rsi >= 55
  const rsiBearish = rsi != null && rsi <= 45
  const volHigh = volatility === 'high' || volatility === 'elevated'

  const bullishSignals = [trendBullish, structureBullish, rsiBullish].filter(Boolean).length
  const bearishSignals = [trendBearish, structureBearish, rsiBearish].filter(Boolean).length

  if (bullishSignals >= 2 && !volHigh && bearishSignals === 0) return 'risk-on'
  if (bearishSignals >= 2 && (volHigh || bullishSignals === 0)) return 'risk-off'
  if (bullishSignals >= 1 && bearishSignals >= 1) return 'mixed'
  if (trend === 'neutral' || trend === 'flat') return 'neutral'
  return 'neutral'
}

export function regimeFromRules(rules: RegimeRules): RegimeLabel {
  return regimeFromContext({
    available: true,
    instrument: '',
    timeframe: '',
    generatedAt: '',
    trend: { overall: { direction: rules.trend, strength: 50, evidence: [] } },
    structure: { state: rules.structure, higherHighs: 0, higherLows: 0, lowerHighs: 0, lowerLows: 0 },
    indicators: { rsi: { value: rules.rsi, zone: 'neutral' } },
    volatility: { state: rules.volatilityState, change: 'flat' },
  })
}