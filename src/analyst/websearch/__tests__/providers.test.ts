import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTavilyProvider } from '../providers/tavily'
import { createBraveProvider, freshnessFromRecencyDays } from '../providers/brave'
import { createRssProvider } from '../providers/rss'
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

// --- RSS / Atom --------------------------------------------------------------

function xmlOk(xml: string) {
  return { ok: true, status: 200, async text() { return xml }, async json() { return {} } }
}

function xmlError(status: number) {
  return { ok: false, status, async text() { return '' }, async json() { return {} } }
}

const RSS_XML = `<?xml version="1.0"?>
<rss version="2.0"><channel>
<item>
<title>Oil rises on supply concerns</title>
<link>https://news.example.com/oil</link>
<description>Prices climbed today.</description>
<pubDate>Mon, 20 Aug 2026 10:00:00 GMT</pubDate>
</item>
<item>
<title>Equity markets steady</title>
<link>https://news.example.com/equities</link>
<description>Indices were flat.</description>
<pubDate>Tue, 21 Aug 2026:00:00 GMT</pubDate>
</item>
</channel></rss>`

const ATOM_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><entry>
<title>Gold slips on stronger dollar</title>
<link href="https://news.example.com/gold" rel="alternate" type="text/html"/>
<summary>Gold fell in early trade.</summary>
<updated>2026-08-20T09:00:00Z</updated>
</entry></feed>`

const CDATA_XML = `<?xml version="1.0"?>
<rss version="2.0"><channel><item>
<title><![CDATA[Bank & "rally" beats estimates]]></title>
<link>https://news.example.com/bank</link>
<description><![CDATA[&lt;strong&gt;Up&lt;/strong&gt; on earnings]]></description>
<pubDate>Mon, 20 Aug 2026 10:00:00 GMT</pubDate>
</item></channel></rss>`

const ENTITY_XML = `<?xml version="1.0"?>
<rss version="2.0"><channel><item>
<title>Bank &amp; oil move together</title>
<link>https://news.example.com/bankoil</link>
<description>Energy &amp; finance correlated.</description>
<pubDate>Mon, 20 Aug 2026 10:00:00 GMT</pubDate>
</item></channel></rss>`

const EMPTY_XML = `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`

test('rss: parses RSS 2.0 items with title, link, description and pubDate', async () => {
  const provider = createRssProvider({ feedUrl: 'https://news.example.com/rss', fetchImpl: async () => xmlOk(RSS_XML) })
  const result = await provider.search({ query: 'oil', maxResults: 5 })
  assert.equal(result.results.length, 1)
  assert.equal(result.results[0].title, 'Oil rises on supply concerns')
  assert.equal(result.results[0].url, 'https://news.example.com/oil')
  assert.equal(result.results[0].snippet, 'Prices climbed today.')
  assert.equal(result.results[0].publishedAt, 'Mon, 20 Aug 2026 10:00:00 GMT')
})

test('rss: parses Atom <entry> with link href, summary and updated', async () => {
  const provider = createRssProvider({ feedUrl: 'https://news.example.com/atom', fetchImpl: async () => xmlOk(ATOM_XML) })
  const result = await provider.search({ query: 'gold', maxResults: 5 })
  assert.equal(result.results.length, 1)
  assert.equal(result.results[0].title, 'Gold slips on stronger dollar')
  assert.equal(result.results[0].url, 'https://news.example.com/gold')
  assert.equal(result.results[0].snippet, 'Gold fell in early trade.')
  assert.equal(result.results[0].publishedAt, '2026-08-20T09:00:00Z')
})

test('rss: decodes CDATA sections in title and description', async () => {
  const provider = createRssProvider({ feedUrl: 'https://news.example.com/rss', fetchImpl: async () => xmlOk(CDATA_XML) })
  const result = await provider.search({ query: 'bank', maxResults: 5 })
  assert.equal(result.results[0].title, 'Bank & "rally" beats estimates')
  assert.equal(result.results[0].snippet, 'Up on earnings')
})

test('rss: decodes XML entities (&amp;) in title and snippet', async () => {
  const provider = createRssProvider({ feedUrl: 'https://news.example.com/rss', fetchImpl: async () => xmlOk(ENTITY_XML) })
  const result = await provider.search({ query: 'bank', maxResults: 5 })
  assert.equal(result.results[0].title, 'Bank & oil move together')
  assert.equal(result.results[0].snippet, 'Energy & finance correlated.')
})

test('rss: empty/malformed feed yields no items and reports unavailable', async () => {
  const provider = createRssProvider({ feedUrl: 'https://news.example.com/rss', fetchImpl: async () => xmlOk(EMPTY_XML) })
  await assert.rejects(
    () => provider.search({ query: 'q', maxResults: 5 }),
    (err: unknown) => err instanceof SearchProviderError && err.kind === 'unavailable',
  )
})

test('rss: missing feed URL reports unavailable rather than fabricating', async () => {
  const provider = createRssProvider({})
  await assert.rejects(
    () => provider.search({ query: 'q', maxResults: 5 }),
    (err: unknown) => err instanceof SearchProviderError && err.kind === 'unavailable',
  )
})

test('rss: filters items by query terms', async () => {
  const provider = createRssProvider({ feedUrl: 'https://news.example.com/rss', fetchImpl: async () => xmlOk(RSS_XML) })
  const result = await provider.search({ query: 'equity', maxResults: 5 })
  assert.equal(result.results.length, 1)
  assert.equal(result.results[0].title, 'Equity markets steady')
})

test('rss: merges multiple feeds and an empty/failing feed never sinks the others', async () => {
  const feeds: Record<string, string> = {
    'https://a.example.com/rss': RSS_XML,
    'https://b.example.com/rss': ATOM_XML,
    'https://c.example.com/rss': EMPTY_XML,
    'https://d.example.com/rss': 'not-xml-at-all',
  }
  const fetchImpl = async (url: string) => {
    if (url === 'https://d.example.com/rss') return xmlError(503)
    return xmlOk(feeds[url] ?? EMPTY_XML)
  }
  const provider = createRssProvider({ feedUrls: ['https://a.example.com/rss', 'https://b.example.com/rss', 'https://c.example.com/rss', 'https://d.example.com/rss'], fetchImpl })
  const result = await provider.search({ query: 'oil gold', maxResults: 10 })
  const titles = result.results.map((r) => r.title)
  assert.ok(titles.includes('Oil rises on supply concerns'), 'RSS feed A items present')
  assert.ok(titles.includes('Gold slips on stronger dollar'), 'Atom feed B items present despite feed C being empty and feed D failing')
})

test('rss: comma-separated feedUrl is treated as multiple feeds', async () => {
  const fetchImpl = async (url: string) => xmlOk(url.includes('atom') ? ATOM_XML : RSS_XML)
  const provider = createRssProvider({ feedUrl: 'https://a.example.com/rss,https://b.example.com/atom', fetchImpl })
  const result = await provider.search({ query: 'oil gold', maxResults: 10 })
  assert.equal(result.results.length, 2)
})

// --- Factory ----------------------------------------------------------------

test('factory: creates the configured provider seam', () => {
  const tavily = createWebSearchProvider({ provider: 'tavily', apiKey: 'k', fetchImpl: async () => jsonOk({ results: [] }) })
  assert.equal(tavily.name, 'tavily')
  const brave = createWebSearchProvider({ provider: 'brave', apiKey: 'k', fetchImpl: async () => jsonOk({ web: { results: [] } }) })
  assert.equal(brave.name, 'brave')
  const rss = createWebSearchProvider({ provider: 'rss', baseUrl: 'https://news.example.com/rss', fetchImpl: async () => jsonOk({ results: [] }) })
  assert.equal(rss.name, 'rss')
  assert.equal(isSupportedSearchProvider('tavily'), true)
  assert.equal(isSupportedSearchProvider('brave'), true)
  assert.equal(isSupportedSearchProvider('rss'), true)
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

// --- RSS cross-feed deduplication -------------------------------------------

const DUP_XML_A = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Oil rises on supply concerns</title><link>https://a.example.com/oil</link><description>Prices climbed.</description><pubDate>Mon, 20 Aug 2026 10:00:00 GMT</pubDate></item></channel></rss>`
const DUP_XML_B = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Oil rises on supply concerns</title><link>https://b.example.com/oil</link><description>Prices climbed.</description><pubDate>Mon, 20 Aug 2026 09:00:00 GMT</pubDate></item></channel></rss>`

test('rss: cross-feed deduplication merges equivalent headlines from different feeds', async () => {
  const fetchImpl = async (url: string) => url.includes('a') ? xmlOk(DUP_XML_A) : xmlOk(DUP_XML_B)
  const provider = createRssProvider({
    feedUrls: ['https://a.example.com/rss', 'https://b.example.com/rss'],
    fetchImpl,
  })
  const result = await provider.search({ query: 'oil', maxResults: 10 })
  assert.equal(result.results.length, 1, 'duplicate headline merged across feeds')
  assert.equal(result.results[0].url, 'https://a.example.com/oil', 'first occurrence wins')
})

test('rss: cross-feed deduplication keeps the freshest report', async () => {
  const fetchImpl = async (url: string) => url.includes('a') ? xmlOk(DUP_XML_A) : xmlOk(DUP_XML_B)
  const provider = createRssProvider({
    feedUrls: ['https://a.example.com/rss', 'https://b.example.com/rss'],
    fetchImpl,
  })
  const result = await provider.search({ query: 'oil', maxResults: 10 })
  assert.equal(result.results.length, 1)
})
