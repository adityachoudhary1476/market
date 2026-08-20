import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveEntity, findEntityMentions, describeUniverse } from '../entityResolution'

test('resolves index aliases to canonical ids', () => {
  assert.deepEqual(resolveEntity('Nifty'), { id: 'nifty-50', type: 'index', displayName: 'Nifty 50' })
  assert.deepEqual(resolveEntity('NIFTY'), { id: 'nifty-50', type: 'index', displayName: 'Nifty 50' })
  assert.deepEqual(resolveEntity('Nifty 50'), { id: 'nifty-50', type: 'index', displayName: 'Nifty 50' })
  assert.deepEqual(resolveEntity('Nifty50'), { id: 'nifty-50', type: 'index', displayName: 'Nifty 50' })
  assert.deepEqual(resolveEntity('nifty-50'), { id: 'nifty-50', type: 'index', displayName: 'Nifty 50' })
})

test('resolves Bank Nifty aliases', () => {
  assert.deepEqual(resolveEntity('Bank Nifty'), { id: 'bank-nifty', type: 'index', displayName: 'Bank Nifty' })
  assert.deepEqual(resolveEntity('BANKNIFTY'), { id: 'bank-nifty', type: 'index', displayName: 'Bank Nifty' })
  assert.deepEqual(resolveEntity('Nifty Bank'), { id: 'bank-nifty', type: 'index', displayName: 'Bank Nifty' })
})

test('resolves sensex and nifty-it', () => {
  assert.equal(resolveEntity('Sensex')?.id, 'sensex')
  assert.equal(resolveEntity('BSE Sensex')?.id, 'sensex')
  assert.equal(resolveEntity('Nifty IT')?.id, 'nifty-it')
})

test('resolves stock aliases (TCS, Infosys, Reliance)', () => {
  assert.deepEqual(resolveEntity('TCS'), { id: 'TCS', type: 'stock', displayName: 'Tata Consultancy Services' })
  assert.deepEqual(resolveEntity('Tata Consultancy Services'), { id: 'TCS', type: 'stock', displayName: 'Tata Consultancy Services' })
  assert.equal(resolveEntity('INFY')?.id, 'INFY')
  assert.equal(resolveEntity('Infosys')?.id, 'INFY')
  assert.equal(resolveEntity('Reliance')?.id, 'RELIANCE')
  assert.equal(resolveEntity('HDFC Bank')?.id, 'HDFCBANK')
})

test('unknown instruments resolve to null (no silent substitution)', () => {
  assert.equal(resolveEntity('TESLA'), null)
  assert.equal(resolveEntity('AAPL'), null)
  assert.equal(resolveEntity(''), null)
  assert.equal(resolveEntity('not a thing'), null)
  assert.equal(resolveEntity(undefined as unknown as string), null)
})

test('findEntityMentions finds instruments in natural language', () => {
  const mentions = findEntityMentions('Why is NIFTY weak today?')
  assert.equal(mentions.length, 1)
  assert.equal(mentions[0].id, 'nifty-50')
  assert.equal(mentions[0].type, 'index')
})

test('findEntityMentions uses longest-match first (Nifty IT beats Nifty)', () => {
  const mentions = findEntityMentions('How is Nifty IT doing?')
  const ids = mentions.map((m) => m.id)
  assert.ok(ids.includes('nifty-it'), `expected nifty-it, got ${ids.join(',')}`)
})

test('findEntityMentions does not match substrings inside other words', () => {
  const mentions = findEntityMentions('banknifty is moving')
  const ids = mentions.map((m) => m.id)
  assert.ok(ids.includes('bank-nifty'))
  // "nifty" alone must not fire for "banknifty" — bank-nifty already captured.
  assert.equal(mentions.length, 1)
})

test('findEntityMentions handles multiple instruments and dedupes', () => {
  const mentions = findEntityMentions('Compare TCS and Infosys')
  const ids = mentions.map((m) => m.id)
  assert.ok(ids.includes('TCS'))
  assert.ok(ids.includes('INFY'))
  assert.equal(mentions.length, 2, 'TCS and Infosys are the same entity family but distinct symbols')
})

test('describeUniverse lists the canonical universe', () => {
  const universe = describeUniverse()
  assert.ok(universe.includes('nifty-50'))
  assert.ok(universe.includes('sensex'))
  assert.ok(universe.includes('TCS'))
  assert.ok(universe.includes('INFY'))
})