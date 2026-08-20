import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateHistory } from '../validationEngine'
import { seriesFromCandles } from '../validationEngine'
import { HISTORICAL_METHODOLOGY_VERSION, DEFAULT_HISTORICAL_CONFIG } from '../config'
import { generateFixtureCandles, shortSeries, closeOnlyFrom } from './fixtures'
import { scanHistory } from '../scanner'
import { clusterEvents } from '../dedup'

const capsCloseOnly = { hasHighLow: false, hasVolume: false }

test('2D: short series -> available=false with insufficient-coverage reason', () => {
  const candles = shortSeries(52)
  const ctx = validateHistory(seriesFromCandles('NIFTY', 'weekly', candles, capsCloseOnly))
  assert.equal(ctx.available, false)
  assert.match(ctx.reason ?? '', /Insufficient historical coverage/)
  assert.equal(ctx.results.length, 0)
  assert.equal(ctx.dataQuality.barsAvailable, 52)
})

test('2D: unknown timeframe -> available=false with a warning, not a crash', () => {
  const candles = shortSeries(200)
  const ctx = validateHistory(seriesFromCandles('X', 'weird-tf', candles, capsCloseOnly))
  assert.equal(ctx.available, false)
  assert.ok(ctx.dataQuality.warnings.some((w) => w.includes("Timeframe 'weird-tf'")) || ctx.reason)
})

test('2D: fixture series produces confirmed setups and a validated result', () => {
  const { candles, trendStart } = generateFixtureCandles({ bars: 240, closeOnly: true })
  assert.ok(trendStart >= 120, 'fixture range phase must satisfy minimumHistoricalBars')

  const ctx = validateHistory(seriesFromCandles('TEST', 'weekly', candles, capsCloseOnly))
  assert.equal(ctx.available, true)
  assert.ok(ctx.results.length >= 1, 'at least one pattern group')
  const group = ctx.results[0]
  assert.ok(group.sampleSize >= 1)
  assert.equal(group.methodology.version, HISTORICAL_METHODOLOGY_VERSION)
  assert.deepEqual(group.methodology.horizons, [1, 3, 5, 10, 20])
})

test('2D: persistent 8+ bar breakout collapses into a single event cluster', () => {
  const { candles } = generateFixtureCandles({ bars: 240, closeOnly: true })
  const scan = scanHistory('TEST', candles, 'weekly', DEFAULT_HISTORICAL_CONFIG)
  const breakoutSetups = scan.setups.filter((s) => s.pattern?.family === 'breakout')
  assert.ok(breakoutSetups.length >= 8, `expected persistent breakout setups, got ${breakoutSetups.length}`)
  const { clusters } = clusterEvents(scan.setups, DEFAULT_HISTORICAL_CONFIG)
  const breakoutClusters = clusters.filter((c) => c.key.includes('breakout'))
  assert.ok(breakoutClusters.length < breakoutSetups.length, 'clusters must be fewer than raw setups')
  assert.ok(breakoutClusters.length >= 1, 'at least one breakout cluster')
  for (const c of breakoutClusters) {
    assert.ok(c.count >= 1)
    assert.ok(c.setupIds.length === c.count)
  }
})

test('2D: determinism — two identical runs produce identical statistics', () => {
  const { candles } = generateFixtureCandles({ bars: 240, closeOnly: true, seed: 123 })
  const a = validateHistory(seriesFromCandles('TEST', 'weekly', candles, capsCloseOnly))
  const b = validateHistory(seriesFromCandles('TEST', 'weekly', candles, capsCloseOnly))
  assert.deepEqual(a.results, b.results)
  assert.deepEqual(a.dataQuality.capabilities, b.dataQuality.capabilities)
})

test('2D: query path returns currentSetup metadata', () => {
  const { candles } = generateFixtureCandles({ bars: 240, closeOnly: true })
  const ctx = validateHistory(seriesFromCandles('TEST', 'weekly', candles, capsCloseOnly), {
    query: { pattern: 'range-breakout', direction: 'bullish' },
  })
  assert.ok(ctx.currentSetup, 'currentSetup present in query mode')
  assert.equal(typeof ctx.currentSetup!.similarHistoricalEvents, 'number')
  assert.equal(typeof ctx.currentSetup!.matchesConsidered, 'number')
  assert.equal(ctx.currentSetup!.similarityThreshold, 0.6)
  if (ctx.available) {
    for (const r of ctx.results) {
      assert.ok(r.sampleSize >= 1)
      assert.ok(r.sampleSize <= ctx.currentSetup!.similarHistoricalEvents)
    }
  }
})

test('2D: close-only feed keeps MFE/MAE null (honest availability)', () => {
  const { candles } = generateFixtureCandles({ bars: 240, closeOnly: true })
  const ctx = validateHistory(seriesFromCandles('TEST', 'weekly', candles, capsCloseOnly))
  if (!ctx.available) return
  const group = ctx.results[0]
  const h5 = group.outcomes['5']
  assert.ok(h5)
  if (h5.count > 0) {
    assert.equal(h5.mfe, undefined, 'MFE must be unavailable on a close-only feed')
    assert.equal(h5.mae, undefined, 'MAE must be unavailable on a close-only feed')
  }
})

test('2D: closeOnlyFrom helper produces a close-only series', () => {
  const f = generateFixtureCandles({ bars: 200, closeOnly: true })
  const only = closeOnlyFrom(f)
  for (const c of only) {
    assert.equal(c.high, c.close)
    assert.equal(c.low, c.close)
  }
})