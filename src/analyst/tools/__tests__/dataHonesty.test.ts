import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultAnalystToolRegistry } from '../registry'
import { createDefaultToolContext } from '../context'
import { createDefaultToolContext as freshContext } from '../context'

const FIXED_NOW = 1_720_000_000_000

function run(tool: string, input: Record<string, unknown> = {}) {
  const registry = createDefaultAnalystToolRegistry()
  return registry.execute(tool, input, createDefaultToolContext(FIXED_NOW))
}

test('honesty: every tool result is JSON-serializable and numbers are finite', () => {
  const registry = createDefaultAnalystToolRegistry()
  const context = freshContext(FIXED_NOW)
  const calls: [string, Record<string, unknown>][] = [
    ['getMarketSnapshot', {}],
    ['getMarketBreadth', {}],
    ['analyzeSectors', { sort: 'alpha' }],
    ['getMarketMovers', { category: 'active' }],
    ['getMacroContext', {}],
    ['getTechnicalAnalysis', { instrument: 'nifty-50' }],
    ['detectPatterns', { instrument: 'nifty-50' }],
    ['detectDivergences', { instrument: 'nifty-50' }],
    ['detectBreakouts', { instrument: 'nifty-50' }],
    ['getConfluence', { instrument: 'nifty-50' }],
    ['getHistoricalValidation', { instrument: 'nifty-50' }],
    ['compareInstruments', { instruments: ['nifty-50', 'sensex'] }],
  ]
  for (const [name, input] of calls) {
    const r = registry.execute(name, input, context)
    assert.equal(r.ok, true, name)
    const roundtrip = JSON.parse(JSON.stringify(r))
    assert.deepEqual(roundtrip, r, name)
    const walk = (value: unknown): void => {
      if (typeof value === 'number') {
        assert.ok(Number.isFinite(value), `${name}: non-finite number ${value}`)
      } else if (Array.isArray(value)) {
        value.forEach(walk)
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(walk)
      }
    }
    walk(r)
  }
})

test('honesty: provenance source is always one of the known engine labels', () => {
  const registry = createDefaultAnalystToolRegistry()
  const context = freshContext(FIXED_NOW)
  const sources = new Set<string>()
  for (const tool of registry.list()) {
    const r = registry.execute(tool.name, tool.name === 'compareInstruments' ? { instruments: ['nifty-50', 'sensex'] } : tool.name.includes('instrument') ? { instrument: 'nifty-50' } : {}, context)
    sources.add(r.metadata.source)
  }
  assert.deepEqual([...sources].sort(), ['confluence-engine', 'historical-validation', 'market-data', 'technical-engine', 'web-search'])
})

test('honesty: no BUY/SELL labels anywhere in evidence', () => {
  const registry = createDefaultAnalystToolRegistry()
  const context = freshContext(FIXED_NOW)
  const r = registry.execute('getTechnicalAnalysis', { instrument: 'nifty-50' }, context)
  const serialized = JSON.stringify(r)
  assert.ok(!serialized.includes('BUY'))
  assert.ok(!serialized.includes('SELL'))
  assert.ok(!serialized.includes('buy now'))
  assert.ok(!serialized.includes('sell now'))
})

test('honesty: engine warnings are surfaced in tool metadata', () => {
  const r = run('getTechnicalAnalysis', { instrument: 'nifty-50' })
  assert.ok(Array.isArray(r.metadata.warnings))
  const data = r.data as { dataQuality: { warnings: string[] } }
  assert.deepEqual(r.metadata.warnings, data.dataQuality.warnings)
})

test('honesty: stocks never get fabricated series — every series tool says available:false', () => {
  for (const tool of ['getTechnicalAnalysis', 'detectPatterns', 'detectDivergences', 'detectBreakouts', 'getConfluence']) {
    const r = run(tool, { instrument: 'ITC' })
    assert.equal(r.ok, true, tool)
    assert.equal(r.metadata.available, false, `${tool} must not fabricate`)
    assert.equal(r.data, null, `${tool} must return null data`)
    assert.ok(r.metadata.warnings.length > 0, `${tool} should explain why`)
  }
})

test('honesty: errors are typed, not exceptions', () => {
  const registry = createDefaultAnalystToolRegistry()
  const context = freshContext(FIXED_NOW)
  let r: ReturnType<typeof registry.execute>
  r = registry.execute('getTechnicalAnalysis', { instrument: 'wat' }, context)
  assert.equal(r.error?.code, 'UNSUPPORTED_INSTRUMENT')
  r = registry.execute('nope', {}, context)
  assert.equal(r.error?.code, 'UNKNOWN_TOOL')
  r = registry.execute('getTechnicalAnalysis', { instrument: 'nifty-50', timeframe: 'minute' }, context)
  assert.equal(r.error?.code, 'UNSUPPORTED_TIMEFRAME')
  // Every error result has a serializable error object with a message.
  for (const res of [r]) {
    assert.equal(typeof res.error?.message, 'string')
    assert.ok(res.error!.message.length > 0)
  }
})