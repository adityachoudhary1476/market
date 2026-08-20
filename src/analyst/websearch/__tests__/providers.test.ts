import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTavilyProvider } from '../providers/tavily'
import { createBraveProvider, freshnessFromRecencyDays } from '../providers/brave'
import { createWebSearchProvider, isSupportedSearchProvider } from '../providers'
import { SearchProviderError } from '../providers/errors'

function jsonOk(body: unknown) {
  return { ok: true, status: 200, async json() { return body } }
}

function jsonError(status: number, body: unknown) {
  return { ok: false, status, async json() { return body } }
}

// --- Tavily -----------------------------------------------------------------

test('tavily: builds the correct request and maps the response', async () => {
  // Wrapper object: TS cannot narrow a `let` assigned inside a closure
  // (it stays `null` to the compiler), so capture through a stable property.
  const captured: { value: { url: string; init: Record<string, unknown> } | null } = { value: null }
  const provider = createTavilyProvider({
    apiKey: 'tvly-test',
    fetchImpl: async (url, init) => {
      captured.value = { url, init }
      return jsonOk({
        results: [
          { title: 'NIFTY news', url: 'https://news.example.com/a', content: 'The index moved.', published_date: '2026-04-01T00:00:00Z' },
          { title: 'Broken', url: 'not-a-url', content: 'x' },
          { title: 'No date', url: 'https://news.example.com/b', content: 'y', published_date: null },
        ],
      })
    },
  })
  const result = await provider.search({ query: 'NIFTY', maxResults: 3, recencyDays: 30, domainFilter: 'reuters.com' })
  assert.ok(captured.value)
  const body = JSON.parse(captured.value!.init.body as string) as Record<string, unknown>
  assert.equal(captured.value!.url, 'https://api.tavily.com/search')
  assert.equal(body.api_key, 'tvly-test')
  assert.equal(body.query, 'NIFTY')
  assert.equal(body.max_results, 3)
  assert.equal(body.days, 30)
  assert.deepEqual(body.include_domains, ['reuters.com'])
  assert.equal(body.include_answer, false)
  assert.equal(result.results.length, 3, 'raw items pass through untouched — normalization is the gateway’s job')
  assert.equal(result.results[0].publishedAt, '2026-04-01T00:00:00Z')
  assert.equal(result.results[1].publishedAt, null)
})

test('tavily: HTTP errors map to typed SearchProviderError', async () => {
  const provider = createTavilyProvider({
    apiKey: 'tvly-test',
    fetchImpl: async () => jsonError(429, { error: { message: 'rate limited' } }),
  })
  await assert.rejects(
    () => provider.search({ query: 'q', maxResults: 5 }),
    (err: unknown) => err instanceof SearchProviderError && err.kind === 'rate-limit',
  )
  const auth = createTavilyProvider({ apiKey: 'x', fetchImpl: async () => jsonError(401, {}) })
  await assert.rejects(
    () => auth.search({ query: 'q', maxResults: 5 }),
    (err: unknown) => err instanceof SearchProviderError && err.kind === 'auth',
  )
})

test('tavily: malformed responses are invalid-response', async () => {
  const provider = createTavilyProvider({ apiKey: 'x', fetchImpl: async () => jsonOk({ results: 'nope' }) })
  await assert.rejects(
    () => provider.search({ query: 'q', maxResults: 5 }),
    (err: unknown) => err instanceof SearchProviderError && err.kind === 'invalid-response',
  )
})

test('tavily: a baseUrl override replaces the default endpoint', async () => {
  let capturedUrl = ''
  const provider = createTavilyProvider({
    apiKey: 'tvly-test',
    baseUrl: 'https://selfhosted.example.com/search',
    fetchImpl: async (url) => {
      capturedUrl = url
      return jsonOk({ results: [] })
    },
  })
  await provider.search({ query: 'q', maxResults: 5 })
  assert.equal(capturedUrl, 'https://selfhosted.example.com/search')
})

// --- Brave ------------------------------------------------------------------

test('brave: builds the correct request and maps the response', async () => {
  // Wrapper object: TS cannot narrow a `let` assigned inside a closure.
  const captured: { value: { url: string; init: Record<string, unknown> } | null } = { value: null }
  const provider = createBraveProvider({
    apiKey: 'bsa-test',
    fetchImpl: async (url, init) => {
      captured.value = { url, init }
      return jsonOk({
        web: {
          results: [
            { title: 'Headline', url: 'https://brave.example.com/a', description: 'Body.', published_time: '2026-05-01T00:00:00Z' },
            { title: 'No date', url: 'https://brave.example.com/b', description: 'Body 2.' },
          ],
        },
      })
    },
  })
  const result = await provider.search({ query: 'TCS', maxResults: 2, recencyDays: 3 })
  assert.ok(captured.value)
  assert.ok(captured.value!.url.startsWith('https://api.search.brave.com/res/v1/web/search?'))
  const params = new URLSearchParams(captured.value!.url.split('?')[1])
  assert.equal(params.get('q'), 'TCS')
  assert.equal(params.get('count'), '2')
  assert.equal(params.get('freshness'), 'pweek')
  const headers = captured.value!.init.headers as Record<string, string>
  assert.equal(headers['X-Subscription-Token'], 'bsa-test')
  assert.equal(result.results.length, 2)
  assert.equal(result.results[1].publishedAt, null)
})

test('brave: freshness window derived from approved recencyDays', () => {
  assert.equal(freshnessFromRecencyDays(1), 'pday')
  assert.equal(freshnessFromRecencyDays(7), 'pweek')
  assert.equal(freshnessFromRecencyDays(30), 'pmonth')
  assert.equal(freshnessFromRecencyDays(365), 'pyear')
  assert.equal(freshnessFromRecencyDays(366), undefined)
  assert.equal(freshnessFromRecencyDays(3650), undefined, 'no freshness param beyond a year')
})

test('brave: HTTP errors map to typed SearchProviderError', async () => {
  const provider = createBraveProvider({ apiKey: 'x', fetchImpl: async () => jsonError(403, {}) })
  await assert.rejects(
    () => provider.search({ query: 'q', maxResults: 5 }),
    (err: unknown) => err instanceof SearchProviderError && err.kind === 'auth',
  )
})

test('brave: malformed responses are invalid-response', async () => {
  const provider = createBraveProvider({ apiKey: 'x', fetchImpl: async () => jsonOk({ web: { results: 'nope' } }) })
  await assert.rejects(
    () => provider.search({ query: 'q', maxResults: 5 }),
    (err: unknown) => err instanceof SearchProviderError && err.kind === 'invalid-response',
  )
})

test('brave: a baseUrl override replaces the default endpoint', async () => {
  let capturedUrl = ''
  const provider = createBraveProvider({
    apiKey: 'bsa-test',
    baseUrl: 'https://selfhosted.example.com/v1/search',
    fetchImpl: async (url) => {
      capturedUrl = url
      return jsonOk({ web: { results: [] } })
    },
  })
  await provider.search({ query: 'q', maxResults: 5 })
  assert.ok(capturedUrl.startsWith('https://selfhosted.example.com/v1/search?'))
})

// --- Factory ----------------------------------------------------------------

test('factory: creates the configured provider seam', () => {
  const tavily = createWebSearchProvider({ provider: 'tavily', apiKey: 'k', fetchImpl: async () => jsonOk({ results: [] }) })
  assert.equal(tavily.name, 'tavily')
  const brave = createWebSearchProvider({ provider: 'brave', apiKey: 'k', fetchImpl: async () => jsonOk({ web: { results: [] } }) })
  assert.equal(brave.name, 'brave')
  assert.equal(isSupportedSearchProvider('tavily'), true)
  assert.equal(isSupportedSearchProvider('brave'), true)
  assert.equal(isSupportedSearchProvider('duckduckgo'), false)
})

test('providers: transient failures are typed retryable, auth is not', () => {
  const timeout = new SearchProviderError('timeout', 't')
  assert.equal(timeout.retryable, true)
  const network = new SearchProviderError('network', 'n')
  assert.equal(network.retryable, true)
  const rateLimit = new SearchProviderError('rate-limit', 'r')
  assert.equal(rateLimit.retryable, true)
  const auth = new SearchProviderError('auth', 'a')
  assert.equal(auth.retryable, false)
  const invalid = new SearchProviderError('invalid-response', 'i')
  assert.equal(invalid.retryable, false)
})