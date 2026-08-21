import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRssProvider } from '../rss'

test('RSS provider parses feed items without an API key or page scraping', async () => {
  const provider = createRssProvider({
    feedUrl: 'https://example.com/feed.xml',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '<rss><channel><item><title><![CDATA[Oil rises on supply concerns]]></title><link>https://example.com/oil</link><description>Supply headline</description><pubDate>Thu, 21 Aug 2026 10:00:00 GMT</pubDate></item></channel></rss>',
    } as never),
  })
  const result = await provider.search({ query: 'oil', maxResults: 5 })
  assert.equal(result.results.length, 1)
  assert.equal(result.results[0].title, 'Oil rises on supply concerns')
  assert.equal(result.results[0].url, 'https://example.com/oil')
  assert.ok(result.results[0].publishedAt)
})
