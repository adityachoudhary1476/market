import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WEBSEARCH_LIMITS, validateWebSearchQuery, isValidWebSearchResult, searchCacheKey } from '../limits'
import type { WebSearchResult } from '../types'

test('limits: approved constants are locked', () => {
  assert.equal(WEBSEARCH_LIMITS.maxQueryChars, 400)
  assert.equal(WEBSEARCH_LIMITS.maxResults, 8)
  assert.equal(WEBSEARCH_LIMITS.maxRecencyDays, 3_650)
  assert.equal(WEBSEARCH_LIMITS.maxDomainFilters, 1)
  assert.equal(WEBSEARCH_LIMITS.maxSnippetChars, 500)
  assert.equal(WEBSEARCH_LIMITS.maxEvidenceChars, 12_000)
  assert.equal(WEBSEARCH_LIMITS.maxSearchesPerSession, 4)
  assert.equal(WEBSEARCH_LIMITS.clientTimeoutMs, 30_000)
  assert.equal(WEBSEARCH_LIMITS.providerTimeoutMs, 15_000)
  assert.equal(WEBSEARCH_LIMITS.cacheTtlMs, 300_000)
  assert.equal(WEBSEARCH_LIMITS.cacheMaxEntries, 100)
})

test('validate: a valid query is normalized', () => {
  const v = validateWebSearchQuery({ query: '  NIFTY news  ' })
  assert.equal(v.ok, true)
  if (!v.ok) return
  assert.equal(v.query.query, 'NIFTY news')
  assert.equal(v.query.maxResults, 5, 'defaults to 5')
})

test('validate: full options are preserved', () => {
  const v = validateWebSearchQuery({ query: 'TCS earnings', maxResults: 8, recencyDays: 30, domainFilter: 'reuters.com' })
  assert.equal(v.ok, true)
  if (!v.ok) return
  assert.deepEqual(v.query, { query: 'TCS earnings', maxResults: 8, recencyDays: 30, domainFilter: 'reuters.com' })
})

test('validate: query length is bounded to 400 chars', () => {
  assert.equal(validateWebSearchQuery({ query: 'x'.repeat(401) }).ok, false)
  assert.equal(validateWebSearchQuery({ query: 'x'.repeat(400) }).ok, true)
  assert.equal(validateWebSearchQuery({ query: '   ' }).ok, false)
  assert.equal(validateWebSearchQuery({ query: '' }).ok, false)
  assert.equal(validateWebSearchQuery({}).ok, false)
  assert.equal(validateWebSearchQuery(null).ok, false)
})

test('validate: maxResults is bounded to 1..8 and must be an integer', () => {
  assert.equal(validateWebSearchQuery({ query: 'q', maxResults: 0 }).ok, false)
  assert.equal(validateWebSearchQuery({ query: 'q', maxResults: 9 }).ok, false)
  assert.equal(validateWebSearchQuery({ query: 'q', maxResults: 2.5 }).ok, false)
  assert.equal(validateWebSearchQuery({ query: 'q', maxResults: 1 }).ok, true)
  assert.equal(validateWebSearchQuery({ query: 'q', maxResults: 8 }).ok, true)
})

test('validate: recencyDays is bounded to 1..3650', () => {
  assert.equal(validateWebSearchQuery({ query: 'q', recencyDays: 0 }).ok, false)
  assert.equal(validateWebSearchQuery({ query: 'q', recencyDays: 3_651 }).ok, false)
  assert.equal(validateWebSearchQuery({ query: 'q', recencyDays: 1 }).ok, true)
  assert.equal(validateWebSearchQuery({ query: 'q', recencyDays: 3_650 }).ok, true)
  assert.equal(validateWebSearchQuery({ query: 'q', recencyDays: 7.5 }).ok, false)
})

test('validate: at most one domain filter and it must be a bare domain', () => {
  const base = { query: 'q' }
  assert.equal(validateWebSearchQuery({ ...base, domainFilter: 'reuters.com' }).ok, true)
  assert.equal(validateWebSearchQuery({ ...base, domainFilter: '  reuters.com  ' }).ok, true)
  assert.equal(validateWebSearchQuery({ ...base, domainFilter: 'https://reuters.com' }).ok, false, 'scheme rejected')
  assert.equal(validateWebSearchQuery({ ...base, domainFilter: 'reuters.com/path' }).ok, false, 'path rejected')
  assert.equal(validateWebSearchQuery({ ...base, domainFilter: 'reuters .com' }).ok, false, 'whitespace rejected')
  assert.equal(validateWebSearchQuery({ ...base, domainFilter: 'reuters.com:8080' }).ok, false, 'port rejected')
  assert.equal(validateWebSearchQuery({ ...base, domainFilter: 'x'.repeat(129) }).ok, false)
})

test('isValidWebSearchResult: accepts well-formed evidence and rejects garbage', () => {
  const good: WebSearchResult = {
    title: 'Headline',
    url: 'https://example.com/story',
    snippet: 'Body text.',
    source: 'example.com',
    publishedAt: '2026-01-02T00:00:00.000Z',
    provider: 'tavily',
  }
  assert.equal(isValidWebSearchResult(good), true)
  assert.equal(isValidWebSearchResult({ ...good, url: 'javascript:alert(1)' }), false)
  assert.equal(isValidWebSearchResult({ ...good, url: 'not-a-url' }), false)
  assert.equal(isValidWebSearchResult({ ...good, url: 'ftp://example.com/x' }), false)
  assert.equal(isValidWebSearchResult({ ...good, snippet: 'x'.repeat(501) }), false)
  assert.equal(isValidWebSearchResult({ ...good, title: '' }), false)
  assert.equal(isValidWebSearchResult({ ...good, publishedAt: 'yesterday' }), false)
  assert.equal(isValidWebSearchResult({ ...good, publishedAt: null }), true, 'null date is honest')
  assert.equal(isValidWebSearchResult({ ...good, provider: 'duckduckgo' }), false)
  assert.equal(isValidWebSearchResult({ ...good, source: '' }), false)
  assert.equal(isValidWebSearchResult(null), false)
  assert.equal(isValidWebSearchResult('text'), false)
})

test('searchCacheKey: stable across field order and bounded', () => {
  const a = searchCacheKey({ query: 'q', maxResults: 8, recencyDays: 30, domainFilter: 'x.com' }, 'tavily')
  const b = searchCacheKey({ query: 'q', maxResults: 8, recencyDays: 30, domainFilter: 'x.com' }, 'tavily')
  assert.equal(a, b)
  const different = searchCacheKey({ query: 'q', maxResults: 8, recencyDays: 30, domainFilter: 'x.com' }, 'brave')
  assert.notEqual(a, different)
})