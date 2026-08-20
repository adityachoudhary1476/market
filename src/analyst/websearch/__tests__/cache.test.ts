import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSearchCache } from '../cache'
import type { WebSearchResponse } from '../types'

function response(query: string): WebSearchResponse {
  return { query, provider: 'tavily', results: [], totalResults: 0, truncated: false }
}

test('cache: returns entries within the TTL', () => {
  let now = 1_000
  const cache = createSearchCache({ maxEntries: 100, ttlMs: 300_000, now: () => now })
  cache.set('k', response('q'))
  assert.equal(cache.get('k')?.query, 'q')
  now += 299_999
  assert.equal(cache.get('k')?.query, 'q')
})

test('cache: expired entries are not returned (300s TTL)', () => {
  let now = 1_000
  const cache = createSearchCache({ maxEntries: 100, ttlMs: 300_000, now: () => now })
  cache.set('k', response('q'))
  now += 300_000
  assert.equal(cache.get('k'), undefined)
  assert.equal(cache.size(), 0, 'expired entry evicted lazily')
})

test('cache: capacity is capped at 100 entries (LRU eviction)', () => {
  let now = 1_000
  const cache = createSearchCache({ maxEntries: 100, ttlMs: 300_000, now: () => now })
  for (let i = 0; i < 100; i++) cache.set(`k${i}`, response(`q${i}`))
  assert.equal(cache.size(), 100)
  // Touch the oldest so it becomes most-recent, then overflow.
  cache.get('k0')
  cache.set('overflow', response('x'))
  assert.equal(cache.size(), 100)
  assert.equal(cache.get('k1'), undefined, 'least-recently-used evicted')
  assert.equal(cache.get('k0')?.query, 'q0', 'recently touched survives')
})

test('cache: clear and overwrite behave deterministically', () => {
  const cache = createSearchCache({ now: () => 1_000 })
  cache.set('k', response('a'))
  cache.set('k', response('b'))
  assert.equal(cache.get('k')?.query, 'b')
  cache.clear()
  assert.equal(cache.size(), 0)
  assert.equal(cache.get('k'), undefined)
})