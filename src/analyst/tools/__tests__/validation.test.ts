import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  APP_TIMEFRAMES,
  TECHNICAL_TIMEFRAMES,
  normalizeTimeframe,
  resolveInstrument,
  isKnownInstrument,
  requireTimeframe,
  requireInstrument,
} from '../validation'
import { ToolError } from '../errors'

test('validation: app timeframes normalize to technical labels', () => {
  for (const tf of APP_TIMEFRAMES) {
    const n = normalizeTimeframe(tf)
    assert.ok(n, `'${tf}' should normalize`)
    assert.ok(TECHNICAL_TIMEFRAMES.includes(n.technical), `${tf} → ${n.technical}`)
    assert.equal(n.app, tf)
  }
})

test('validation: technical labels normalize to app timeframes', () => {
  for (const tf of TECHNICAL_TIMEFRAMES) {
    const n = normalizeTimeframe(tf)
    assert.ok(n, `'${tf}' should normalize`)
    assert.ok(APP_TIMEFRAMES.includes(n.app), `${tf} → ${n.app}`)
    assert.equal(n.technical, tf)
  }
})

test('validation: unknown timeframe returns null and requireTimeframe throws', () => {
  assert.equal(normalizeTimeframe('hourly'), null)
  assert.equal(normalizeTimeframe(42), null)
  assert.equal(normalizeTimeframe(undefined), null)
  assert.throws(() => requireTimeframe('hourly'), (err: unknown) => {
    assert.ok(err instanceof ToolError)
    assert.equal(err.code, 'UNSUPPORTED_TIMEFRAME')
    return true
  })
})

test('validation: instrument resolution is case-insensitive', () => {
  const idx = resolveInstrument('NIFTY-50')
  assert.ok(idx)
  assert.equal(idx!.type, 'index')
  assert.equal(idx!.id, 'nifty-50')

  const stock = resolveInstrument('reliance')
  assert.ok(stock)
  assert.equal(stock!.type, 'stock')
  assert.equal(stock!.id, 'RELIANCE')
  assert.equal(stock!.displayName, 'Reliance Industries')
})

test('validation: unknown instrument rejected', () => {
  assert.equal(resolveInstrument('SOMETHING-NOT-REAL'), null)
  assert.equal(isKnownInstrument('nifty-50'), true)
  assert.equal(isKnownInstrument('nonsense'), false)
  assert.throws(() => requireInstrument('nonsense'), (err: unknown) => {
    assert.ok(err instanceof ToolError)
    assert.equal(err.code, 'UNSUPPORTED_INSTRUMENT')
    return true
  })
})

test('validation: non-string instrument queries rejected', () => {
  assert.equal(resolveInstrument(null), null)
  assert.equal(resolveInstrument(undefined), null)
  assert.equal(resolveInstrument(''), null)
  assert.equal(resolveInstrument('   '), null)
})