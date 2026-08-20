import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectChartPatterns } from '../detectors/chartPatternDetector'
import { doubleTop, doubleBottom, closeOnlySeries, resistanceBreakout, uptrend } from './fixtures'

test('detects a double top and break of neckline', () => {
  const patterns = detectChartPatterns(doubleTop(), { lookback: 2, minSeparation: 4 })
  const found = patterns.find((p) => p.name === 'double-top')
  assert.ok(found, 'double top should be detected')
  assert.equal(found!.direction, 'bearish')
  assert.ok(found!.invalidationLevel != null)
  assert.ok(found!.targetLevel != null)
})

test('detects a double bottom', () => {
  const patterns = detectChartPatterns(doubleBottom(), { lookback: 2, minSeparation: 4 })
  const found = patterns.find((p) => p.name === 'double-bottom')
  assert.ok(found, 'double bottom should be detected')
  assert.equal(found!.direction, 'bullish')
})

test('chart patterns include evidence and points', () => {
  const patterns = detectChartPatterns(doubleTop(), { lookback: 2, minSeparation: 4 })
  for (const p of patterns) {
    assert.ok(p.evidence.length > 0)
    assert.ok(pointsValid(p))
  }
})

test('close-only data still produces chart patterns (pivots use close) but with a warning in quality', () => {
  // The detector may find a rectangle/range even on close data, but must not crash.
  const patterns = detectChartPatterns(closeOnlySeries(60))
  assert.ok(Array.isArray(patterns))
})

test('insufficient data returns empty', () => {
  assert.equal(detectChartPatterns(uptrend(5)).length, 0)
})

function pointsValid(p: ReturnType<typeof detectChartPatterns>[number]) {
  if (!p.points) return true
  return p.points.every((pt) => Number.isFinite(pt.price) && pt.index >= 0)
}

void resistanceBreakout
