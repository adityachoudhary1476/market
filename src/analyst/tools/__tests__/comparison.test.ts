import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultAnalystToolRegistry } from '../registry'
import { createDefaultToolContext } from '../context'

const FIXED_NOW = 1_720_000_000_000

function run(tool: string, input: Record<string, unknown> = {}) {
  const registry = createDefaultAnalystToolRegistry()
  return registry.execute(tool, input, createDefaultToolContext(FIXED_NOW))
}

test('compareInstruments: 2-5 instruments compare side by side', () => {
  const r = run('compareInstruments', { instruments: ['nifty-50', 'sensex', 'bank-nifty', 'nifty-it'] })
  assert.equal(r.ok, true)
  assert.equal(r.metadata.available, true)
  const data = r.data as {
    instruments: { id: string; available: boolean; price: number | null }[]
    summary: { bestDailyMove: string | null; strongestTrend: string | null }
  }
  assert.equal(data.instruments.length, 4)
  assert.ok(data.instruments.every((i) => i.available))
  assert.ok(data.instruments.every((i) => i.price !== null))
  assert.ok(data.summary.bestDailyMove)
  assert.ok(data.summary.strongestTrend)
})

test('compareInstruments: summary picks the best/worst daily mover from the data', () => {
  const r = run('compareInstruments', { instruments: ['nifty-50', 'sensex'] })
  const data = r.data as {
    instruments: { id: string; changePct: number | null }[]
    summary: { bestDailyMove: string; worstDailyMove: string }
  }
  const changes = Object.fromEntries(data.instruments.map((i) => [i.id, i.changePct ?? -Infinity]))
  assert.equal(data.summary.bestDailyMove, Object.entries(changes).sort((a, b) => b[1] - a[1])[0][0])
  assert.equal(data.summary.worstDailyMove, Object.entries(changes).sort((a, b) => a[1] - b[1])[0][0])
})

test('compareInstruments: stocks report honestly unavailable technical columns', () => {
  const r = run('compareInstruments', { instruments: ['nifty-50', 'RELIANCE'] })
  assert.equal(r.ok, true)
  const data = r.data as {
    instruments: { id: string; available: boolean; trend: string | null; price: number | null }[]
    summary: { strongestTrend: string | null }
  }
  const nifty = data.instruments.find((i) => i.id === 'nifty-50')!
  const reliance = data.instruments.find((i) => i.id === 'RELIANCE')!
  assert.equal(nifty.available, true)
  assert.equal(reliance.available, false)
  assert.equal(reliance.trend, null)
  assert.ok(reliance.price !== null, 'quote price is still available for stocks')
  assert.equal(data.summary.strongestTrend, 'nifty-50')
  assert.ok(r.metadata.warnings.some((w) => w.includes('RELIANCE')))
})

test('compareInstruments: too few instruments is INVALID_INPUT', () => {
  const r = run('compareInstruments', { instruments: ['nifty-50'] })
  assert.equal(r.ok, false)
  assert.equal(r.error?.code, 'INVALID_INPUT')
})

test('compareInstruments: unknown instrument in the list is UNSUPPORTED_INSTRUMENT', () => {
  const r = run('compareInstruments', { instruments: ['nifty-50', 'FAKE-THING'] })
  assert.equal(r.ok, false)
  assert.equal(r.error?.code, 'UNSUPPORTED_INSTRUMENT')
})

test('compareInstruments: non-array instruments input is INVALID_INPUT', () => {
  const r = run('compareInstruments', { instruments: 'nifty-50' })
  assert.equal(r.ok, false)
  assert.equal(r.error?.code, 'INVALID_INPUT')
})