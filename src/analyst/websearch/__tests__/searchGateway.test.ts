import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleSearchRequest } from '../server/searchGateway'
import { resolveSearchEnv } from '../server/env'
import type { SearchEnv } from '../server/env'
import { createSearchCache } from '../cache'
import type { RawSearchResult, WebSearchProvider } from '../types'
import { SearchProviderError } from '../providers/errors'

function searchEnv(overrides: Record<string, string> = {}): SearchEnv {
  const resolved = resolveSearchEnv({ FINOVA_WEB_SEARCH_API_KEY: 'tvly-test-secret', ...overrides })
  assert.ok(resolved, 'test search env must resolve')
  return resolved
}

function providerReturning(raw: RawSearchResult[]): WebSearchProvider {
  return {
    name: 'tavily',
    async search() {
      return { results: raw }
    },
  }
}

function validBody(): Record<string, unknown> {
  return { query: 'NIFTY news', maxResults: 3 }
}

test('env: not configured without a provider key', () => {
  assert.equal(resolveSearchEnv({}), null)
  assert.equal(resolveSearchEnv({ FINOVA_WEB_SEARCH_PROVIDER: 'tavily' }), null)
  assert.equal(resolveSearchEnv({ FINOVA_WEB_SEARCH_PROVIDER: 'brave', FINOVA_WEB_SEARCH_API_KEY: '   ' }), null)
})

test('env: unsupported provider means not configured', () => {
  assert.equal(resolveSearchEnv({ FINOVA_WEB_SEARCH_PROVIDER: 'hackrf', FINOVA_WEB_SEARCH_API_KEY: 'k' }), null)
})

test('env: key resolves with defaults, provider selection and clamping', () => {
  const env = resolveSearchEnv({ FINOVA_WEB_SEARCH_API_KEY: 'tvly-x' })
  assert.ok(env)
  assert.equal(env!.provider, 'tavily')
  assert.equal(env!.timeoutMs, 15_000)
  assert.equal(env!.cacheTtlMs, 300_000)
  assert.equal(env!.cacheMaxEntries, 100)
  assert.equal(env!.baseUrl, undefined)
  const clamped = resolveSearchEnv({ FINOVA_WEB_SEARCH_API_KEY: 'tvly-x', FINOVA_WEB_SEARCH_TIMEOUT_MS: '999999' })
  assert.ok(clamped)
  assert.equal(clamped!.timeoutMs, 60_000)
  const brave = resolveSearchEnv({ FINOVA_WEB_SEARCH_PROVIDER: 'brave', FINOVA_WEB_SEARCH_API_KEY: 'bsa-x' })
  assert.ok(brave)
  assert.equal(brave!.provider, 'brave')
})

test('env: base URL and cache tuning are honored and clamped', () => {
  const env = resolveSearchEnv({
    FINOVA_WEB_SEARCH_API_KEY: 'tvly-x',
    FINOVA_WEB_SEARCH_BASE_URL: 'https://selfhosted.example.com/search',
    FINOVA_WEB_SEARCH_CACHE_TTL_MS: '120000',
    FINOVA_WEB_SEARCH_CACHE_MAX: '250',
  })
  assert.ok(env)
  assert.equal(env!.baseUrl, 'https://selfhosted.example.com/search')
  assert.equal(env!.cacheTtlMs, 120_000)
  assert.equal(env!.cacheMaxEntries, 250)
  const clamped = resolveSearchEnv({ FINOVA_WEB_SEARCH_API_KEY: 'k', FINOVA_WEB_SEARCH_CACHE_TTL_MS: '99999999', FINOVA_WEB_SEARCH_CACHE_MAX: '99999' })
  assert.ok(clamped)
  assert.equal(clamped!.cacheTtlMs, 3_600_000)
  assert.equal(clamped!.cacheMaxEntries, 1_000)
  assert.equal(resolveSearchEnv({ FINOVA_WEB_SEARCH_API_KEY: 'k', FINOVA_WEB_SEARCH_BASE_URL: '   ' })!.baseUrl, undefined, 'blank base URL means default endpoint')
})

test('gateway: 503 provider-not-configured when no search env', async () => {
  const result = await handleSearchRequest(validBody(), { searchEnv: null })
  assert.equal(result.status, 503)
  assert.ok('error' in result.body)
  assert.equal(result.body.error.code, 'provider-not-configured')
})

test('gateway: invalid requests are rejected with 400', async () => {
  const result = await handleSearchRequest({ query: '' }, { searchEnv: searchEnv(), cache: createSearchCache() })
  assert.equal(result.status, 400)
  assert.ok('error' in result.body)
  assert.equal(result.body.error.code, 'invalid-request')
  const tooLong = await handleSearchRequest({ query: 'x'.repeat(401) }, { searchEnv: searchEnv(), cache: createSearchCache() })
  assert.equal(tooLong.status, 400)
})

test('gateway: provider output is normalized, deduplicated and bounded', async () => {
  const provider = providerReturning([
    { title: 'One', url: 'https://news.com/a', snippet: 'First.', publishedAt: '2026-01-01' },
    { title: 'One dup', url: 'https://news.com/a#frag', snippet: 'First again.' },
    { title: 'Broken', url: 'javascript:bad', snippet: 'x' },
    { title: 'Two', url: 'https://news.com/b', snippet: 'Second.' },
    { title: 'Three', url: 'https://news.com/c', snippet: 'Third.' },
  ])
  const result = await handleSearchRequest(validBody(), { searchEnv: searchEnv(), provider, cache: createSearchCache() })
  assert.equal(result.status, 200)
  if ('error' in result.body) return
  assert.equal(result.body.results.length, 3, 'invalid dropped, duplicate removed, maxResults applies after dedupe')
  assert.equal(result.body.results[0].title, 'One')
  assert.equal(result.body.totalResults, 3)
  assert.equal(result.body.truncated, false)
  assert.equal(result.body.results[0].source, 'news.com')
})

test('gateway: cache serves a repeat request without calling the provider again', async () => {
  let calls = 0
  const provider: WebSearchProvider = {
    name: 'tavily',
    async search() {
      calls += 1
      return { results: [{ title: 'T', url: 'https://news.com/x', snippet: 'S.', publishedAt: null }] }
    },
  }
  const cache = createSearchCache()
  const deps = { searchEnv: searchEnv(), provider, cache }
  const first = await handleSearchRequest(validBody(), deps)
  const second = await handleSearchRequest(validBody(), deps)
  assert.equal(calls, 1, 'second request served from cache')
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  if ('error' in first.body || 'error' in second.body) return
  assert.equal(second.body.cached, true)
  assert.deepEqual(second.body.results, first.body.results)
})

test('gateway: exactly one transient retry, then the error is surfaced', async () => {
  let calls = 0
  const provider: WebSearchProvider = {
    name: 'tavily',
    async search() {
      calls += 1
      if (calls === 1) throw new SearchProviderError('timeout', 'slow')
      return { results: [{ title: 'T', url: 'https://news.com/x', snippet: 'S.', publishedAt: null }] }
    },
  }
  const result = await handleSearchRequest(validBody(), { searchEnv: searchEnv(), provider, cache: createSearchCache() })
  assert.equal(calls, 2, 'one retry after the transient failure')
  assert.equal(result.status, 200)
})

test('gateway: persistent transient failure maps to a sanitized error', async () => {
  let calls = 0
  const provider: WebSearchProvider = {
    name: 'tavily',
    async search() {
      calls += 1
      throw new SearchProviderError('unavailable', 'provider exploded with secret details')
    },
  }
  const result = await handleSearchRequest(validBody(), { searchEnv: searchEnv(), provider, cache: createSearchCache() })
  assert.equal(calls, 2, 'retried once, never more')
  assert.equal(result.status, 503)
  assert.ok('error' in result.body)
  assert.equal(result.body.error.code, 'provider-error')
  assert.ok(!result.body.error.message.includes('secret'), 'provider internals never reach the client')
})

test('gateway: auth errors are not retried and map to 502 with a fixed message', async () => {
  let calls = 0
  const provider: WebSearchProvider = {
    name: 'tavily',
    async search() {
      calls += 1
      throw new SearchProviderError('auth', 'invalid key')
    },
  }
  const result = await handleSearchRequest(validBody(), { searchEnv: searchEnv(), provider, cache: createSearchCache() })
  assert.equal(calls, 1, 'auth is not retryable')
  assert.equal(result.status, 502)
})

test('gateway: rate-limit maps to 429, timeout to 504', async () => {
  const rateLimited: WebSearchProvider = {
    name: 'tavily',
    async search() {
      throw new SearchProviderError('rate-limit', 'slow down')
    },
  }
  const rl = await handleSearchRequest(validBody(), { searchEnv: searchEnv(), provider: rateLimited, cache: createSearchCache() })
  assert.equal(rl.status, 429)
  assert.ok('error' in rl.body)
  assert.equal(rl.body.error.code, 'rate-limit')

  const slow: WebSearchProvider = {
    name: 'tavily',
    async search() {
      throw new SearchProviderError('timeout', 'slow')
    },
  }
  const to = await handleSearchRequest(validBody(), { searchEnv: searchEnv(), provider: slow, cache: createSearchCache() })
  assert.equal(to.status, 504)
  assert.ok('error' in to.body)
  assert.equal(to.body.error.code, 'timeout')
})

test('gateway: the API key is never echoed in any body', async () => {
  const provider: WebSearchProvider = {
    name: 'tavily',
    async search() {
      throw new SearchProviderError('unavailable', 'key tvly-test-secret leaked in message')
    },
  }
  const result = await handleSearchRequest(validBody(), { searchEnv: searchEnv(), provider, cache: createSearchCache() })
  const serialized = JSON.stringify(result.body)
  assert.ok(!serialized.includes('tvly-test-secret'), 'server secret never reaches the client')
})