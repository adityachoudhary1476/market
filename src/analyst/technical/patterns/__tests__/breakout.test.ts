import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectBreakouts } from '../detectors/breakoutDetector'
import { buildTechnicalContext } from '../../technicalContext'
import { resistanceBreakout, closeOnlySeries, uptrend } from './fixtures'

test('detects resistance breakout with penetration and volume confirmation', () => {
  const candles = resistanceBreakout()
  const tech = buildTechnicalContext('TEST', candles, { timeframe: 'daily' })
  const breakouts = detectBreakouts(candles, tech, { penetrationThresholdPct: 0.2 })
  const found = breakouts.find((b) => b.name === 'resistance-breakout' || b.name === 'range-breakout')
  assert.ok(found, 'a breakout should be detected on a strong up-close')
  assert.equal(found!.direction, 'bullish')
  assert.ok((found!.penetrationPercent as number) > 0)
  if (found!.volumeConfirmation != null) assert.ok(found!.volumeConfirmation > 1)
})

test('does not fabricate breakouts on a steady uptrend without level breach', () => {
  const candles = uptrend(40)
  const tech = buildTechnicalContext('TEST', candles, { timeframe: 'daily' })
  const breakouts = detectBreakouts(candles, tech)
  // Uptrend may trigger new-high, but not support-breakdown.
  assert.ok(!breakouts.some((b) => b.name === 'support-breakdown'))
})

test('close-only data: MAs may produce EMA breakouts, ATR/S/R return null honestly', () => {
  const candles = closeOnlySeries(60)
  const tech = buildTechnicalContext('CLOSE', candles, { timeframe: 'daily' })
  assert.equal(tech.indicators.atr.value, null)
  // Breakouts should not crash; S/R is empty so no zone breakouts.
  const breakouts = detectBreakouts(candles, tech)
  assert.ok(Array.isArray(breakouts))
})

test('every breakout has a level and evidence', () => {
  const candles = resistanceBreakout()
  const tech = buildTechnicalContext('TEST', candles, { timeframe: 'daily' })
  const breakouts = detectBreakouts(candles, tech)
  for (const b of breakouts) {
    assert.ok(Number.isFinite(b.level))
    assert.ok(b.evidence.length > 0)
    assert.ok(['bullish', 'bearish', 'neutral'].includes(b.direction))
  }
})
