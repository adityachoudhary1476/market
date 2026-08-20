// ---------------------------------------------------------------------------
// Phase 2C — conflict detection
//
// Explicit, rule-based conflicts between evidence groups. A conflict lowers
// the confidence in the overall picture (it is never silently averaged away)
// and is reported in the context so consumers see exactly which groups argue
// against each other.
// ---------------------------------------------------------------------------

import type {
  EvidenceConflict,
  EvidenceGroup,
  EvidenceGroupSummary,
  TimeframeView,
} from './types'

let counter = 0
function cid(): string {
  counter += 1
  return `conflict-${counter}`
}
export function resetConflictIdCounter() {
  counter = 0
}

interface OpposingGroup {
  a: EvidenceGroup
  b: EvidenceGroup
}

/** Pairs of groups whose opposite net direction is a genuine conflict. */
const OPPOSING_PAIRS: OpposingGroup[] = [
  { a: 'trend', b: 'momentum' },
  { a: 'trend', b: 'chart' },
  { a: 'trend', b: 'candlestick' },
  { a: 'trend', b: 'divergence' },
  { a: 'chart', b: 'momentum' },
  { a: 'chart', b: 'candlestick' },
  { a: 'structure', b: 'chart' },
  { a: 'breakout', b: 'support-resistance' },
  { a: 'divergence', b: 'momentum' },
]

export function detectConflicts(
  groups: EvidenceGroupSummary[],
  timeframeViews?: TimeframeView[],
): EvidenceConflict[] {
  const conflicts: EvidenceConflict[] = []
  const byGroup = new Map(groups.map((g) => [g.group, g]))

  for (const { a, b } of OPPOSING_PAIRS) {
    const ga = byGroup.get(a)
    const gb = byGroup.get(b)
    if (!ga || !gb) continue
    if (ga.net === 0 || gb.net === 0) continue
    const dirA = ga.net > 0 ? 'bullish' : 'bearish'
    const dirB = gb.net > 0 ? 'bullish' : 'bearish'
    if (dirA === dirB) continue
    const strongA = Math.abs(ga.net) >= 12
    const strongB = Math.abs(gb.net) >= 12
    conflicts.push({
      id: cid(),
      severity: strongA && strongB ? 'major' : 'minor',
      type: `${a}-vs-${b}`,
      description: `${a} evidence argues ${dirA} while ${b} evidence argues ${dirB}`,
      groupA: a,
      groupB: b,
      directionA: dirA,
      directionB: dirB,
      evidence: [
        `${a} net ${ga.net > 0 ? '+' : ''}${ga.net} (${ga.count} item(s))`,
        `${b} net ${gb.net > 0 ? '+' : ''}${gb.net} (${gb.count} item(s))`,
      ],
    })
  }

  // Timeframe alignment conflicts.
  if (timeframeViews && timeframeViews.length >= 2) {
    const primary = timeframeViews[0]
    const others = timeframeViews.slice(1).filter((v) => v.available && v.bias && v.bias !== 'balanced' && v.bias !== 'insufficient-data')
    for (const other of others) {
      if (primary.bias && primary.bias !== 'balanced' && primary.bias !== 'insufficient-data' && other.bias !== primary.bias) {
        conflicts.push({
          id: cid(),
          severity: 'major',
          type: 'timeframe-conflict',
          description: `${primary.timeframe} argues ${primary.bias} while ${other.timeframe} argues ${other.bias}`,
          groupA: 'trend',
          groupB: 'trend',
          directionA: primary.bias,
          directionB: other.bias as 'bullish' | 'bearish',
          evidence: [
            `${primary.timeframe} balance ${primary.balance ?? 0}`,
            `${other.timeframe} balance ${other.balance ?? 0}`,
          ],
        })
      }
    }
  }

  return conflicts
}

export function conflictImpact(conflicts: EvidenceConflict[], baseConfidence: number): number {
  if (conflicts.length === 0) return baseConfidence
  const majors = conflicts.filter((c) => c.severity === 'major').length
  const minors = conflicts.filter((c) => c.severity === 'minor').length
  const penalty = majors * 10 + minors * 4
  return Math.max(0, Number((baseConfidence - penalty).toFixed(1)))
}