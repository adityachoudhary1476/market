import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRawResult, dedupeResults, truncateEvidence, finalizeSearchResults } from '../normalize'
import { WEBSEARCH_LIMITS } from '../limits'

test('normalize: valid raw item becomes validated evidence', () => {
  const r = normalizeRawResult(
    { title: '  Headline  ', url: 'https://www.Example.com/story', snippet: '  Body text.  ', publishedAt: '2026-01-02T10:00:00Z' },
    'tavily',
  )
  assert.ok(r)
  assert.equal(r!.title, 'Headline')
  assert.equal(r!.url, 'https://www.Example.com/story')
  assert.equal(r!.snippet, 'Body text.')
  assert.equal(r!.source, 'example.com', 'www prefix stripped, lowercased')
  assert.equal(r!.publishedAt, '2026-01-02T10:00:00.000Z')
  assert.equal(r!.provider, 'tavily')
})

test('normalize: drops results without a valid http(s) URL — never fabricates sources', () => {
  assert.equal(normalizeRawResult({ title: 'X', url: 'not a url', snippet: 's' }, 'brave'), null)
  assert.equal(normalizeRawResult({ title: 'X', url: 'javascript:alert(1)', snippet: 's' }, 'brave'), null)
  assert.equal(normalizeRawResult({ title: 'X', url: 'ftp://example.com/f', snippet: 's' }, 'brave'), null)
  assert.equal(normalizeRawResult({ title: 'X', url: '', snippet: 's' }, 'brave'), null)
  assert.equal(normalizeRawResult({ title: 'X', url: `https://e.com/${'a'.repeat(2100)}`, snippet: 's' }, 'brave'), null, 'oversized URL dropped')
})

test('normalize: drops results with no content at all', () => {
  assert.equal(normalizeRawResult({ title: '', url: 'https://example.com/x', snippet: '' }, 'tavily'), null)
  assert.equal(normalizeRawResult({ title: 'T', url: 'https://example.com/x', snippet: '' }, 'tavily')?.title, 'T')
})

test('normalize: snippet and title are bounded to approved caps', () => {
  const r = normalizeRawResult(
    { title: 't'.repeat(300), url: 'https://example.com/x', snippet: 's'.repeat(900) },
    'tavily',
  )
  assert.ok(r)
  assert.equal(r!.title.length, 200)
  assert.equal(r!.snippet.length, 500)
})

test('normalize: publishedAt is null unless the provider returned a real date', () => {
  assert.equal(normalizeRawResult({ title: 'T', url: 'https://e.com/x', snippet: 's', publishedAt: 'not a date' }, 'tavily')?.publishedAt, null)
  assert.equal(normalizeRawResult({ title: 'T', url: 'https://e.com/x', snippet: 's', publishedAt: 12345 }, 'tavily')?.publishedAt, null)
  assert.equal(normalizeRawResult({ title: 'T', url: 'https://e.com/x', snippet: 's', publishedAt: '2026-02-01' }, 'tavily')?.publishedAt, '2026-02-01T00:00:00.000Z')
  assert.equal(normalizeRawResult({ title: 'T', url: 'https://e.com/x', snippet: 's', publishedAt: '   ' }, 'tavily')?.publishedAt, null)
})

test('dedupe: later duplicates by URL are removed, first wins', () => {
  const base = { title: 'T', url: 'https://e.com/x', snippet: 's', source: 'e.com', publishedAt: null, provider: 'tavily' as const }
  const out = dedupeResults([
    base,
    { ...base, url: 'https://e.com/x#frag' },
    { ...base, url: 'https://E.COM/x' },
    { ...base, url: 'https://e.com/y' },
  ])
  assert.equal(out.results.length, 2)
  assert.equal(out.deduplicated, 2)
  assert.equal(out.results[1].url, 'https://e.com/y')
})

test('truncateEvidence: cuts results to the 12,000-char budget', () => {
  const big = { title: 'T'.repeat(200), url: `https://e.com/${'a'.repeat(1990)}`, snippet: 'S'.repeat(500), source: 'e.com', publishedAt: null, provider: 'tavily' as const }
  const one = truncateEvidence([big, big, big, big, big], 12_000)
  assert.equal(one.results.length, 4)
  assert.equal(one.truncated, true)
  const all = truncateEvidence([big], 12_000)
  assert.equal(all.truncated, false)
  const none = truncateEvidence([], 12_000)
  assert.equal(none.results.length, 0)
  assert.equal(none.truncated, false)
})

test('finalize: end-to-end normalization, dedupe, maxResults and budget', () => {
  const raw = [
    { title: 'First', url: 'https://news.com/a', snippet: 'One.', publishedAt: '2026-03-01' },
    { title: 'First (dup)', url: 'https://news.com/a', snippet: 'One again.' },
    { title: 'Broken', url: 'javascript:bad', snippet: 'Two.' },
    { title: 'Second', url: 'https://news.com/b', snippet: 'Two.' },
    { title: 'Third', url: 'https://news.com/c', snippet: 'Three.' },
  ]
  const out = finalizeSearchResults(raw, { provider: 'brave', maxResults: 2 })
  assert.equal(out.dropped, 1, 'invalid URL dropped')
  assert.equal(out.deduplicated, 1, 'duplicate dropped')
  assert.equal(out.results.length, 2, 'maxResults enforced')
  assert.equal(out.totalResults, 2)
  assert.equal(out.truncated, false)
  assert.equal(out.results[0].title, 'First')
})

test('finalize: budget truncation is reported honestly', () => {
  // Item size is ~2,714 chars (title 200 + long url + snippet 500); six items
  // exceed the 12,000-char approved budget.
  const big = (url: string) => ({ title: 'T'.repeat(200), url, snippet: 'S'.repeat(500) })
  const urls = Array.from({ length: 6 }, (_, i) => `https://e.com/${'a'.repeat(1990)}${i}`)
  const out = finalizeSearchResults(urls.map((u) => big(u)), { provider: 'tavily', maxResults: 8 })
  assert.equal(out.totalResults, 6, 'all valid results counted before the budget cut')
  assert.ok(out.results.length < 6, 'budget cut applied')
  assert.equal(out.truncated, true)
  assert.ok(out.results.reduce((sum, r) => sum + r.title.length + r.url.length + r.snippet.length, 0) <= WEBSEARCH_LIMITS.maxEvidenceChars)
})