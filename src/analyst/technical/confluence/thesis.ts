// ---------------------------------------------------------------------------
// Phase 2C — thesis construction
//
// Turns the numeric score into a structured, machine-readable thesis:
// conditions that ARE true, conditions that would INVALIDATE it, and the key
// levels that matter. No prose fluff — everything is typed and checkable.
// ---------------------------------------------------------------------------

import type {
  ConfluenceBias,
  ConfluenceScore,
  EvidenceGroupSummary,
  KeyLevel,
  StructuredTechnicalContextLike,
  TechnicalThesis,
  ThesisCondition,
} from './types'

function condition(description: string, metric: string, value: number | string | boolean, operator: ThesisCondition['operator']): ThesisCondition {
  return { description, metric, value, operator }
}

export function buildThesis(
  technical: StructuredTechnicalContextLike,
  bias: ConfluenceBias,
  score: ConfluenceScore,
  groups: EvidenceGroupSummary[],
): TechnicalThesis | null {
  if (bias === 'insufficient-data') return null

  const conditions: ThesisCondition[] = []
  const invalidationConditions: ThesisCondition[] = []
  const keyLevels: KeyLevel[] = []
  const price = technical.price?.current

  const trend = technical.trend?.overall
  if (trend && trend.direction !== 'insufficient-data') {
    conditions.push(condition(`Overall trend is ${trend.direction}`, 'trend.overall.direction', trend.direction, 'is'))
  }

  const ma = technical.indicators?.movingAverages
  if (price != null && ma?.priceAbove?.ema20 != null) {
    conditions.push(condition(`Price ${ma.priceAbove.ema20 ? 'above' : 'below'} EMA20`, 'ma.priceAbove.ema20', price, ma.priceAbove.ema20 ? 'above' : 'below'))
  }

  const rsi = technical.indicators?.rsi
  if (rsi?.value != null) {
    conditions.push(condition(`RSI ${rsi.value.toFixed(1)}`, 'rsi.value', Number(rsi.value.toFixed(1)), 'is'))
  }

  const sr = technical.supportResistance
  if (sr?.nearestSupport && price != null) {
    keyLevels.push({
      type: 'support',
      low: sr.nearestSupport.low,
      high: sr.nearestSupport.high,
      distancePercent: sr.distanceToSupportPercent ?? null,
      strength: sr.nearestSupport.strength,
      touches: sr.nearestSupport.touches,
    })
    invalidationConditions.push(condition(`Close below support ${sr.nearestSupport.low.toFixed(2)}`, 'supportResistance.nearestSupport', Number(sr.nearestSupport.low.toFixed(2)), 'below'))
  }
  if (sr?.nearestResistance && price != null) {
    keyLevels.push({
      type: 'resistance',
      low: sr.nearestResistance.low,
      high: sr.nearestResistance.high,
      distancePercent: sr.distanceToResistancePercent ?? null,
      strength: sr.nearestResistance.strength,
      touches: sr.nearestResistance.touches,
    })
    conditions.push(condition(`Resistance above at ${sr.nearestResistance.low.toFixed(2)}`, 'supportResistance.nearestResistance', Number(sr.nearestResistance.low.toFixed(2)), 'above'))
  }

  const activePatterns = technical.patterns?.activePatterns ?? []
  for (const p of activePatterns) {
    if (p.invalidationLevel != null) {
      const op = p.direction === 'bullish' ? 'below' : 'above'
      const opWord = op === 'below' ? 'below' : 'above'
      invalidationConditions.push(condition(
        `${p.label} invalidates on close ${opWord} ${p.invalidationLevel.toFixed(2)}`,
        `patterns.${p.name}.invalidationLevel`,
        Number(p.invalidationLevel.toFixed(2)),
        op,
      ))
      keyLevels.push({
        type: p.direction === 'bullish' ? 'support' : 'resistance',
        low: p.invalidationLevel,
        high: p.invalidationLevel,
        distancePercent: price != null ? Number((((p.invalidationLevel - price) / price) * 100).toFixed(2)) : null,
        strength: Math.round(p.confidence),
        touches: 0,
      })
    }
  }

  const supportingGroups = groups
    .filter((g) => g.net > 0)
    .sort((a, b) => b.net - a.net)
    .map((g) => g.group)
  const opposingGroups = groups
    .filter((g) => g.net < 0)
    .sort((a, b) => a.net - b.net)
    .map((g) => g.group)

  const drivers = supportingGroups.length > 0
    ? supportingGroups.slice(0, 2).join(', ')
    : opposingGroups.slice(0, 2).join(', ')

  const summary =
    bias === 'balanced'
      ? `BALANCED — bull ${score.bullish.toFixed(0)} vs bear ${score.bearish.toFixed(0)} (confidence ${score.confidence.toFixed(0)}); no side dominates.`
      : `${bias.toUpperCase()} — balance ${score.balance > 0 ? '+' : ''}${score.balance.toFixed(1)}, confidence ${score.confidence.toFixed(0)}; driven by ${drivers}${opposingGroups.length > 0 ? `; opposed by ${opposingGroups.slice(0, 2).join(', ')}` : ''}${invalidationConditions.length > 0 ? `; key risk: ${invalidationConditions[0].description}` : ''}.`

  return {
    summary,
    bias,
    score,
    conditions,
    invalidationConditions,
    keyLevels,
    supportingGroups,
    opposingGroups,
  }
}