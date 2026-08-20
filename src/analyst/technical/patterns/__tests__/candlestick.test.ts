import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectCandlestickPatterns } from '../detectors/candlestickDetector'
import {
  bullishEngulfing,
  dojiCandle,
  hammerCandle,
  shootingStarCandle,
  morningStarCandle,
  eveningStarCandle,
  closeOnlySeries,
  uptrend,
} from './fixtures'

test('detects bullish engulfing at end of a decline', () => {
  const patterns = detectCandlestickPatterns(bullishEngulfing())
  const found = patterns.find((p) => p.name === 'bullish-engulfing')
  assert.ok(found, 'should find bullish engulfing')
  assert.equal(found!.direction, 'bullish')
  assert.equal(found!.status, 'confirmed')
  assert.ok(found!.invalidationLevel != null)
})

test('detects doji', () => {
  const patterns = detectCandlestickPatterns(dojiCandle())
  const found = patterns.find((p) => p.name === 'doji')
  assert.ok(found)
  assert.equal(found!.direction, 'neutral')
})

test('detects hammer', () => {
  const patterns = detectCandlestickPatterns(hammerCandle())
  const found = patterns.find((p) => p.name === 'hammer')
  assert.ok(found)
  assert.equal(found!.direction, 'bullish')
})

test('detects shooting star', () => {
  const patterns = detectCandlestickPatterns(shootingStarCandle())
  const found = patterns.find((p) => p.name === 'shooting-star')
  assert.ok(found, 'shooting star should be detected')
  assert.equal(found!.direction, 'bearish')
})

test('detects morning star', () => {
  const patterns = detectCandlestickPatterns(morningStarCandle())
  const found = patterns.find((p) => p.name === 'morning-star')
  assert.ok(found, 'morning star should be detected')
  assert.equal(found!.direction, 'bullish')
})

test('detects evening star', () => {
  const patterns = detectCandlestickPatterns(eveningStarCandle())
  const found = patterns.find((p) => p.name === 'evening-star')
  assert.ok(found, 'evening star should be detected')
  assert.equal(found!.direction, 'bearish')
})

test('returns empty on close-only data (no fabricated wicks)', () => {
  const patterns = detectCandlestickPatterns(closeOnlySeries(60))
  assert.equal(patterns.length, 0)
})

test('returns empty on insufficient data', () => {
  assert.equal(detectCandlestickPatterns(uptrend(2)).length, 0)
})

test('every pattern has required fields', () => {
  const patterns = detectCandlestickPatterns(bullishEngulfing())
  for (const p of patterns) {
    assert.ok(p.id)
    assert.ok(p.evidence.length > 0)
    assert.ok(p.confidence >= 0 && p.confidence <= 100)
    assert.ok(['forming', 'confirmed', 'mature', 'failed', 'complete'].includes(p.status))
  }
})
