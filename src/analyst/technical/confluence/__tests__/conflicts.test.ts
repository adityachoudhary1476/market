import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { EvidenceGroupSummary, TimeframeView } from '../types'
import { conflictImpact, detectConflicts } from '../conflicts'
import { resetConflictIdCounter } from '../conflicts'

function group(g: EvidenceGroupSummary['group'], net: number): EvidenceGroupSummary {
  return { group: g, count: 1, bullish: net > 0 ? 1 : 0, bearish: net < 0 ? 1 : 0, neutral: 0, weightedBull: Math.max(0, net), weightedBear: Math.max(0, -net), net }
}

test('aligned groups produce no conflict', () => {
  const conflicts = detectConflicts([group('trend', 20), group('chart', 18), group('momentum', 10)])
  assert.equal(conflicts.length, 0)
})

test('opposing trend vs chart is a major conflict', () => {
  const conflicts = detectConflicts([group('trend', 20), group('chart', -18)])
  const c = conflicts.find((x) => x.type === 'trend-vs-chart')
  assert.ok(c, 'trend-vs-chart conflict must exist')
  assert.equal(c!.severity, 'major')
  assert.equal(c!.directionA, 'bullish')
  assert.equal(c!.directionB, 'bearish')
})

test('weak opposing evidence is only a minor conflict', () => {
  const conflicts = detectConflicts([group('trend', 20), group('momentum', -6)])
  const c = conflicts.find((x) => x.type === 'trend-vs-momentum')
  assert.ok(c)
  assert.equal(c!.severity, 'minor')
})

test('breakout vs support-resistance opposition is reported', () => {
  const conflicts = detectConflicts([group('breakout', 15), group('support-resistance', -15)])
  assert.ok(conflicts.find((x) => x.type === 'breakout-vs-support-resistance'))
})

test('timeframe conflict: opposing biases across timeframes', () => {
  const primary: TimeframeView = { timeframe: 'daily', available: true, balance: 40, confidence: 70, bias: 'bullish' }
  const weekly: TimeframeView = { timeframe: 'weekly', available: true, balance: -35, confidence: 60, bias: 'bearish' }
  const conflicts = detectConflicts([group('trend', 20)], [primary, weekly])
  const c = conflicts.find((x) => x.type === 'timeframe-conflict')
  assert.ok(c, 'timeframe-conflict must exist')
  assert.equal(c!.severity, 'major')
})

test('conflict impact: majors penalize 10, minors 4', () => {
  assert.equal(conflictImpact([], 80), 80)
  const oneMajor: Parameters<typeof conflictImpact>[0] = [{ id: 'a', severity: 'major', type: 't', description: 'd', groupA: 'trend', groupB: 'chart', directionA: 'bullish', directionB: 'bearish', evidence: [] }]
  assert.equal(conflictImpact(oneMajor, 80), 70)
  const oneMinor: Parameters<typeof conflictImpact>[0] = [{ id: 'a', severity: 'minor', type: 't', description: 'd', groupA: 'trend', groupB: 'chart', directionA: 'bullish', directionB: 'bearish', evidence: [] }]
  assert.equal(conflictImpact(oneMinor, 80), 76)
})

test('conflict ids are deterministic per run', () => {
  resetConflictIdCounter()
  const a = detectConflicts([group('trend', 20), group('chart', -18)])
  resetConflictIdCounter()
  const b = detectConflicts([group('trend', 20), group('chart', -18)])
  assert.deepEqual(a.map((c) => c.id), b.map((c) => c.id))
})