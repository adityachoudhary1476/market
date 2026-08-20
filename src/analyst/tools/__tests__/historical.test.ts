import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultAnalystToolRegistry } from '../registry'
import { createDefaultToolContext } from '../context'
import { generateFixtureCandles } from '../../technical/historical/__tests__/fixtures'
import { validateHistory, localHistoricalDataProvider } from '../../technical/historical'
import type { HistoricalSeries } from '../../technical/historical'
import type { ToolContext } from '../types'

const FIXED_NOW = 1_720_000_000_000

function fixtureSeries(instrument = 'nifty-50', bars = 260, withVolume = true): HistoricalSeries {
  const f = generateFixtureCandles({ bars, withVolume, closeOnly: true })
  return {
    instrument,
    timeframe: 'weekly',
    candles: f.candles,
    capabilities: {
      hasHighLow: f.candles.some((c) => c.high > c.low),
      hasVolume: f.candles.some((c) => c.volume != null && c.volume > 0),
    },
    source: 'synthetic-demo',
    warnings: [],
  }
}

/** Default context, but with a long fixture series injected for the historical source. */
function contextWithFixture(bars = 260): ToolContext {
  const base = createDefaultToolContext(FIXED_NOW)
  const series = fixtureSeries('nifty-50', bars)
  return {
    now: base.now,
    data: {
      ...base.data,
      historical: (instrument, timeframe) => {
        if (instrument === 'nifty-50') return validateHistory(series)
        return validateHistory(localHistoricalDataProvider.getHistory(instrument, timeframe))
      },
    },
  }
}

function runWith(tool: string, input: Record<string, unknown>, context: ToolContext) {
  const registry = createDefaultAnalystToolRegistry()
  return registry.execute(tool, input, context)
}

test('getHistoricalValidation: short demo feed is honestly unavailable', () => {
  const registry = createDefaultAnalystToolRegistry()
  const context = createDefaultToolContext(FIXED_NOW)
  const r = registry.execute('getHistoricalValidation', { instrument: 'nifty-50' }, context)
  assert.equal(r.ok, true)
  assert.equal(r.metadata.available, false)
  assert.equal(r.metadata.source, 'historical-validation')
  const data = r.data as { available: boolean; reason?: string; results: unknown[]; dataQuality: { warnings: string[] } }
  assert.equal(data.available, false)
  assert.ok(data.reason)
  assert.deepEqual(data.results, [])
  assert.ok(r.metadata.warnings.length > 0)
  const sourceWarnings = data.dataQuality.warnings.join(' ')
  assert.ok(sourceWarnings.toLowerCase().includes('demo') || sourceWarnings.toLowerCase().includes('synthetic'))
})

test('getHistoricalValidation: long fixture series produces real statistics', () => {
  const context = contextWithFixture(260)
  const r = runWith('getHistoricalValidation', { instrument: 'nifty-50' }, context)
  assert.equal(r.ok, true)
  assert.equal(r.metadata.available, true)
  const data = r.data as {
    available: boolean
    results: { setupDescription: string; sampleSize: number; outcomes: Record<string, { count: number; winRatePct: number | null }> }[]
    dataQuality: { barsAvailable: number }
  }
  assert.equal(data.available, true)
  assert.ok(data.results.length > 0)
  assert.ok(data.results.every((r) => r.sampleSize > 0))
  assert.ok(data.dataQuality.barsAvailable >= 260)
  const firstOutcome = Object.values(data.results[0].outcomes)[0]
  assert.ok(firstOutcome)
  assert.equal(typeof firstOutcome.count, 'number')
  assert.ok(firstOutcome.winRatePct === null || (firstOutcome.winRatePct >= 0 && firstOutcome.winRatePct <= 100))
})

test('getHistoricalValidation: methodology and currentSetup are present when available', () => {
  const context = contextWithFixture(260)
  const r = runWith('getHistoricalValidation', { instrument: 'nifty-50' }, context)
  const data = r.data as {
    currentSetup: { setupId: string; similarHistoricalEvents: number } | null
    methodology: { version: string; horizons: number[] }
  }
  assert.ok(data.methodology.version.startsWith('2D'))
  assert.ok(data.methodology.horizons.length > 0)
  if (data.currentSetup) {
    assert.ok(data.currentSetup.similarHistoricalEvents >= 0)
    assert.equal(typeof data.currentSetup.setupId, 'string')
  }
})

test('getHistoricalValidation: stock instrument is honestly unavailable', () => {
  const registry = createDefaultAnalystToolRegistry()
  const context = createDefaultToolContext(FIXED_NOW)
  const r = registry.execute('getHistoricalValidation', { instrument: 'HDFCBANK' }, context)
  assert.equal(r.ok, true)
  assert.equal(r.metadata.available, false)
})

test('getHistoricalValidation: unknown instrument is UNSUPPORTED_INSTRUMENT', () => {
  const registry = createDefaultAnalystToolRegistry()
  const context = createDefaultToolContext(FIXED_NOW)
  const r = registry.execute('getHistoricalValidation', { instrument: 'NOPE' }, context)
  assert.equal(r.ok, false)
  assert.equal(r.error?.code, 'UNSUPPORTED_INSTRUMENT')
})