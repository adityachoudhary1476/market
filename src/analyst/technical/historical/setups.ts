// ---------------------------------------------------------------------------
// Phase 2D — setup extraction
//
// A HistoricalSetup is ONE confirmed event at ONE timestamp. Setups are
// extracted from a technical context that was built from the prefix ending at
// that timestamp — nothing from the future is ever visible to this module.
// ---------------------------------------------------------------------------

import type { StructuredTechnicalContext } from '../types'
import type { HistoricalSetup } from './types'
import { regimeFromContext } from './regimes'

let counter = 0
function sid(): string {
  counter += 1
  return `hist-setup-${counter}`
}
export function resetSetupIdCounter() {
  counter = 0
}

function momentumSignature(technical: StructuredTechnicalContext): string | undefined {
  const rsi = technical.indicators.rsi.value
  if (rsi == null) return undefined
  if (rsi >= 70) return 'overbought'
  if (rsi >= 55) return 'bullish'
  if (rsi <= 30) return 'oversold'
  if (rsi <= 45) return 'bearish'
  return 'neutral'
}

function volumeBucketOf(technical: StructuredTechnicalContext): string | undefined {
  const rv = technical.volume.relativeVolume
  if (rv == null || !technical.volume.available) return undefined
  if (rv >= 1.3) return 'high'
  if (rv <= 0.7) return 'low'
  return 'normal'
}

/**
 * Extract setups from a context: every active (confirmed/mature) pattern is a
 * candidate setup. Forming patterns are excluded — they are not confirmed
 * events. Returns an empty array when nothing is confirmed at this bar.
 */
export function extractSetups(
  technical: StructuredTechnicalContext,
  barIndex: number,
  instrument: string,
  timeframe: string,
): HistoricalSetup[] {
  // Only CONFIRMED events are setups. Forming patterns are hypotheses, not
  // confirmed events; failed/complete/invalidated are historical artefacts.
  const active = (technical.patterns?.activePatterns ?? []).filter(
    (p) => p.status === 'confirmed' || p.status === 'mature',
  )
  const setups: HistoricalSetup[] = []
  const regime = regimeFromContext(technical)

  for (const p of active) {
    const t = p.detectedAt
    setups.push({
      id: sid(),
      timestamp: t,
      barIndex,
      instrument,
      timeframe,
      direction: p.direction,
      pattern: {
        family: p.family,
        type: p.family,
        name: p.name,
        status: p.status,
        confidence: p.confidence,
        invalidationLevel: p.invalidationLevel,
        targetLevel: p.targetLevel,
      },
      confluence: technical.confluence
        ? { bias: technical.confluence.bias, quality: technical.confluence.score.quality }
        : null,
      evidenceSignature: {
        trend: technical.trend.overall.direction,
        momentum: momentumSignature(technical),
        structure: technical.structure.state,
        volume: volumeBucketOf(technical),
        volatility: technical.volatility.state,
      },
      regime,
      metadata: {
        patternConfidence: p.confidence,
        patternStrength: p.strength,
        confluenceBalance: technical.confluence?.score.balance ?? null,
        breakout: p.metadata?.breakoutStatus ?? undefined,
        volumeConfirmed: p.metadata?.volumeConfirmed ?? undefined,
        retestHeld: p.metadata?.retestHeld ?? undefined,
        failureDistance: p.metadata?.failureDistance ?? undefined,
      },
    })
  }

  return setups
}