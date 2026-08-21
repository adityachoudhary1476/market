// ---------------------------------------------------------------------------
// Phase 3N.1 — Live Intelligence: deterministic news processing tests
//
// These lock in the news layer's honesty and determinism WITHOUT a live LLM or
// provider:
//   - the query builder composes bounded, natural news queries from a subject;
//   - freshness tiers derive ONLY from real publishedAt values (never text);
//   - source tiers come from a curated, documented major-outlet list;
//   - story clustering merges independent reports of the same story and counts
//     corroboration;
//   - relevance filtering drops clearly-irrelevant items only when a relevant
//     item exists (never empties the answer on a strict filter);
//   - everything produced remains a validated WebSearchResult (no fabrication).
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNewsQuery,
  classifyNewsFreshness,
  tierNewsSource,
  clusterNewsStories,
  normalizeStoryKey,
  rankNewsRelevance,
  subjectTokens,
  processNewsResults,
  NEWS_LIMITS,
} from '../news'
import type { NewsItem, WebSearchResult } from '../types'

const NOW = 1_720_000_000_000
const HOUR = 3_600_000

function result(url: string, title: string, publishedAt: string | null = null, snippet = 'Body text.'): WebSearchResult {
  return { title, url, snippet, source: new URL(url).hostname.replace(/^www\./, ''), publishedAt, provider: 'tavily' }
}

function item(url: string, title: string, publishedAt: string | null = null): NewsItem {
  const r = result(url, title, publishedAt)
  return { ...r, subject: 'subject', freshness: classifyNewsFreshness(publishedAt, NOW), sourceTier: 'other', corroboratedBy: 1, relevant: true }
}

function iso(hoursAgo: number): string {
  return new Date(NOW - hoursAgo * HOUR).toISOString()
}

// --- §26.1 Query builder ----------------------------------------------------

test('news: buildNewsQuery composes a bounded, natural news query', () => {
  const b = buildNewsQuery('RBI interest rate decision')
  assert.ok(b.ok)
  if (!b.ok) return
  assert.equal(b.query.query, 'RBI interest rate decision news')
  assert.equal(b.query.maxResults, NEWS_LIMITS.defaultResults)
  assert.equal(b.query.recencyDays, NEWS_LIMITS.defaultAgeDays)
  assert.equal(b.region, null)
})

test('news: buildNewsQuery maps region hints to natural words', () => {
  const inQ = buildNewsQuery('RBI', { region: 'in' })
  assert.ok(inQ.ok && inQ.query.query.includes('India'))
  const usQ = buildNewsQuery('Fed', { region: 'us' })
  assert.ok(usQ.ok && usQ.query.query.includes('United States'))
  const gQ = buildNewsQuery('markets', { region: 'global' })
  assert.ok(gQ.ok && !gQ.query.query.includes('India') && !gQ.query.query.includes('United States'))
})

test('news: buildNewsQuery respects the freshness window and result cap', () => {
  const b = buildNewsQuery('oil', { maxAgeDays: 2, maxResults: 3 })
  assert.ok(b.ok)
  if (!b.ok) return
  assert.equal(b.query.recencyDays, 2)
  assert.equal(b.query.maxResults, 3)
})

test('news: buildNewsQuery rejects out-of-range inputs instead of clamping', () => {
  assert.equal(buildNewsQuery('').ok, false)
  assert.equal(buildNewsQuery(123 as never).ok, false)
  assert.equal(buildNewsQuery('x'.repeat(201)).ok, false)
  assert.equal(buildNewsQuery('oil', { region: 'eu' as never }).ok, false)
  assert.equal(buildNewsQuery('oil', { maxResults: 0 }).ok, false)
  assert.equal(buildNewsQuery('oil', { maxResults: 9 }).ok, false)
  assert.equal(buildNewsQuery('oil', { maxAgeDays: 0 }).ok, false)
  assert.equal(buildNewsQuery('oil', { maxAgeDays: 31 }).ok, false)
  assert.equal(buildNewsQuery('oil', { maxResults: 2.5 }).ok, false)
})

// --- §26.2 Freshness tiers --------------------------------------------------

test('news: freshness tiers derive only from real publishedAt values', () => {
  assert.equal(classifyNewsFreshness(iso(1), NOW), 'breaking')
  assert.equal(classifyNewsFreshness(iso(12), NOW), 'today')
  assert.equal(classifyNewsFreshness(iso(3 * 24), NOW), 'recent')
  assert.equal(classifyNewsFreshness(iso(10 * 24), NOW), 'older')
  assert.equal(classifyNewsFreshness(null, NOW), 'unknown')
  assert.equal(classifyNewsFreshness('not a date', NOW), 'unknown')
})

// --- §26.3 Source tiers -----------------------------------------------------

test('news: source tiers use the curated major-outlet list', () => {
  assert.equal(tierNewsSource('reuters.com'), 'major')
  assert.equal(tierNewsSource('www.reuters.com'), 'major')
  assert.equal(tierNewsSource('moneycontrol.com'), 'major')
  assert.equal(tierNewsSource('example.com'), 'other')
  assert.equal(tierNewsSource('', ), 'other')
})

// --- §26.4 Story clustering / corroboration --------------------------------

test('news: identical stories merge and count corroboration', () => {
  const { items } = clusterNewsStories([item('https://reuters.com/a', 'RBI holds rates steady'), item('https://moneycontrol.com/b', 'RBI holds rates steady')])
  assert.equal(items.length, 1)
  assert.equal(items[0].corroboratedBy, 2)
})

test('news: common same-day catalyst paraphrases merge', () => {
  const day = iso(1)
  const { items } = clusterNewsStories([
    item('https://reuters.com/1', 'Oil rises on supply concerns', day),
    item('https://cnbc.com/2', 'Crude climbs amid supply fears', day),
  ])
  assert.equal(items.length, 1)
  assert.equal(items[0].corroboratedBy, 2)
})

test('news: distinct stories stay separate', () => {
  const { items, clusters } = clusterNewsStories([item('https://reuters.com/a', 'RBI holds rates steady'), item('https://reuters.com/b', 'Oil climbs on supply concerns')])
  assert.equal(items.length, 2)
  assert.equal(clusters, 2)
  assert.equal(items[0].corroboratedBy, 1)
})

test('news: normalized story keys are punctuation/case insensitive', () => {
  assert.equal(normalizeStoryKey('RBI Holds Rates!'), normalizeStoryKey('rbi holds rates'))
})

// --- §26.5 Relevance --------------------------------------------------------

test('news: relevance ranks subject-matching items first and drops clear misses', () => {
  const { items: ranked, relevantFiltered } = rankNewsRelevance(
    [item('https://a.com/1', 'RBI holds rates steady', iso(1)), item('https://b.com/2', 'Weather forecast for Sunday', iso(2))],
    'RBI interest rate',
  )
  assert.equal(relevantFiltered, 1)
  assert.equal(ranked.length, 1)
  assert.ok(ranked[0].title.includes('RBI'))
})

test('news: relevance never empties the answer when nothing matches', () => {
  const { items: ranked, relevantFiltered } = rankNewsRelevance(
    [item('https://a.com/1', 'Weather forecast for Sunday', iso(1))],
    'RBI interest rate',
  )
  assert.equal(relevantFiltered, 0)
  assert.equal(ranked.length, 1)
})

test('news: subjectTokens strips stopwords and short words', () => {
  assert.deepEqual(subjectTokens('Federal Reserve policy news'), ['federal', 'reserve', 'policy'])
  assert.deepEqual(subjectTokens('news on the market RBI'), [], 'short words and stopwords do not qualify')
})

// --- §26.6 End-to-end pipeline ---------------------------------------------

test('news: processNewsResults produces honest, bounded evidence', () => {
  const raw = [
    result('https://reuters.com/a', 'RBI holds rates steady', iso(2)),
    result('https://moneycontrol.com/b', 'RBI holds rates steady', iso(3)),
    result('https://bbc.com/c', 'RBI holds rates steady', iso(40)),
    result('https://weather.com/d', 'Sunday weather forecast', iso(1)),
  ]
  const evidence = processNewsResults(raw, { subject: 'RBI interest rate decision', maxItems: 3, now: NOW })
  assert.equal(evidence.subject, 'RBI interest rate decision')
  assert.equal(evidence.region, null)
  assert.equal(evidence.totalItems, 1, 'one story survives relevance filtering')
  assert.equal(evidence.items.length, 1)
  assert.equal(evidence.truncated, false)
  assert.equal(evidence.relevantFiltered, 1, 'the weather item is filtered as irrelevant')
  const rbi = evidence.items.find((i) => i.url === 'https://reuters.com/a')
  assert.ok(rbi, 'the corroborated story is present')
  assert.equal(rbi!.corroboratedBy, 3, 'three outlets independently reported the story')
  assert.equal(rbi!.freshness, 'breaking', 'the freshest report of the story drives its tier')
  assert.equal(rbi!.sourceTier, 'major')
  assert.ok(rbi!.url.startsWith('https://'), 'items keep validated URLs')
})

test('news: dated stories outside the requested window are excluded', () => {
  const evidence = processNewsResults(
    [item('https://reuters.com/fresh', 'RBI holds rates steady', iso(2)), item('https://cnbc.com/old', 'RBI holds rates steady', iso(10))],
    { subject: 'RBI interest rate', maxAgeDays: 7, now: NOW },
  )
  assert.equal(evidence.items.length, 1)
  assert.equal(evidence.items[0].url, 'https://reuters.com/fresh')
})

test('news: processNewsResults bounds stories, not raw articles', () => {
  const raw = [1, 2, 3, 4, 5].map((n) => result(`https://a.com/${n}`, `Story ${n}`, iso(n)))
  const evidence = processNewsResults(raw, { subject: 'stories', maxItems: 2, now: NOW })
  assert.equal(evidence.items.length, 2)
  assert.equal(evidence.truncated, true)
})

test('news: approved news limits are stable', () => {
  assert.equal(NEWS_LIMITS.maxNewsPerSession, 4)
  assert.equal(NEWS_LIMITS.maxResults, 8)
  assert.equal(NEWS_LIMITS.defaultAgeDays, 7)
})