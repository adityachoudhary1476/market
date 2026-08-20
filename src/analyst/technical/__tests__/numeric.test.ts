import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sma, ema, smaSeries, emaSeries, mean, stddevPop } from '../numeric'

const approx = (a: number, b: number, eps = 0.01) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)

test('sma: average of last n values', () => {
  assert.equal(sma([1, 2, 3, 4, 5], 5), 3)
  assert.equal(sma([1, 2, 3, 4, 5], 3), 4)
  assert.equal(sma([1, 2], 5), null)
})

test('smaSeries trailing values', () => {
  const s = smaSeries([1, 2, 3, 4, 5], 3)
  assert.equal(s.length, 5)
  assert.equal(s[0], null)
  approx(s[2] as number, 2)
  approx(s[4] as number, 4)
})

test('ema: seeded with SMA, reacts on rising series', () => {
  // Exactly `period` values returns the SMA seed; a longer rising series
  // produces an EMA that reacts above the seed.
  assert.equal(ema([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10), 5.5)
  const e = ema([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 10)
  assert.ok(e != null)
  assert.ok((e as number) > 5.5)
  assert.ok((e as number) < 12)
})

test('emaSeries first valid at period-1', () => {
  const s = emaSeries([2, 4, 6, 8, 10], 3)
  assert.equal(s[0], null)
  assert.equal(s[1], null)
  assert.ok(s[2] != null)
  assert.ok(s[4] != null)
})

test('mean/stddev', () => {
  assert.equal(mean([2, 4, 6]), 4)
  approx(stddevPop([2, 4, 6]), 1.633, 0.01)
})
