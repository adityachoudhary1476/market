import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SIMILARITY_FACTOR_WEIGHTS, similarityBetween, findSimilar, setupFromDescriptor } from '../similarity'
import type { HistoricalSetup } from '../types'

function base(overrides: Partial<HistoricalSetup> = {}): HistoricalSetup {
  return {
    id: 'base',
    timestamp: 1000,
    barIndex: 10,
    instrument: 'TEST',
    timeframe: 'weekly',
    direction: 'bullish',
    pattern: { family: 'breakout', type: 'breakout', name: 'range-breakout', status: 'confirmed', confidence: 70, invalidationLevel: 100, targetLevel: 110 },
    confluence: { bias: 'bullish', quality: 'strong' },
    evidenceSignature: { trend: 'bullish', momentum: 'bullish', structure: 'bullish', volume: 'high', volatility: 'normal' },
    regime: 'risk-on',
    ...overrides,
  }
}

test('similarity: identical setups score 100 and match', () => {
  const r = similarityBetween(base(), base())
  assert.equal(r.score, 100)
  assert.equal(r.match, true)
  assert.equal(r.factors.length, 9)
  assert.ok(r.explanation.length >= 9)
})

test('similarity: weights are explicit and sum to 1', () => {
  const sum = Object.values(SIMILARITY_FACTOR_WEIGHTS).reduce((s, w) => s + w, 0)
  assert.ok(Math.abs(sum - 1) < 1e-9)
  assert.deepEqual(
    Object.keys(SIMILARITY_FACTOR_WEIGHTS).sort(),
    ['confluence', 'direction', 'momentum', 'pattern', 'regime', 'structure', 'trend', 'volatility', 'volume'].sort(),
  )
})

test('similarity: opposite direction halves the score', () => {
  const a = base()
  const b = base({ id: 'b', direction: 'bearish', pattern: { ...base().pattern!, name: 'support-breakdown' } })
  const r = similarityBetween(a, b)
  assert.ok(r.score < 100)
  const dirFactor = r.factors.find((f) => f.key === 'direction')!
  assert.equal(dirFactor.score, 0)
})

test('similarity: opposite regime penalises hard', () => {
  const r = similarityBetween(base(), base({ id: 'b', regime: 'risk-off' }))
  const regimeFactor = r.factors.find((f) => f.key === 'regime')!
  assert.equal(regimeFactor.score, 0.25)
})

test('similarity: threshold controls the match flag', () => {
  const a = base()
  const b = base({ id: 'b', regime: 'risk-off', evidenceSignature: { ...base().evidenceSignature, trend: 'bearish', structure: 'bearish', momentum: 'bearish', volume: 'low' } })
  const strict = similarityBetween(a, b, 0.8)
  const lax = similarityBetween(a, b, 0.2)
  assert.equal(strict.match, false)
  assert.equal(lax.match, true)
})

test('similarity: findSimilar ranks by score, reports considered/accepted, skips self', () => {
  const q = base()
  const others = [
    base({ id: 'c1', barIndex: 20 }),
    base({ id: 'c2', barIndex: 30, regime: 'risk-off' }),
    base({ id: 'c3', barIndex: 40, direction: 'bearish', pattern: { ...base().pattern!, name: 'support-breakdown' } }),
  ]
  const { matches, considered, accepted } = findSimilar(q, [...others, q], 0.6, 10)
  assert.equal(considered, 3) // self skipped
  assert.equal(accepted, matches.length)
  assert.equal(matches[0].setup.id, 'c1')
  assert.ok(matches[0].similarity.score >= matches[matches.length - 1].similarity.score)
  assert.ok(matches[0].similarity.score > matches[2].similarity.score)
})

test('similarity: setupFromDescriptor produces a query setup', () => {
  const q = setupFromDescriptor('TEST', 'weekly', { pattern: 'range-breakout', direction: 'bullish' })
  assert.equal(q.id, 'query-setup')
  assert.equal(q.pattern!.name, 'range-breakout')
  assert.equal(q.direction, 'bullish')
  const r = similarityBetween(q, base())
  assert.ok(r.score > 50, `query-to-real should be reasonably similar, got ${r.score}`)
})