// Free-first RSS/Atom provider. It fetches documented feed XML only; it never
// scrapes article pages. Query terms filter the feed items locally.
//
// Supports both RSS 2.0 (<item>) and Atom (<entry>) documents, an arbitrary
// number of feeds (fetched in parallel; one failing feed never sinks the
// others), and defends against malformed/empty feeds. A curated set of public,
// legitimate RSS/Atom endpoints is exported for zero-paid-key configuration.
//
// Phase 3 improvements: cross-feed deduplication (same story from different
// feeds is merged), recency filtering, deterministic relevance scoring, and
// source-quality weighting.

import type { RawSearchResult, SearchProviderRequest, SearchProviderResult, WebSearchProvider } from '../types'
import { SearchProviderError } from './errors'
import type { FetchLike } from './tavily'

const PUNCT_RE = /[^\p{L}\p{N}\s]/gu
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .trim()
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return match ? decode(match[1]).replace(/<[^>]+>/g, '').trim() : ''
}

function link(block: string): string {
  const atom = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)
  if (atom) return decode(atom[1])
  return tag(block, 'link') || tag(block, 'guid')
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(PUNCT_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDate(publishedAt: string | undefined): number {
  if (!publishedAt) return 0
  const t = Date.parse(publishedAt)
  return Number.isFinite(t) ? t : 0
}

const MAJOR_NEWS_HOSTS = new Set<string>([
  'reuters.com',
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  'cnbc.com',
  'bbc.com',
  'bbc.co.uk',
  'cnn.com',
  'apnews.com',
  'afr.com',
  'economist.com',
  'forbes.com',
  'barron.com',
  'marketwatch.com',
  'investing.com',
  'livemint.com',
  'economictimes.indiatimes.com',
  'business-standard.com',
  'moneycontrol.com',
  'thehindu.com',
  'hindustantimes.com',
  'financialexpress.com',
  'ndtv.com',
  'timesofindia.indiatimes.com',
  'indianexpress.com',
  'theguardian.com',
  'npr.org',
  'latimes.com',
  'nytimes.com',
])

function sourceTier(url: string): 'major' | 'other' {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    return MAJOR_NEWS_HOSTS.has(hostname) ? 'major' : 'other'
  } catch {
    return 'other'
  }
}

/**
 * Curated, public RSS/Atom endpoints — government, central banks and major
 * financial-news outlets. No API key, no scraping. Listed as comma-separated
 * values in FINOVA_WEB_SEARCH_BASE_URL when provider=rss; only the hostnames
 * matter for evidence. Feeds are public and subject to the owners' own
 * availability — the provider degrades gracefully if any of them is down.
 */
export const CURATED_RSS_FEEDS: readonly string[] = [
  // --- Official / government / central banks (no key) ---
  'https://www.ecb.europa.eu/rss/html/indexen.xml',
  'https://www.federalreserve.gov/feeds/press_all.xml',
  'https://www.imf.org/en/News/rss',
  'https://www.rbi.org.in/Scripts/RSSFeed.aspx?url=https://www.rbi.org.in/scripts/BS_PressReleaseDisplay.aspx',
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=10-K&dateb=&owner=include&count=40&output=atom',
  'https://www.eia.gov/rss/testpin.xml',
  // --- Major financial-news outlets (no key) ---
  'https://feeds.bloomberg.com/markets/news.rss',
  'https://www.cnbc.com/id/100003114/device/rss/rss.html',
  'https://www.marketwatch.com/rss/topstories',
  'https://www.investing.com/rss/news.rss',
  'https://economictimes.indiatimes.com/rssfeeds/1977021501.cms',
  'https://www.livemint.com/rss/news',
  'https://www.moneycontrol.com/rss/frontpage.xml',
]

/** Resolve the configured feed URLs from either a single or comma-joined value plus an explicit array. */
export function resolveRssFeedUrls(options: { feedUrl?: string; feedUrls?: string[] }): string[] {
  const urls: string[] = []
  if (options.feedUrl) {
    for (const part of options.feedUrl.split(',')) {
      const trimmed = part.trim()
      if (trimmed.length > 0) urls.push(trimmed)
    }
  }
  if (options.feedUrls) {
    for (const u of options.feedUrls) {
      const trimmed = u.trim()
      if (trimmed.length > 0) urls.push(trimmed)
    }
  }
  return [...new Set(urls)]
}

/** Split the XML into <item>|<entry> inner blocks regardless of namespace prefix. */
function extractBlocks(xml: string): string[] {
  const parts = xml.split(/<(?:[\w]+:)?(item|entry)(?:\s[^>]*)?>/i)
  const blocks: string[] = []
  for (let i = 1; i < parts.length; i += 2) {
    const tagName = (parts[i] ?? 'item').toLowerCase()
    const content = parts[i + 1] ?? ''
    const inner = content.split(new RegExp(`</(?:[\\w]+:)?${tagName}>`, 'i'))[0] ?? ''
    if (inner.length > 0) blocks.push(inner)
  }
  return blocks
}

/** Parse one feed document into raw evidence items (empty when malformed). */
function parseFeed(xml: string): RawSearchResult[] {
  const blocks = extractBlocks(xml)
  const items: RawSearchResult[] = []
  for (const block of blocks) {
    const title = tag(block, 'title')
    if (!title) continue
    const url = link(block)
    const snippet = tag(block, 'description') || tag(block, 'summary') || tag(block, 'content:encoded') || tag(block, 'content')
    const publishedAt = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date')
    items.push({ title, url, snippet, publishedAt })
  }
  return items
}

async function fetchFeed(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
  maxPerFeed: number,
): Promise<RawSearchResult[]> {
  try {
    const signal =
      typeof AbortController !== 'undefined' && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(Math.max(1_000, timeoutMs))
        : undefined
    const response = (await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      ...(signal ? { signal } : {}),
    })) as unknown as { ok: boolean; status: number; text?: () => Promise<string>; json(): Promise<unknown> }
    if (!response.ok) return []
    const xml = response.text ? await response.text() : String(await response.json())
    if (typeof xml !== 'string' || xml.length === 0) return []
    return parseFeed(xml).slice(0, maxPerFeed)
  } catch {
    // One unavailable/unknown feed must not sink the others.
    return []
  }
}

/**
 * Cross-feed deduplication: merge equivalent headlines from different feeds.
 * The first occurrence wins; later duplicates are dropped. Items are sorted
 * by recency (newest first) before deduping so the freshest report wins.
 */
function dedupeAcrossFeeds(items: RawSearchResult[]): RawSearchResult[] {
  const sorted = [...items].sort((a, b) => parseDate(typeof b.publishedAt === 'string' ? b.publishedAt : undefined) - parseDate(typeof a.publishedAt === 'string' ? a.publishedAt : undefined))
  const seen = new Map<string, RawSearchResult>()
  for (const item of sorted) {
    const title = typeof item.title === 'string' ? item.title : ''
    const key = normalizeTitle(title)
    if (key.length === 0) {
      const url = typeof item.url === 'string' ? item.url : `no-url-${seen.size}`
      seen.set(url, item)
      continue
    }
    if (seen.has(key)) continue
    seen.set(key, item)
  }
  return [...seen.values()].sort((a, b) => parseDate(typeof b.publishedAt === 'string' ? b.publishedAt : undefined) - parseDate(typeof a.publishedAt === 'string' ? a.publishedAt : undefined))
}

function withinRecency(item: RawSearchResult, recencyDays: number | undefined): boolean {
  if (recencyDays === undefined || recencyDays === null) return true
  const maxAge = recencyDays * DAY_MS
  const published = parseDate(typeof item.publishedAt === 'string' ? item.publishedAt : undefined)
  if (published === 0) return true
  return Date.now() - published <= maxAge
}

function matchesDomain(item: RawSearchResult, domainFilter: string | undefined): boolean {
  if (!domainFilter) return true
  try {
    return new URL(item.url as string).hostname.replace(/^www\./, '').toLowerCase() === domainFilter.toLowerCase()
  } catch {
    return false
  }
}

const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'before', 'being', 'from',
  'have', 'into', 'just', 'last', 'more', 'most', 'news', 'over', 'than',
  'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'under', 'very', 'were', 'what', 'when', 'where', 'which',
  'while', 'will', 'with', 'would', 'your', 'market', 'markets',
])

function subjectTokens(query: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const word of query.toLowerCase().split(/[^a-z0-9]+/i)) {
    if (word.length >= 3 && !STOPWORDS.has(word) && !seen.has(word)) {
      seen.add(word)
      out.push(word)
    }
  }
  return out
}

function relevanceScore(item: RawSearchResult, tokens: string[]): number {
  let score = 0
  for (const token of tokens) {
    const title = String(item.title ?? '').toLowerCase()
    const snippet = String(item.snippet ?? '').toLowerCase()
    if (title.includes(token)) score += 4
    if (snippet.includes(token)) score += 1
    const regex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (regex.test(title)) score += 2
    if (regex.test(snippet)) score += 1
  }
  return score
}

export interface RssProviderOptions {
  /** A single feed URL or a comma-separated list of feed URLs. */
  feedUrl?: string
  /** Explicit array form of the feed URLs (combined with feedUrl). */
  feedUrls?: string[]
  timeoutMs?: number
  fetchImpl?: FetchLike
}

export function createRssProvider(options: RssProviderOptions): WebSearchProvider {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike)
  const timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 15_000
  const feeds = resolveRssFeedUrls(options)
  const maxPerFeed = 50

  return {
    name: 'rss',
    async search(request: SearchProviderRequest): Promise<SearchProviderResult> {
      if (feeds.length === 0) {
        throw new SearchProviderError('unavailable', 'The RSS provider has no configured feed URLs.')
      }

      const settled = await Promise.allSettled(feeds.map((url) => fetchFeed(url, fetchImpl, timeoutMs, maxPerFeed)))
      const raw: RawSearchResult[] = []
      for (const result of settled) {
        if (result.status === 'fulfilled') raw.push(...result.value)
      }

      if (raw.length === 0) {
        throw new SearchProviderError('unavailable', 'All configured RSS feeds were empty or unavailable.')
      }

      // Cross-feed deduplication: same story from different feeds is merged,
      // keeping the freshest occurrence.
      const deduped = dedupeAcrossFeeds(raw)

      // Deterministic relevance scoring + recency + source-quality filtering.
      const tokens = subjectTokens(request.query)
      const maxAge = request.recencyDays !== undefined ? request.recencyDays * DAY_MS : undefined
      const now = Date.now()
      const scored = deduped
        .filter((item) => withinRecency(item, request.recencyDays))
        .filter((item) => matchesDomain(item, request.domainFilter))
        .map((item) => {
          const relScore = tokens.length > 0 ? relevanceScore(item, tokens) : 0
          if (relScore === 0 && tokens.length > 0) return { item, score: 0, relevant: false }
          const published = parseDate(typeof item.publishedAt === 'string' ? item.publishedAt : undefined)
          const ageMs = published === 0 ? Infinity : now - published
          const recencyScore = published === 0 ? 0 : Math.max(0, 1 - ageMs / (maxAge ?? 7 * DAY_MS))
          const tierScore = sourceTier(String(item.url ?? '')) === 'major' ? 1000 : 0
          return { item, score: relScore + recencyScore + tierScore, relevant: true }
        })
        .filter((s) => tokens.length === 0 || s.relevant)
        .sort((a, b) => b.score - a.score)

      return { results: scored.slice(0, request.maxResults).map((s) => s.item) }
    },
  }
}
