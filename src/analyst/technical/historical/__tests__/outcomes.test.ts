import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeSetupOutcome } from '../outcomes'
import { DEFAULT_HISTORICAL_CONFIG } from '../config'
import type { Candle } from '../../types'
import type { HistoricalSetup } from '../types'
import { makeCandle } from './fixtures'

function setup(
  barIndex: number,
  direction: 'bullish' | 'bearish' = 'bullish',
  overrides: Partial<HistoricalSetup> = {},
): HistoricalSetup {
  return {
    id: `s-${barIndex}`,
    timestamp: barIndex * 1000,
    barIndex,
    instrument: 'TEST',
    timeframe: 'daily',
    direction,
    pattern: { family: 'breakout', type: 'breakout', name: 'range-breakout', status: 'confirmed', confidence: 70, invalidationLevel: 100, targetLevel: 110 },
    confluence: null,
    evidenceSignature: {},
    regime: 'risk-on',
    ...overrides,
  }
}

const DAY = 86_400_000
function series(closes: number[], opts: { hasHighLow?: boolean } = {}): Candle[] {
  return closes.map((c, i) =>
    opts.hasHighLow ? makeCandle(i * DAY, c, c * 1.01, c * 0.99) : makeCandle(i * DAY, c),
  )
}

test('outcomes: forward return at horizon h is (close[T+h]-close[T])/close[T]', () => {
  const candles = series([100, 100, 102, 102, 103, 104])
  const o = computeSetupOutcome(setup(0), candles, false, false, DEFAULT_HISTORICAL_CONFIG)
  assert.ok(o)
  assert.equal(o.horizons['1'].forwardReturn, 0) // 100 -> 100
  assert.equal(o.horizons['3'].forwardReturn, 2) // 100 -> 102
  assert.equal(o.horizons['5'].forwardReturn, 4) // 100 -> 104
  assert.equal(o.horizons['10'].forwardReturn, null) // beyond series end
})

test('outcomes: costs are subtracted from the forward return', () => {
  const candles = series([100, 102])
  const o = computeSetupOutcome(setup(0), candles, false, false, DEFAULT_HISTORICAL_CONFIG, {
    fees: 0.05,
    slippage: 0.1,
    spread: 0.05,
  })
  assert.ok(o)
  // raw = 2.0; costs = 0.05 + 0.1*2 + 0.05 = 0.3 -> 1.7
  assert.equal(o.horizons['1'].forwardReturn, 1.7)
})

test('outcomes: close-only feed -> MFE/MAE null; OHLC feed -> computed', () => {
  const candles = series([100, 102, 101, 105, 103])
  const closeOnly = computeSetupOutcome(setup(0), candles, false, false, DEFAULT_HISTORICAL_CONFIG)
  assert.ok(closeOnly)
  assert.equal(closeOnly.horizons['3'].mfePercent, null)
  assert.equal(closeOnly.horizons['3'].maePercent, null)

  const ohlc = computeSetupOutcome(setup(0), series([100, 102, 101, 105, 103], { hasHighLow: true }), true, false, DEFAULT_HISTORICAL_CONFIG)
  assert.ok(ohlc)
  assert.ok(ohlc.horizons['3'].mfePercent != null)
  assert.ok(ohlc.horizons['3'].maePercent != null)
})

test('outcomes: MFE/MAE are extreme excursions within the horizon window', () => {
  const candles = series([100, 90, 95, 110, 105], { hasHighLow: true })
  const o = computeSetupOutcome(setup(0), candles, true, false, DEFAULT_HISTORICAL_CONFIG)
  assert.ok(o)
  const h = o.horizons['3']
  // entry 100; window T+1..T+3: lows 89.1, 94.05, 108.9 ; highs 90.9, 95.95, 111.1
  // MAE: 89.1 -> (89.1-100)/100 = -10.9 ; MFE: 111.1 -> +11.1
  assert.ok(h.mfePercent! > 10)
  assert.ok(h.maePercent! < -10)
})

test('outcomes: bearish direction flips favorable/ adverse excursions', () => {
  const candles = series([100, 90, 95, 80], { hasHighLow: true })
  const o = computeSetupOutcome(setup(0, 'bearish'), candles, true, false, DEFAULT_HISTORICAL_CONFIG)
  assert.ok(o)
  const h = o.horizons['3']
  // entry 100; window T+1..T+3 lows 89.1/94.05/79.2 -> MFE (100-79.2)=20.8;
  // highs 90.9/95.95/80.8 -> max adverse (95.95-100) = -4.05 (never above entry)
  assert.ok(h.mfePercent! > 15, `mfe ${h.mfePercent}`)
  assert.ok(h.maePercent! < 0 && h.maePercent! > -10, `mae ${h.maePercent}`)
})

test('outcomes: sessions to threshold uses first close beyond threshold', () => {
  const candles = series([100, 100.4, 100.6, 101.2])
  const o = computeSetupOutcome(setup(0), candles, false, false, DEFAULT_HISTORICAL_CONFIG)
  assert.ok(o)
  // thresholds 0.5% and 1.0%
  const pos = o.horizons['3'].sessionsToFirstPositiveThreshold
  assert.deepEqual(pos, [2, 3]) // 100.6 > +0.5% at bar2; 101.2 > +1% at bar3
  const neg = o.horizons['3'].sessionsToFirstNegativeThreshold
  assert.deepEqual(neg, [null, null])
})

test('outcomes: breakout metadata -> follow-through, failure and retest flags', () => {
  const candles = series([100, 101, 102, 101, 100, 99])
  const o = computeSetupOutcome(
    setup(0, 'bullish', {
      pattern: { family: 'breakout', type: 'breakout', name: 'range-breakout', status: 'confirmed', confidence: 70, invalidationLevel: 100, targetLevel: 110 },
      metadata: { failureDistance: 2, retestHeld: true },
    }),
    candles,
    false,
    false,
    DEFAULT_HISTORICAL_CONFIG,
  )
  assert.ok(o && o.breakout)
  assert.equal(o.breakout.failed, true)
  assert.equal(o.breakout.retestHeld, true)
  assert.ok(o.breakout.barsToFollowThrough != null)
})

test('outcomes: neutral setups have no favorable side but still compute returns', () => {
  const candles = series([100, 101])
  const o = computeSetupOutcome(setup(0, 'bullish'), candles, false, false, DEFAULT_HISTORICAL_CONFIG)
  assert.ok(o)
  assert.equal(o.horizons['1'].forwardReturn, 1)
})

test('outcomes: invalid entry (non-positive close) yields null outcome', () => {
  const candles = series([0, 1])
  assert.equal(computeSetupOutcome(setup(0), candles, false, false, DEFAULT_HISTORICAL_CONFIG), null)
})

test('outcomes: time-to-threshold arrays preserve config order', () => {
  const candles = series([100, 110])
  const o = computeSetupOutcome(setup(0), candles, false, false, DEFAULT_HISTORICAL_CONFIG)
  assert.ok(o)
  assert.equal(o.horizons['1'].sessionsToFirstPositiveThreshold.length, DEFAULT_HISTORICAL_CONFIG.timeToThresholdPcts.length)
})