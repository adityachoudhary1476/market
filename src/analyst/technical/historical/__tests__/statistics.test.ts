import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize, median, percentile, mean, standardDeviation, qualityFromSample, sortNumbers } from '../statistics'
import { DEFAULT_HISTORICAL_CONFIG } from '../config'

test('statistics: median of even-length sorted sample is the mean of the middle pair', () => {
  assert.equal(median([1, 2, 3, 4]), 2.5)
  assert.equal(median([1, 2, 3]), 2)
  assert.equal(median([]), null)
})

test('statistics: nearest-rank percentiles', () => {
  const sorted = sortNumbers([5, 1, 4, 3, 2])
  assert.deepEqual(sorted, [1, 2, 3, 4, 5])
  // p25: rank ceil(0.25*5)=2 -> 2 ; p75: rank ceil(0.75*5)=4 -> 4
  assert.equal(percentile(sorted, 25), 2)
  assert.equal(percentile(sorted, 75), 4)
  assert.equal(percentile([], 50), null)
})

test('statistics: summarize computes rates, dispersion and quartiles', () => {
  const s = summarize([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.equal(s.count, 10)
  assert.equal(s.mean, 5.5)
  assert.equal(s.median, 5.5)
  assert.equal(s.min, 1)
  assert.equal(s.max, 10)
  assert.equal(s.positiveRate, 100)
  assert.equal(s.negativeRate, 0)
  assert.equal(s.p25, 3)
  assert.equal(s.p75, 8)
  assert.ok(s.standardDeviation != null && s.standardDeviation > 0)
})

test('statistics: summarize on empty returns null fields', () => {
  const s = summarize([])
  assert.equal(s.count, 0)
  assert.equal(s.mean, null)
  assert.equal(s.median, null)
  assert.equal(s.positiveRate, null)
})

test('statistics: mean and standard deviation sanity', () => {
  assert.equal(mean([2, 4, 6]), 4)
  assert.equal(mean([]), null)
  assert.equal(standardDeviation([2, 4, 6], 4), 2)
  assert.equal(standardDeviation([5], 5), null)
})

test('statistics: quality bands from sample count', () => {
  const c = DEFAULT_HISTORICAL_CONFIG
  assert.equal(qualityFromSample(30, c, true), 'high')
  assert.equal(qualityFromSample(12, c, true), 'medium')
  assert.equal(qualityFromSample(6, c, true), 'low')
  assert.equal(qualityFromSample(2, c, true), 'insufficient')
  // completeness penalty drops a band
  assert.equal(qualityFromSample(30, c, false), 'medium')
  assert.equal(qualityFromSample(12, c, false), 'low')
  assert.equal(qualityFromSample(6, c, false), 'low') // already low: stays
})

test('statistics: summarize rounds to 4 decimals', () => {
  const s = summarize([0.123456, 0.123456])
  assert.equal(s.mean, 0.1235)
})