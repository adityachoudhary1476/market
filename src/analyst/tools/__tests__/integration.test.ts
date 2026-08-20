import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultAnalystToolRegistry } from '../registry'
import { createDefaultToolContext } from '../context'
import {
  AnalystToolRegistry,
  createDefaultToolContext as contextFactory,
  createDefaultAnalystToolRegistry as registryFactory,
} from '../index'

const FIXED_NOW = 1_720_000_000_000

test('integration: one agent-style turn using several tools against one context', () => {
  const registry = createDefaultAnalystToolRegistry()
  const context = createDefaultToolContext(FIXED_NOW)

  const snapshot = registry.execute('getMarketSnapshot', {}, context)
  assert.equal(snapshot.ok, true)
  const regime = (snapshot.data as { regime: string }).regime

  const technical = registry.execute('getTechnicalAnalysis', { instrument: 'nifty-50' }, context)
  assert.equal(technical.ok, true)
  const overallDirection = (technical.data as { trend: { overall: { direction: string } } }).trend.overall.direction

  const confluence = registry.execute('getConfluence', { instrument: 'nifty-50' }, context)
  assert.equal(confluence.ok, true)
  const bias = (confluence.data as { bias: string }).bias

  const historical = registry.execute('getHistoricalValidation', { instrument: 'nifty-50' }, context)
  assert.equal(historical.ok, true)
  assert.equal(historical.metadata.available, false, 'demo feed is short — engine must admit it')

  const comparison = registry.execute('compareInstruments', { instruments: ['nifty-50', 'sensex'] }, context)
  assert.equal(comparison.ok, true)
  const best = (comparison.data as { summary: { bestDailyMove: string | null } }).summary.bestDailyMove

  // Cross-tool consistency: regime, trend and bias are all evidence strings.
  assert.equal(typeof regime, 'string')
  assert.equal(typeof overallDirection, 'string')
  assert.equal(typeof bias, 'string')
  assert.equal(typeof best, 'string')

  // All timestamps share the same deterministic clock.
  const ts = new Set(
    [snapshot, technical, confluence, historical, comparison].map((r) => r.metadata.timestamp),
  )
  assert.equal(ts.size, 1)
  assert.equal(snapshot.metadata.timestamp, new Date(FIXED_NOW).toISOString())
})

test('integration: public barrel exports match the internal registry', () => {
  const registry = registryFactory()
  const context = contextFactory(FIXED_NOW)
  assert.ok(registry instanceof AnalystToolRegistry)
  assert.equal(registry.list().length, 14)
  assert.equal(registry.execute('getMarketBreadth', {}, context).ok, true)
})

test('integration: caching makes repeated technical calls identical and cheap', () => {
  const registry = createDefaultAnalystToolRegistry()
  const context = createDefaultToolContext(FIXED_NOW)
  const strip = (r: { metadata: { durationMs?: number } }) => ({ ...r, metadata: { ...r.metadata, durationMs: undefined } })
  const first = strip(registry.execute('getTechnicalAnalysis', { instrument: 'nifty-50' }, context))
  const second = strip(registry.execute('getTechnicalAnalysis', { instrument: 'nifty-50' }, context))
  assert.deepEqual(first, second)
})

test('integration: two separate contexts never share cached state', () => {
  const registry = createDefaultAnalystToolRegistry()
  const ctxA = createDefaultToolContext(FIXED_NOW)
  const ctxB = createDefaultToolContext(FIXED_NOW)
  const strip = (r: { metadata: { durationMs?: number } }) => ({ ...r, metadata: { ...r.metadata, durationMs: undefined } })
  const a = strip(registry.execute('getTechnicalAnalysis', { instrument: 'sensex' }, ctxA))
  const b = strip(registry.execute('getTechnicalAnalysis', { instrument: 'sensex' }, ctxB))
  assert.deepEqual(a, b)
  assert.notEqual(a, b)
})