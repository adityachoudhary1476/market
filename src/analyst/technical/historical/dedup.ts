// ---------------------------------------------------------------------------
// Phase 2D — event de-duplication
//
// The same underlying market event must not be counted as many independent
// observations. A breakout that stays technically true for 8 consecutive bars
// would otherwise produce 8 "independent" setups.
//
// Methodology: setups are sorted by timestamp. Two setups belong to the same
// event cluster when they share (pattern family + pattern name + direction)
// and their bar indices are closer than `minimumBarsBetweenMatches`. Each
// cluster contributes its FIRST setup to the statistics sample.
// ---------------------------------------------------------------------------

import type { EventCluster, HistoricalSetup } from './types'
import type { HistoricalConfig } from './config'

export function clusterKey(setup: HistoricalSetup): string {
  const p = setup.pattern
  return `${p ? `${p.family}|${p.name}` : 'no-pattern'}|${setup.direction}`
}

export function clusterEvents(
  setups: HistoricalSetup[],
  config: HistoricalConfig,
): { clusters: EventCluster[]; representatives: HistoricalSetup[] } {
  const sorted = [...setups].sort((a, b) => a.barIndex - b.barIndex)
  const clusters: EventCluster[] = []
  const representatives: HistoricalSetup[] = []
  // Last bar index per cluster key — avoids repeated linear scans.
  const lastBarByKey = new Map<string, number>()

  for (const setup of sorted) {
    const key = clusterKey(setup)
    const lastBar = lastBarByKey.get(key)
    if (lastBar != null && setup.barIndex - lastBar < config.minimumBarsBetweenMatches) {
      const openCluster = [...clusters].reverse().find((c) => c.key === key)!
      openCluster.setupIds.push(setup.id)
      openCluster.count += 1
      lastBarByKey.set(key, setup.barIndex)
      continue
    }
    clusters.push({ key, firstTimestamp: setup.timestamp, count: 1, setupIds: [setup.id] })
    lastBarByKey.set(key, setup.barIndex)
    representatives.push(setup)
  }

  return { clusters, representatives }
}