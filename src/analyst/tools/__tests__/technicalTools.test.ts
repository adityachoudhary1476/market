import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultAnalystToolRegistry } from '../registry'
import { createDefaultToolContext } from '../context'

const FIXED_NOW = 1_720_000_000_000

function run(tool: string, input: Record<string, unknown> = {}) {
  const registry = createDefaultAnalystToolRegistry()
  return registry.execute(tool, input, createDefaultToolContext(FIXED_NOW))
}

test('getTechnicalAnalysis: index instrument is fully available', () => {
  const r = run('getTechnicalAnalysis', { instrument: 'nifty-50' })
  assert.equal(r.ok, true)
  assert.equal(r.metadata.available, true)
  assert.equal(r.metadata.source, 'technical-engine')
  const data = r.data as {
    instrument: string
    timeframe: string
    price: { current: number }
    trend: { overall: { direction: string; strength: number } }
    supportResistance: { levels: unknown[] }
  }
  assert.equal(data.instrument, 'nifty-50')
  assert.equal(data.timeframe, 'daily')
  assert.ok(data.price.current > 0)
  assert.ok(['bullish', 'bearish', 'neutral', 'transitioning', 'insufficient-data'].includes(data.trend.overall.direction))
  assert.ok(data.trend.overall.strength >= 0 && data.trend.overall.strength <= 100)
  assert.ok(Array.isArray(data.supportResistance.levels))
})

test('getTechnicalAnalysis: app timeframe maps to technical label', () => {
  const r = run('getTechnicalAnalysis', { instrument: 'sensex', timeframe: '3M' })
  assert.equal(r.ok, true)
  const data = r.data as { timeframe: string }
  assert.equal(data.timeframe, 'daily')
})

test('getTechnicalAnalysis: technical label accepted directly', () => {
  const r = run('getTechnicalAnalysis', { instrument: 'bank-nifty', timeframe: 'weekly' })
  assert.equal(r.ok, true)
  const data = r.data as { timeframe: string }
  assert.equal(data.timeframe, 'weekly')
})

test('getTechnicalAnalysis: stock without a series is honestly unavailable', () => {
  const r = run('getTechnicalAnalysis', { instrument: 'RELIANCE' })
  assert.equal(r.ok, true)
  assert.equal(r.metadata.available, false)
  assert.equal(r.data, null)
  assert.ok(r.metadata.warnings.length > 0)
})

test('getTechnicalAnalysis: unknown instrument is UNSUPPORTED_INSTRUMENT', () => {
  const r = run('getTechnicalAnalysis', { instrument: 'DEFINITELY-NOT-A-STOCK' })
  assert.equal(r.ok, false)
  assert.equal(r.error?.code, 'UNSUPPORTED_INSTRUMENT')
})

test('getTechnicalAnalysis: invalid timeframe is UNSUPPORTED_TIMEFRAME', () => {
  const r = run('getTechnicalAnalysis', { instrument: 'nifty-50', timeframe: 'hourly' })
  assert.equal(r.ok, false)
  assert.equal(r.error?.code, 'UNSUPPORTED_TIMEFRAME')
})

test('getTechnicalAnalysis: missing instrument is INVALID_INPUT', () => {
  const r = run('getTechnicalAnalysis', {})
  assert.equal(r.ok, false)
  assert.equal(r.error?.code, 'UNSUPPORTED_INSTRUMENT')
})

test('getTechnicalAnalysis: levelLimit=0 omits levels', () => {
  const r = run('getTechnicalAnalysis', { instrument: 'nifty-50', levelLimit: 0 })
  assert.equal(r.ok, true)
  const data = r.data as { supportResistance: { levels: unknown[] } }
  assert.equal(data.supportResistance.levels.length, 0)
})

test('detectPatterns: returns summary and ranked lists for an index', () => {
  const r = run('detectPatterns', { instrument: 'nifty-50' })
  assert.equal(r.ok, true)
  assert.equal(r.metadata.available, true)
  const data = r.data as {
    summary: { total: number; directionalBias: string }
    ranked: unknown[]
    dataQuality: { warnings: string[] }
  }
  assert.equal(typeof data.summary.total, 'number')
  assert.ok(data.summary.total >= 0)
  assert.ok(['bullish', 'bearish', 'neutral', 'insufficient-data'].includes(data.summary.directionalBias))
  assert.ok(Array.isArray(data.ranked))
  assert.ok(Array.isArray(data.dataQuality.warnings))
})

test('detectPatterns: stocks are honestly unavailable', () => {
  const r = run('detectPatterns', { instrument: 'TCS' })
  assert.equal(r.ok, true)
  assert.equal(r.metadata.available, false)
  assert.equal(r.data, null)
})

test('detectDivergences: returns divergences with pivots and oscillator breakdown', () => {
  const r = run('detectDivergences', { instrument: 'sensex' })
  assert.equal(r.ok, true)
  assert.equal(r.metadata.available, true)
  const data = r.data as {
    divergences: { oscillator: string; price1: { timestamp: number } }[]
    summary: { total: number; byDirection: { bullish: number; bearish: number } }
  }
  assert.equal(data.summary.total, data.divergences.length)
  assert.equal(data.summary.byDirection.bullish + data.summary.byDirection.bearish <= data.divergences.length, true)
  for (const d of data.divergences) {
    assert.equal(typeof d.oscillator, 'string')
    assert.equal(typeof d.price1.timestamp, 'number')
  }
})

test('detectBreakouts: breakouts have levels and summary counts', () => {
  const r = run('detectBreakouts', { instrument: 'nifty-it' })
  assert.equal(r.ok, true)
  assert.equal(r.metadata.available, true)
  const data = r.data as {
    breakouts: { level: number; movePct: number | null }[]
    summary: { total: number; breakouts: number; breakdowns: number }
  }
  assert.equal(data.summary.total, data.breakouts.length)
  assert.equal(data.summary.breakouts + data.summary.breakdowns, data.breakouts.length)
  for (const b of data.breakouts) {
    assert.equal(typeof b.level, 'number')
  }
})