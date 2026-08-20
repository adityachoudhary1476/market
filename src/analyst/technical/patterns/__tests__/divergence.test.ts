import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectDivergences } from '../detectors/divergenceDetector'
import { buildTechnicalContext } from '../../technicalContext'
import type { Candle } from '../../types'
import { closeOnlySeries } from './fixtures'

const DAY = 24 * 60 * 60 * 1000

/**
 * Build a series with two swing lows where price makes a lower low but RSI
 * makes a higher low — a classic bullish regular divergence.
 */
function bullishDivergenceSeries(): Candle[] {
  const base = Date.UTC(2025, 0, 1)
  const out: Candle[] = []
  // down-move to first low (~80)
  for (let i = 0; i < 15; i++) out.push({ timestamp: base + i * DAY, open: 110 - i, high: 111 - i, low: 109 - i, close: 110 - i, volume: 1_000_000 })
  out.push({ timestamp: base + out.length * DAY, open: 96, high: 98, low: 88, close: 90, volume: 1_200_000 })
  // rally
  for (let i = 0; i < 12; i++) out.push({ timestamp: base + out.length * DAY, open: 90 + i, high: 91 + i, low: 89 + i, close: 90 + i + 1, volume: 900_000 })
  // down to a LOWER low (~86) but with smaller momentum (shallow decline)
  for (let i = 0; i < 6; i++) out.push({ timestamp: base + out.length * DAY, open: 103 - i, high: 104 - i, low: 98 - i, close: 102 - i, volume: 800_000 })
  out.push({ timestamp: base + out.length * DAY, open: 96, high: 98, low: 86, close: 88, volume: 700_000 })
  // turn up
  for (let i = 0; i < 4; i++) out.push({ timestamp: base + out.length * DAY, open: 88 + i, high: 90 + i, low: 87 + i, close: 89 + i, volume: 1_100_000 })
  return out
}

test('detects a bullish regular divergence on constructed data', () => {
  const candles = bullishDivergenceSeries()
  const tech = buildTechnicalContext('TEST', candles, { timeframe: 'daily' })
  const divs = detectDivergences(candles, tech, { lookback: 2 })
  const bull = divs.find((d) => d.direction === 'bullish')
  assert.ok(bull, 'a bullish divergence should be present')
  assert.ok(bull!.evidence.length >= 2)
  assert.ok(bull!.pivots.price1.price > bull!.pivots.price2.price)
})

test('returns empty on close-only data (no pivots without H/L)', () => {
  const candles = closeOnlySeries(60)
  const tech = buildTechnicalContext('CLOSE', candles, { timeframe: 'daily' })
  const divs = detectDivergences(candles, tech)
  assert.equal(divs.length, 0)
})

test('returns empty on insufficient data', () => {
  const candles = closeOnlySeries(20)
  const tech = buildTechnicalContext('SHORT', candles, { timeframe: 'daily' })
  assert.equal(detectDivergences(candles, tech).length, 0)
})

test('every divergence has an oscillator and pivots', () => {
  const candles = bullishDivergenceSeries()
  const tech = buildTechnicalContext('TEST', candles, { timeframe: 'daily' })
  const divs = detectDivergences(candles, tech, { lookback: 2 })
  for (const d of divs) {
    assert.ok(d.oscillator)
    assert.ok(d.pivots.price1 && d.pivots.price2)
    assert.ok(Number.isFinite(d.pivots.osc1) && Number.isFinite(d.pivots.osc2))
  }
})
