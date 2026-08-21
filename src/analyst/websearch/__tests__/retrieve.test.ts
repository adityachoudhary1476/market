import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSearchCache } from '../cache'
import { normalizeQueryKey, searchCacheKey } from '../limits'
import { retrieveEvidence, searchSessionCacheKey, semanticQueryKey } from '../retrieve'
import type { SearchToolId, RetrievalEvent } from '../retrieve'
import type { WebSearchQuery, WebSearchResponse, WebSearchTransport } from '../types'

function response(query: string, url = `https://example.com/${query.replace(/\s+/g, '-')}`): WebSearchResponse {
  return {
    query,
    provider: 'tavily',
    results: [{ title: 'Headline', url, snippet: 'Body text.', source: 'example.com', publishedAt: null, provider: 'tavily' }],
    totalResults: 1,
    truncated: false,
  }
}

function transportReturning(urls: string[]): WebSearchTransport & { calls: number } {
  let calls = 0
  return {
    calls: 0,
    async search(query: WebSearchQuery) {
      calls += 1
      ;(this as { calls: number }).calls = calls
      return response(query.query, urls[Math.min(calls - 1, urls.length - 1)])
    },
  }
}

test('normalizeQueryKey: case and whitespace collapse to one key', () => {
  assert.equal(normalizeQueryKey('  NIFTY   news  '), 'nifty news')
  assert.equal(normalizeQueryKey('NIFTY news'), normalizeQueryKey('nifty news'))
  assert.equal(normalizeQueryKey('Gold  price'), normalizeQueryKey('gold price'))
})

test('searchCacheKey: equivalent phrasings share one server cache key', () => {
  const a = searchCacheKey({ query: 'NIFTY news' }, 'tavily')
  const b = searchCacheKey({ query: 'nifty news' }, 'tavily')
  assert.equal(a, b, 'normalized query dedupes the server cache')
  const c = searchCacheKey({ query: 'nifty news' }, 'brave')
  assert.notEqual(a, c, 'provider still separates entries')
})

test('searchSessionCacheKey: normalized, tool-scoped, options-aware', () => {
  const q: WebSearchQuery = { query: '  NIFTY News ' }
  assert.equal(searchSessionCacheKey(q, 'searchWeb'), searchSessionCacheKey({ query: 'nifty news' }, 'searchWeb'))
  assert.notEqual(searchSessionCacheKey(q, 'searchWeb'), searchSessionCacheKey(q, 'searchNews'))
  assert.notEqual(
    searchSessionCacheKey({ query: 'nifty news', maxResults: 8 }, 'searchWeb'),
    searchSessionCacheKey({ query: 'nifty news', maxResults: 5 }, 'searchWeb'),
  )
  assert.notEqual(
    searchSessionCacheKey({ query: 'nifty news', domainFilter: 'reuters.com' }, 'searchWeb'),
    searchSessionCacheKey({ query: 'nifty news' }, 'searchWeb'),
  )
})

test('retrieveEvidence: a cache hit serves the response with no transport call', async () => {
  const events: RetrievalEvent[] = []
  const transport = transportReturning(['https://example.com/one'])
  const cache = createSearchCache()
  const first = await retrieveEvidence({ transport, query: { query: 'NIFTY news' }, tool: 'searchWeb', cache, onEvent: (e) => events.push(e) })
  assert.equal(first.fromCache, false)
  assert.equal(transport.calls, 1)

  const second = await retrieveEvidence({ transport, query: { query: 'nifty news' }, tool: 'searchWeb', cache, onEvent: (e) => events.push(e) })
  assert.equal(second.fromCache, true, 'normalized equivalent query hits the cache')
  assert.equal(second.response.cached, true, 'cache hits are marked cached')
  assert.equal(transport.calls, 1, 'the transport (and therefore Tavily) was not called again')
  assert.deepEqual(
    events.map((e) => e.type),
    ['miss', 'fetch', 'hit'],
  )
  assert.equal(events[1].type === 'fetch' && events[1].provider, 'tavily', 'the provider that served the fetch is reported')
})

test('retrieveEvidence: cache is scoped by tool', async () => {
  const transport = transportReturning(['https://example.com/a'])
  const cache = createSearchCache()
  const web = await retrieveEvidence({ transport, query: { query: 'nifty' }, tool: 'searchWeb', cache })
  const news = await retrieveEvidence({ transport, query: { query: 'nifty' }, tool: 'searchNews', cache })
  assert.equal(web.fromCache, false)
  assert.equal(news.fromCache, false, 'news and web searches for the same text do not collide')
  assert.equal(transport.calls, 2)
})

test('retrieveEvidence: without a cache every request reaches the transport', async () => {
  const transport = transportReturning(['https://example.com/a'])
  const first = await retrieveEvidence({ transport, query: { query: 'q' }, tool: 'searchWeb' })
  const second = await retrieveEvidence({ transport, query: { query: 'q' }, tool: 'searchWeb' })
  assert.equal(first.fromCache, false)
  assert.equal(second.fromCache, false)
  assert.equal(transport.calls, 2)
})

test('retrieveEvidence: stale entries expire and are refetched, never cached indefinitely', async () => {
  let now = 1_000
  const events: RetrievalEvent[] = []
  const transport = transportReturning(['https://example.com/a'])
  const cache = createSearchCache({ ttlMs: 300_000, now: () => now })
  const first = await retrieveEvidence({ transport, query: { query: 'q' }, tool: 'searchWeb', cache, onEvent: (e) => events.push(e) })
  assert.equal(first.fromCache, false)

  now += 300_000
  const second = await retrieveEvidence({ transport, query: { query: 'q' }, tool: 'searchWeb', cache, onEvent: (e) => events.push(e) })
  assert.equal(second.fromCache, false, 'expired entry is not served')
  assert.equal(transport.calls, 2, 'the provider was reached again after expiry')
})

test('retrieveEvidence: transport failures propagate as errors (nothing cached)', async () => {
  const cache = createSearchCache()
  const failing: WebSearchTransport = {
    async search() {
      throw new Error('gateway down')
    },
  }
  await assert.rejects(
    retrieveEvidence({ transport: failing, query: { query: 'q' }, tool: 'searchWeb', cache }),
    /gateway down/,
  )
  assert.equal(cache.size(), 0, 'failed fetches are never cached')
})

test('searchSessionCacheKey is stable for the tool type union', () => {
  const tools: SearchToolId[] = ['searchWeb', 'searchNews']
  const keys = tools.map((t) => searchSessionCacheKey({ query: 'gold' }, t))
  assert.equal(new Set(keys).size, 2)
})

test('semanticQueryKey folds common driver rephrasings', () => {
  assert.equal(semanticQueryKey('Why is oil rising right now?'), semanticQueryKey('What is driving oil today?'))
})