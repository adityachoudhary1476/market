import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectChartPatterns } from '../detectors/chartPatternDetector'
import { detectCandlestickPatterns } from '../detectors/candlestickDetector'
import { detectBreakouts } from '../detectors/breakoutDetector'
import { buildTechnicalContext } from '../../technicalContext'
import {
  randomWalk,
  almostDoubleTop,
  insufficientSeparation,
  incompleteHeadAndShoulders,
  fakeBreakout,
  flatMarket,
  retestSeries,
} from './fixtures'

// ---------------------------------------------------------------------------
// §27 — False-positive safeguards. A high-quality detector prefers "no
// confirmed pattern" over "pattern detected" when the evidence is weak.
// ---------------------------------------------------------------------------

const CHART_OPTS = { lookback: 2, minSeparation: 5 }

test('random walk does not produce a classic reversal pattern', () => {
  const patterns = detectChartPatterns(randomWalk(80), CHART_OPTS)
  const classic = patterns.filter((p) =>
    ['double-top', 'double-bottom', 'triple-top', 'triple-bottom', 'head-and-shoulders', 'inverse-head-and-shoulders']
      .includes(p.name),
  )
  assert.equal(classic.length, 0, `unexpected reversal patterns: ${classic.map((p) => p.name).join(', ')}`)
})

test('almost-double-top (second peak 3.6% below first) is NOT a double top', () => {
  const patterns = detectChartPatterns(almostDoubleTop(), CHART_OPTS)
  assert.ok(!patterns.some((p) => p.name === 'double-top'), 'should not claim a double top')
})

test('insufficient separation between equal highs is NOT a double top', () => {
  const patterns = detectChartPatterns(insufficientSeparation(), CHART_OPTS)
  assert.ok(!patterns.some((p) => p.name === 'double-top'), 'should not claim a double top')
})

test('incomplete head-and-shoulders (head not above shoulders) is NOT detected', () => {
  const patterns = detectChartPatterns(incompleteHeadAndShoulders(), CHART_OPTS)
  assert.ok(!patterns.some((p) => p.name === 'head-and-shoulders'), 'should not claim head & shoulders')
})

test('fake breakout closes back inside the range → detected as FAILED, not confirmed', () => {
  const candles = fakeBreakout()
  const tech = buildTechnicalContext('TEST', candles, { timeframe: 'daily' })
  const breakouts = detectBreakouts(candles, tech, { historyLookback: 40, failWindow: 3 })
  const failed = breakouts.find((b) => b.status === 'failed')
  assert.ok(failed, 'a failed breakout should be reported')
  assert.ok(failed!.metadata?.reentryLevel != null, 'metadata must include reentryLevel')
  assert.ok(failed!.metadata?.failureDistance != null, 'metadata must include failureDistance')
  assert.ok(failed!.metadata?.barsSinceBreakout != null, 'metadata must include barsSinceBreakout')
  assert.ok(!breakouts.some((b) => b.status === 'confirmed' && b.name === 'resistance-breakout' && b.barIndex === candles.length - 4))
})

test('retest after breakout holds above the level → reported as retest', () => {
  const candles = retestSeries()
  const tech = buildTechnicalContext('TEST', candles, { timeframe: 'daily' })
  const breakouts = detectBreakouts(candles, tech, { historyLookback: 40, failWindow: 4 })
  const retest = breakouts.find((b) => b.name === 'breakout-retest')
  assert.ok(retest, 'a held retest should be reported')
  assert.equal(retest!.metadata?.retestHeld, true)
  assert.ok(retest!.metadata?.originalBreakoutLevel != null)
  assert.ok(retest!.metadata?.retestDistance != null)
})

test('flat market produces no candlestick or chart patterns', () => {
  // A perfectly flat tape IS technically a doji (body = 0% of range), so the
  // neutral doji may appear — but no directional candlestick or chart
  // structure may be claimed.
  const candles = flatMarket(60)
  const directional = ['hammer', 'inverted-hammer', 'hanging-man', 'shooting-star', 'bullish-engulfing', 'bearish-engulfing', 'morning-star', 'evening-star']
  for (const p of detectCandlestickPatterns(candles)) {
    assert.ok(!directional.includes(p.name), `flat market claimed ${p.name}`)
  }
  const charts = detectChartPatterns(candles, CHART_OPTS)
  assert.ok(!charts.some((p) => p.status !== 'unavailable'), 'flat market should not claim structure')
})

test('random walk does not produce candlestick patterns on the final bar unless it is genuinely one', () => {
  const patterns = detectCandlestickPatterns(randomWalk(60))
  const meaningful = patterns.filter((p) =>
    ['hammer', 'shooting-star', 'morning-star', 'evening-star', 'engulfing'].some((n) => n.includes(p.name)),
  )
  assert.ok(meaningful.length <= 2, 'random walk should rarely produce meaningful candlesticks')
})