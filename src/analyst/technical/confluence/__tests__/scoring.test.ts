import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { EvidenceItem, EvidenceGroupSummary } from '../types'
import { biasFromBalance, clamp, groupSummaries, saturate, scoreFromGroups } from '../scoring'
import { GROUP_CAPS, SATURATION_FACTOR, SOURCE_WEIGHTS, weightTableSummary } from '../weights'
import { baseWeight, freshnessOf, normalizeEvidence } from '../evidence'

function item(group: EvidenceItem['group'], direction: EvidenceItem['direction'], weight: number, confidence = 80, name = 'x'): EvidenceItem {
  return {
    id: `t-${group}-${direction}-${weight}`,
    source: group === 'chart' ? 'chart' : group === 'trend' ? 'trend' : group === 'momentum' ? 'momentum' : group === 'volume' ? 'volume' : group === 'structure' ? 'structure' : 'trend',
    group,
    name,
    direction,
    strength: weight,
    confidence,
    freshness: 100,
    weight,
    timestamp: null,
    evidence: [],
  }
}

test('weights table is complete and transparent', () => {
  const summary = weightTableSummary()
  assert.equal(summary.length, Object.keys(SOURCE_WEIGHTS).length)
  for (const row of summary) {
    assert.ok(row.base > 0, `${row.source} must have a positive base weight`)
    assert.ok(row.cap >= row.base, `${row.source} cap must be >= base weight`)
  }
  // Sanity anchors
  assert.equal(SOURCE_WEIGHTS.trend, 22)
  assert.equal(SOURCE_WEIGHTS.chart, 18)
})

test('saturation: five identical items contribute far less than their raw sum', () => {
  const weights = [10, 10, 10, 10, 10]
  const raw = 50
  const saturated = saturate(weights, 1000)
  assert.ok(saturated < raw, `saturated ${saturated} must be < raw ${raw}`)
  // First item full weight, each subsequent × 0.8
  assert.equal(saturated, Number((10 * (1 + 0.8 + 0.64 + 0.512 + 0.4096)).toFixed(2)))
  assert.equal(SATURATION_FACTOR, 0.8)
})

test('group caps: a flood of trend evidence cannot exceed the trend cap', () => {
  const weights = Array.from({ length: 20 }, () => 10)
  const saturated = saturate(weights, GROUP_CAPS.trend)
  assert.equal(saturated, GROUP_CAPS.trend)
})

test('neutral evidence appears in counts but never moves the net', () => {
  const items = [
    item('trend', 'bullish', 10),
    item('trend', 'neutral', 10),
    item('trend', 'bearish', 5),
  ]
  const groups = groupSummaries(items)
  const trend = groups.find((g) => g.group === 'trend')!
  assert.equal(trend.count, 3)
  assert.equal(trend.neutral, 1)
  assert.equal(trend.net, 5)
})

test('balance is bounded to -100..100', () => {
  const items = [
    item('trend', 'bullish', 45),
    item('chart', 'bullish', 40),
    item('breakout', 'bullish', 40),
    item('structure', 'bullish', 35),
    item('momentum', 'bullish', 35),
    item('volume', 'bullish', 30),
  ]
  const score = scoreFromGroups(groupSummaries(items), items)
  assert.ok(score.bullish <= 100)
  assert.ok(score.balance <= 100)
  assert.ok(score.balance > 0)
})

test('bias thresholds follow the documented table', () => {
  assert.equal(biasFromBalance(30, 60), 'bullish')
  assert.equal(biasFromBalance(-30, 60), 'bearish')
  assert.equal(biasFromBalance(10, 60), 'balanced')
  assert.equal(biasFromBalance(50, 0), 'insufficient-data')
})

test('freshness decays with a 4-day half-life', () => {
  const now = Date.UTC(2025, 0, 10)
  assert.equal(freshnessOf(null, now), 100)
  assert.equal(freshnessOf(new Date(now).toISOString(), now), 100)
  const old = now - 4 * 86_400_000
  const fresh = freshnessOf(new Date(old).toISOString(), now)
  assert.ok(fresh > 40 && fresh < 60, `expected ~50, got ${fresh}`)
  const ancient = now - 40 * 86_400_000
  assert.equal(freshnessOf(new Date(ancient).toISOString(), now), 0)
})

test('base weight scales with reliability and freshness', () => {
  assert.equal(baseWeight('trend', 100, 1, 100), 22)
  assert.equal(baseWeight('trend', 50, 1, 100), 11)
  assert.equal(baseWeight('chart', 70, 0.6, 100), Number((18 * 0.7 * 0.6).toFixed(2)))
  assert.equal(baseWeight('chart', 70, 0.6, 50), Number((18 * 0.7 * 0.6 * 0.5).toFixed(2)))
})

test('normalizeEvidence: failed/invalidated patterns are excluded from scoring', () => {
  const now = Date.now()
  const fake = {
    available: true,
    instrument: 'X',
    timeframe: 'daily',
    generatedAt: new Date(now).toISOString(),
    price: { current: 100 },
    dataQuality: { candleCount: 300, hasHighLow: true, hasVolume: true },
    signals: [],
    patterns: {
      all: [
        {
          family: 'chart', name: 'double-top', label: 'Double Top', direction: 'bearish' as const,
          status: 'confirmed', confidence: 70, strength: 60, detectedAt: now, barIndex: 0,
          invalidationLevel: 101, targetLevel: 95, evidence: ['x'],
        },
        {
          family: 'breakout', name: 'resistance-breakout', label: 'Resistance Breakout', direction: 'bullish' as const,
          status: 'failed', confidence: 70, strength: 60, detectedAt: now, barIndex: 0,
          invalidationLevel: null, targetLevel: null, evidence: ['y'],
        },
      ],
    },
  }
  const { items, adjustedFor } = normalizeEvidence(fake, now)
  const patterns = items.filter((i) => i.metadata?.patternName)
  assert.equal(patterns.length, 1)
  assert.equal(patterns[0].metadata?.patternName, 'double-top')
  assert.ok(adjustedFor.some((a) => a.includes('excluded')))
})

test('normalizeEvidence: pattern signals are not double counted', () => {
  const now = Date.now()
  const fake = {
    available: true,
    instrument: 'X',
    timeframe: 'daily',
    generatedAt: new Date(now).toISOString(),
    price: { current: 100 },
    dataQuality: { candleCount: 300, hasHighLow: true, hasVolume: true },
    signals: [
      {
        category: 'trend', name: 'Trend up', direction: 'bullish' as const, strength: 60,
        confidence: 80, timestamp: new Date(now).toISOString(), evidence: [],
        metadata: { patternName: 'double-top', family: 'chart', status: 'confirmed' },
      },
      {
        category: 'momentum', name: 'RSI', direction: 'bullish' as const, strength: 50,
        confidence: 70, timestamp: new Date(now).toISOString(), evidence: [],
      },
    ],
    patterns: {
      all: [
        {
          family: 'chart', name: 'double-top', label: 'Double Top', direction: 'bearish' as const,
          status: 'confirmed', confidence: 70, strength: 60, detectedAt: now, barIndex: 0,
          invalidationLevel: 101, targetLevel: 95, evidence: ['x'],
        },
      ],
    },
  }
  const { items } = normalizeEvidence(fake, now)
  const chart = items.filter((i) => i.group === 'chart')
  const momentum = items.filter((i) => i.group === 'momentum')
  assert.equal(chart.length, 1)
  assert.equal(momentum.length, 1)
})

test('clamp helper', () => {
  assert.equal(clamp(150, 0, 100), 100)
  assert.equal(clamp(-5, 0, 100), 0)
  assert.equal(clamp(42, 0, 100), 42)
})

test('groupSummaries sorts nothing but reports all non-empty groups', () => {
  const groups: EvidenceGroupSummary[] = groupSummaries([item('trend', 'bullish', 10), item('chart', 'bearish', 5)])
  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map((g) => g.group).sort(), ['chart', 'trend'])
})