import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTechnicalContext } from '../../technicalContext'
import { buildPatternDetectionContext } from '../patternContext'
import { detectCandlestickPatterns } from '../detectors/candlestickDetector'
import {
  noVolumeSeries,
  flatMarket,
  extremeVolatility,
  duplicateTimestamps,
  malformedOHLC,
  closeOnlySeries,
  uptrend,
} from './fixtures'

// ---------------------------------------------------------------------------
// §26 — Data-capability and edge-case behaviour.
// ---------------------------------------------------------------------------

test('missing volume: everything works, volume-confirmed breakouts are honest', () => {
  const candles = noVolumeSeries(60)
  const ctx = buildTechnicalContext('NOVOL', candles, { timeframe: 'daily' })
  assert.equal(ctx.available, true)
  assert.equal(ctx.dataQuality.hasVolume, false)
  assert.ok(ctx.dataQuality.warnings.some((w) => w.includes('Volume')))
  const patterns = buildPatternDetectionContext('NOVOL', 'daily', candles, ctx)
  for (const b of patterns.breakouts) {
    if (b.volumeConfirmation != null) {
      assert.fail('volumeConfirmation must be null without volume data')
    }
  }
})

test('flat market: no NaN, no fake patterns, engine stays available', () => {
  const candles = flatMarket(60)
  const ctx = buildTechnicalContext('FLAT', candles, { timeframe: 'daily' })
  assert.equal(ctx.available, true)
  const patterns = buildPatternDetectionContext('FLAT', 'daily', candles, ctx)
  for (const p of patterns.all) {
    assert.ok(Number.isFinite(p.confidence))
    assert.ok(Number.isFinite(p.strength))
  }
  assert.equal(patterns.summary.total, patterns.all.length)
})

test('extreme volatility: no NaN in any pattern metric', () => {
  const candles = extremeVolatility(60)
  const ctx = buildTechnicalContext('VOL', candles, { timeframe: 'daily' })
  assert.equal(ctx.available, true)
  const patterns = buildPatternDetectionContext('VOL', 'daily', candles, ctx)
  for (const p of patterns.all) {
    assert.ok(Number.isFinite(p.confidence), `${p.name} confidence must be finite`)
    assert.ok(Number.isFinite(p.strength), `${p.name} strength must be finite`)
    if (p.invalidationLevel != null) assert.ok(Number.isFinite(p.invalidationLevel))
  }
})

test('duplicate timestamps → technical context unavailable, no patterns', () => {
  const ctx = buildTechnicalContext('DUP', duplicateTimestamps(), { timeframe: 'daily' })
  assert.equal(ctx.available, false)
  assert.equal(ctx.patterns, undefined)
})

test('malformed OHLC → technical context unavailable, no patterns', () => {
  const ctx = buildTechnicalContext('BAD', malformedOHLC(), { timeframe: 'daily' })
  assert.equal(ctx.available, false)
})

test('close-only: candlestick detector returns empty; context reports unavailable detector', () => {
  const candles = closeOnlySeries(60)
  const ctx = buildTechnicalContext('CLOSE', candles, { timeframe: 'daily' })
  const patterns = buildPatternDetectionContext('CLOSE', 'daily', candles, ctx)
  assert.equal(detectCandlestickPatterns(candles).length, 0)
  assert.ok(patterns.dataQuality.unavailableDetectors.includes('candlestick'))
})

test('insufficient history: context unavailable under 10 bars', () => {
  const candles = uptrend(9)
  const ctx = buildTechnicalContext('SHORT', candles, { timeframe: 'daily' })
  const patterns = buildPatternDetectionContext('SHORT', 'daily', candles, ctx)
  assert.equal(patterns.available, false)
})

test('activePatterns and recentPatterns are populated from the full set', () => {
  const candles = uptrend(80)
  const ctx = buildTechnicalContext('ACT', candles, { timeframe: 'daily' })
  const patterns = buildPatternDetectionContext('ACT', 'daily', candles, ctx)
  assert.ok(Array.isArray(patterns.activePatterns))
  assert.ok(Array.isArray(patterns.recentPatterns))
  assert.ok(patterns.recentPatterns.length <= patterns.all.length)
})

test('pattern lifecycle counts all seven states without NaN', () => {
  const candles = uptrend(80)
  const ctx = buildTechnicalContext('LIFE', candles, { timeframe: 'daily' })
  const patterns = buildPatternDetectionContext('LIFE', 'daily', candles, ctx)
  const lc = patterns.summary.lifecycle
  const states = ['forming', 'confirmed', 'mature', 'failed', 'complete', 'invalidated', 'unavailable'] as const
  let total = 0
  for (const s of states) {
    assert.ok(Number.isInteger(lc[s]), `${s} must be an integer`)
    total += lc[s]
  }
  assert.equal(total, patterns.all.length)
})