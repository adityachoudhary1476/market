import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPatternDetectionContext } from '../patternContext'
import { buildTechnicalContext } from '../../technicalContext'
import {
  doubleTop,
  doubleBottom,
  bullishEngulfing,
  resistanceBreakout,
  closeOnlySeries,
} from './fixtures'

test('orchestrates all detectors and produces a summary', () => {
  const candles = doubleTop()
  const tech = buildTechnicalContext('TEST', candles, { timeframe: 'daily' })
  const ctx = buildPatternDetectionContext('TEST', 'daily', candles, tech, {
    chart: { lookback: 2, minSeparation: 4 },
  })
  assert.equal(ctx.available, true)
  assert.ok(ctx.all.length > 0)
  assert.equal(ctx.summary.total, ctx.all.length)
  assert.ok(ctx.summary.byFamily.chart.count >= 1)
  assert.ok(ctx.signals.length === ctx.all.length)
})

test('maps patterns to TechnicalSignal with evidence', () => {
  const candles = bullishEngulfing()
  const tech = buildTechnicalContext('TEST', candles, { timeframe: 'daily' })
  const ctx = buildPatternDetectionContext('TEST', 'daily', candles, tech)
  for (const s of ctx.signals) {
    assert.ok(s.evidence.length > 0)
    assert.ok(['bullish', 'bearish', 'neutral'].includes(s.direction))
    assert.ok(s.strength >= 0 && s.strength <= 100)
    assert.ok(s.confidence >= 0 && s.confidence <= 100)
    assert.ok(s.metadata?.patternName)
  }
})

test('breakouts are categorized correctly and include penetration', () => {
  const candles = resistanceBreakout()
  const tech = buildTechnicalContext('TEST', candles, { timeframe: 'daily' })
  const ctx = buildPatternDetectionContext('TEST', 'daily', candles, tech)
  for (const b of ctx.breakouts) {
    assert.ok(Number.isFinite(b.penetrationPercent))
    assert.ok(Number.isFinite(b.level))
  }
})

test('honest on close-only data: candlesticks empty, chart/breakouts may still run with warnings', () => {
  const candles = closeOnlySeries(60)
  const tech = buildTechnicalContext('CLOSE', candles, { timeframe: 'daily' })
  const ctx = buildPatternDetectionContext('CLOSE', 'daily', candles, tech)
  assert.equal(ctx.candlesticks.length, 0)
  assert.ok(ctx.dataQuality.warnings.some((w) => w.includes('Close-only')))
})

test('unavailable with too few candles', () => {
  const candles = closeOnlySeries(5)
  const tech = buildTechnicalContext('SHORT', candles, { timeframe: 'daily' })
  const ctx = buildPatternDetectionContext('SHORT', 'daily', candles, tech)
  assert.equal(ctx.available, false)
  assert.equal(ctx.all.length, 0)
})

test('integration: double bottom produces a bullish chart pattern and signals', () => {
  const candles = doubleBottom()
  const tech = buildTechnicalContext('TEST', candles, { timeframe: 'daily' })
  const ctx = buildPatternDetectionContext('TEST', 'daily', candles, tech, {
    chart: { lookback: 2, minSeparation: 4 },
  })
  assert.ok(ctx.chartPatterns.some((p) => p.name === 'double-bottom'))
  assert.ok(ctx.summary.byFamily.chart.bullish >= 1)
})
