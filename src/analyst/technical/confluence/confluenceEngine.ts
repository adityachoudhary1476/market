// ---------------------------------------------------------------------------
// Phase 2C — confluence engine
//
// buildConfluenceContext(technical) → TechnicalConfluenceContext
//
// Pipeline: normalize → saturate → score → conflict → align timeframes →
// thesis. Deterministic end to end; every number traces back to weights.ts.
// ---------------------------------------------------------------------------

import type {
  ConfluenceOptions,
  EvidenceGroupSummary,
  StructuredTechnicalContextLike,
  TechnicalConfluenceContext,
  TimeframeView,
} from './types'
import { normalizeEvidence, resetEvidenceIdCounter } from './evidence'
import { biasFromBalance, groupSummaries, scoreFromGroups } from './scoring'
import { conflictImpact, detectConflicts, resetConflictIdCounter } from './conflicts'
import { buildTimeframeConfluence } from './timeframe'
import { buildThesis } from './thesis'
import { BIAS_THRESHOLD, ENGINE_VERSION, weightTableSummary } from './weights'

export interface BuildConfluenceInput extends ConfluenceOptions {
  technical: StructuredTechnicalContextLike
}

/**
 * Combine all available technical evidence into a single deterministic
 * confluence model. Pure function of `technical` plus optional context
 * (regime label, multi-timeframe contexts, historical validation hook).
 */
export function buildConfluenceContext(input: BuildConfluenceInput): TechnicalConfluenceContext {
  resetEvidenceIdCounter()
  resetConflictIdCounter()
  const technical = input.technical
  const now = Date.now()
  const adjustedFor: string[] = []

  const { items, warnings, adjustedFor: adjFromEvidence } = normalizeEvidence(technical, now)
  adjustedFor.push(...adjFromEvidence)

  // Optional regime evidence (application-provided label, never guessed here).
  if (input.regime) {
    const isRiskOn = input.regime === 'risk-on' || input.regime === 'risk-off'
    if (isRiskOn) {
      const bull = input.regime === 'risk-on'
      const w = 6 * 0.8 // regime weight × fixed reliability
      items.push({
        id: 'regime',
        source: 'regime',
        group: 'regime',
        name: `Regime ${input.regime}`,
        direction: bull ? 'bullish' : 'bearish',
        strength: 50,
        confidence: 80,
        freshness: 100,
        weight: Number(w.toFixed(2)),
        timestamp: null,
        evidence: [`Application-layer regime classification: ${input.regime}`],
      })
      adjustedFor.push(`regime '${input.regime}' included (application-provided)`)
    } else {
      adjustedFor.push(`regime '${input.regime}' is neutral — no directional adjustment`)
    }
  }

  // Optional historical validation: only used when provided; never fabricated.
  if (input.historicalValidation) {
    const h = input.historicalValidation
    const reliability = Math.max(0, Math.min(100, h.confidence)) / 100
    const bullWeight = 10 * reliability * (h.bullish / 100)
    const bearWeight = 10 * reliability * (h.bearish / 100)
    const direction: 'bullish' | 'bearish' | 'neutral' =
      h.bullish > h.bearish + 10 ? 'bullish' : h.bearish > h.bullish + 10 ? 'bearish' : 'neutral'
    items.push({
      id: 'historical',
      source: 'historical',
      group: 'historical',
      name: 'Historical validation',
      direction,
      strength: Math.max(h.bullish, h.bearish),
      confidence: h.confidence,
      freshness: 100,
      weight: Number((direction === 'bullish' ? bullWeight : direction === 'bearish' ? bearWeight : 0).toFixed(2)),
      timestamp: null,
      evidence: [`${h.note}`, `bullish ${h.bullish} / bearish ${h.bearish} (confidence ${h.confidence})`],
    })
    adjustedFor.push('historical validation included (provided by caller)')
  }

  const groups: EvidenceGroupSummary[] = groupSummaries(items)
  const score = scoreFromGroups(groups, items)

  // Timeframe alignment (optional) — before conflicts so timeframe clashes
  // are reported as conflicts.
  let timeframeViews: TimeframeView[] | undefined
  let timeframeConfluence = null
  if (input.multiTimeframe) {
    const labels = Object.keys(input.multiTimeframe)
    if (labels.length > 0) {
      const primary = labels[0]
      timeframeConfluence = buildTimeframeConfluence({
        primary: technical,
        supporting: labels
          .filter((l) => l !== primary)
          .map((l) => ({ label: l, context: input.multiTimeframe?.[l] })),
      })
      timeframeViews = timeframeConfluence
        ? [timeframeConfluence.primary, ...timeframeConfluence.supporting]
        : undefined
      if (timeframeConfluence?.alignment === 'opposed') {
        adjustedFor.push('timeframes opposed — confidence reduced')
      }
    }
  }

  const conflicts = detectConflicts(groups, timeframeViews)

  // Overbought/oversold oscillators against directional momentum: a real but
  // minor tension, detected only from actual oscillator readings.
  const rsi = technical.indicators?.rsi?.value
  const momentum = groups.find((g) => g.group === 'momentum')
  if (rsi != null && momentum && momentum.net !== 0) {
    const dir = momentum.net > 0 ? 'bullish' : 'bearish'
    if ((dir === 'bullish' && rsi >= 70) || (dir === 'bearish' && rsi <= 30)) {
      conflicts.push({
        id: `conflict-extreme-oscillator-${conflicts.length}`,
        severity: 'minor',
        type: 'extreme-oscillator',
        description: `${dir} momentum but RSI ${rsi.toFixed(1)} is ${dir === 'bullish' ? 'overbought' : 'oversold'} — follow-through risk`,
        groupA: 'momentum',
        groupB: 'momentum',
        directionA: dir,
        directionB: 'neutral',
        evidence: [`RSI = ${rsi.toFixed(1)}`, `${dir} momentum net ${momentum.net}`],
      })
    }
  }

  const confidence = conflictImpact(conflicts, score.confidence)
  const finalScore = { ...score, confidence }
  const bias = biasFromBalance(finalScore.balance, finalScore.confidence)
  const thesis = buildThesis(technical, bias, finalScore, groups)

  const candleCount = technical.dataQuality?.candleCount ?? 0
  if (!technical.dataQuality?.hasHighLow) adjustedFor.push('close-only feed')
  if (!technical.dataQuality?.hasVolume) adjustedFor.push('volume unavailable')
  if (candleCount > 0 && candleCount < 60) adjustedFor.push(`short history (${candleCount} bars)`)

  return {
    available: technical.available !== false && items.length > 0,
    instrument: technical.instrument,
    timeframe: technical.timeframe,
    generatedAt: new Date(now).toISOString(),
    bias,
    score: finalScore,
    evidence: items,
    groups,
    conflicts,
    timeframeConfluence,
    thesis,
    dataQuality: {
      candleCount,
      warnings,
      adjustedFor,
    },
    method: {
      version: ENGINE_VERSION,
      weights: weightTableSummary(),
      saturation: `within-group diminishing returns: item i × ${0.8}^(i-1), group caps applied`,
      evidenceCount: items.length,
      groupsUsed: groups.filter((g) => g.net !== 0).length,
    },
  }
}

export { BIAS_THRESHOLD }