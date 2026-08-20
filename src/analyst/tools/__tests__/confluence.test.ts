import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultAnalystToolRegistry } from '../registry'
import { createDefaultToolContext } from '../context'

const FIXED_NOW = 1_720_000_000_000

function run(tool: string, input: Record<string, unknown> = {}) {
  const registry = createDefaultAnalystToolRegistry()
  return registry.execute(tool, input, createDefaultToolContext(FIXED_NOW))
}

test('getConfluence: index produces a full scorecard', () => {
  const r = run('getConfluence', { instrument: 'nifty-50' })
  assert.equal(r.ok, true)
  assert.equal(r.metadata.available, true)
  assert.equal(r.metadata.source, 'confluence-engine')
  const data = r.data as {
    bias: string
    score: { bullish: number; bearish: number; balance: number; confidence: number; quality: string }
    groups: unknown[]
    method: { version: string }
  }
  assert.ok(['bullish', 'bearish', 'balanced', 'insufficient-data'].includes(data.bias))
  assert.ok(data.score.bullish >= 0 && data.score.bullish <= 100)
  assert.ok(data.score.bearish >= 0 && data.score.bearish <= 100)
  assert.ok(data.score.balance >= -100 && data.score.balance <= 100)
  assert.ok(['high', 'medium', 'low', 'insufficient-data'].includes(data.score.quality))
  assert.ok(data.groups.length > 0)
  assert.ok(data.method.version.startsWith('2C'))
})

test('getConfluence: bias direction is consistent with the balance', () => {
  const r = run('getConfluence', { instrument: 'sensex' })
  const data = r.data as { bias: string; score: { balance: number } }
  if (data.bias === 'bullish') assert.ok(data.score.balance > 0)
  if (data.bias === 'bearish') assert.ok(data.score.balance < 0)
})

test('getConfluence: includeThesis=false drops the thesis but keeps the score', () => {
  const r = run('getConfluence', { instrument: 'bank-nifty', includeThesis: false })
  assert.equal(r.ok, true)
  const data = r.data as { thesis: unknown; score: unknown }
  assert.equal(data.thesis, null)
  assert.ok(data.score)
})

test('getConfluence: stock without a series is honestly unavailable', () => {
  const r = run('getConfluence', { instrument: 'WIPRO' })
  assert.equal(r.ok, true)
  assert.equal(r.metadata.available, false)
  assert.equal(r.data, null)
})

test('getConfluence: unknown instrument is UNSUPPORTED_INSTRUMENT', () => {
  const r = run('getConfluence', { instrument: 'FAKE' })
  assert.equal(r.ok, false)
  assert.equal(r.error?.code, 'UNSUPPORTED_INSTRUMENT')
})