// ---------------------------------------------------------------------------
// Phase 3N.1 — Live Intelligence: deterministic news processing layer
//
// CLIENT-SAFE, pure, no network. This module turns the SAME validated
// provider output the searchWeb tool uses into processed news evidence:
//   - a deterministic query builder (the model names a subject, the module
//     builds a bounded, natural news query — never a free-text query hacks);
//   - freshness tiers derived ONLY from real provider publishedAt values
//     (never guessed from "hours ago" strings, never invented);
//   - source quality tiers from the item's real hostname (a curated,
//     documented list of major financial-news outlets);
//   - story clustering: independent articles with the same normalized title
//     are merged into ONE story, and corroboratedBy counts how many outlets
//     independently report it ("reported" vs "confirmed by N outlets");
//   - relevance ranking: results that clearly do not match the subject are
//     dropped only when at least one relevant result exists (never silently
//     replaced, never invented).
//
// Honesty rules are inherited from the web-search evidence layer: every item
// remains a validated WebSearchResult (real URL, real snippet, real or null
// publishedAt) — nothing here fabricates evidence.
// ---------------------------------------------------------------------------

import type {
  NewsEvidence,
  NewsFreshness,
  NewsItem,
  NewsSourceTier,
  WebSearchQuery,
  WebSearchResult,
} from './types'
import { WEBSEARCH_LIMITS } from './limits'

// --- Approved news limits (authoritative, mirror of the tool schema) --------

export const NEWS_LIMITS = {
  /** Subject length cap (the model names the subject, the module queries). */
  maxSubjectChars: 200,
  minSubjectChars: 1,
  /** Results per news request (same approved bound as web search). */
  maxResults: WEBSEARCH_LIMITS.maxResults,
  minResults: WEBSEARCH_LIMITS.minResults,
  defaultResults: 5,
  /** Freshness window: how many days back the news query reaches. */
  maxAgeDays: 30,
  minAgeDays: 1,
  defaultAgeDays: 7,
  /** News requests per agent session (approved). */
  maxNewsPerSession: 4,
} as const

export type NewsRegion = 'in' | 'us' | 'global'

/** Region hint -> natural words appended to the news query. */
const REGION_WORDS: Record<NewsRegion, string> = {
  in: 'India',
  us: 'United States',
  global: '',
}

/**
 * Curated list of major financial-news outlets (source tiering). Deterministic
 * and documented: an outlet either is on the list or is tiered "other".
 * Hostnames are matched without the www. prefix, lowercased.
 */
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

// --- Query builder ----------------------------------------------------------

export interface BuildNewsQueryOptions {
  region?: string | null
  maxResults?: number
  maxAgeDays?: number
}

export type NewsQueryBuild =
  | { ok: true; query: WebSearchQuery; region: NewsRegion | null; maxAgeDays: number }
  | { ok: false; error: string }

/**
 * Build the validated WebSearchQuery for a news subject. Deterministic and
 * bounded: the model supplies a subject (and optional region/freshness
 * window); the module composes the natural query and clamps nothing silently —
 * out-of-range inputs are rejected so the model learns the real limits.
 */
export function buildNewsQuery(subject: unknown, options: BuildNewsQueryOptions = {}): NewsQueryBuild {
  const rawSubject = typeof subject === 'string' ? subject.trim() : ''
  if (rawSubject.length < NEWS_LIMITS.minSubjectChars || rawSubject.length > NEWS_LIMITS.maxSubjectChars) {
    return { ok: false, error: `"subject" must be between ${NEWS_LIMITS.minSubjectChars} and ${NEWS_LIMITS.maxSubjectChars} characters.` }
  }

  let region: NewsRegion | null = null
  if (options.region !== undefined && options.region !== null) {
    const raw = String(options.region).trim().toLowerCase()
    if (raw !== 'in' && raw !== 'us' && raw !== 'global') {
      return { ok: false, error: '"region" must be one of "in", "us" or "global".' }
    }
    region = raw
  }

  let maxResults: number = NEWS_LIMITS.defaultResults
  if (options.maxResults !== undefined && options.maxResults !== null) {
    if (typeof options.maxResults !== 'number' || !Number.isInteger(options.maxResults)) {
      return { ok: false, error: '"maxResults" must be an integer.' }
    }
    if (options.maxResults < NEWS_LIMITS.minResults || options.maxResults > NEWS_LIMITS.maxResults) {
      return { ok: false, error: `"maxResults" must be between ${NEWS_LIMITS.minResults} and ${NEWS_LIMITS.maxResults}.` }
    }
    maxResults = options.maxResults
  }

  let maxAgeDays: number = NEWS_LIMITS.defaultAgeDays
  if (options.maxAgeDays !== undefined && options.maxAgeDays !== null) {
    if (typeof options.maxAgeDays !== 'number' || !Number.isInteger(options.maxAgeDays)) {
      return { ok: false, error: '"maxAgeDays" must be an integer.' }
    }
    if (options.maxAgeDays < NEWS_LIMITS.minAgeDays || options.maxAgeDays > NEWS_LIMITS.maxAgeDays) {
      return { ok: false, error: `"maxAgeDays" must be between ${NEWS_LIMITS.minAgeDays} and ${NEWS_LIMITS.maxAgeDays}.` }
    }
    maxAgeDays = options.maxAgeDays
  }

  const regionWord = region ? REGION_WORDS[region] : ''
  const query = `${rawSubject}${regionWord ? ` ${regionWord}` : ''} news`
  return {
    ok: true,
    region,
    maxAgeDays,
    query: {
      query,
      maxResults,
      recencyDays: Math.max(NEWS_LIMITS.minAgeDays, maxAgeDays),
    },
  }
}

// --- Freshness --------------------------------------------------------------

const HOUR = 3_600_000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/**
 * Deterministic freshness classification from a REAL publishedAt timestamp.
 * Unknown -> null/absent date; never inferred from text ("yesterday" claims).
 */
export function classifyNewsFreshness(publishedAt: string | null, now: number): NewsFreshness {
  if (publishedAt === null) return 'unknown'
  const t = Date.parse(publishedAt)
  if (!Number.isFinite(t)) return 'unknown'
  const age = now - t
  if (age < 0) return 'breaking'
  if (age < 6 * HOUR) return 'breaking'
  if (age < DAY) return 'today'
  if (age < WEEK) return 'recent'
  return 'older'
}

// --- Source tiering ---------------------------------------------------------

/** Deterministic source quality tier from the item's real hostname. */
export function tierNewsSource(hostname: string): NewsSourceTier {
  return MAJOR_NEWS_HOSTS.has(hostname.replace(/^www\./, '').toLowerCase()) ? 'major' : 'other'
}

// --- Story clustering -------------------------------------------------------

const PUNCT_RE = /[^\p{L}\p{N}\s]/gu

/** Normalized story key from a headline: lowercase, punctuation stripped. */
export function normalizeStoryKey(title: string): string {
  return title
    .toLowerCase()
    .replace(PUNCT_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Conservative event key for common financial headline paraphrases. */
export function normalizeEventKey(title: string): string {
  return normalizeStoryKey(title)
    .replace(/\b(crude|brent|prices?)\b/g, 'oil')
    .replace(/\b(rises?|rally|rallies|climbs?|gains?|surges?|advances?)\b/g, 'up')
    .replace(/\b(falls?|slides?|declines?|drops?|tumbles?|retreats?)\b/g, 'down')
    .replace(/\b(concerns?|fears?|worries?|anxiety)\b/g, 'concern')
    .replace(/\b(amid|on|as|the|a|an|market|price)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Cluster independent articles into stories. First occurrence wins; every
 * later article whose normalized title matches an existing story is folded
 * into it, incrementing corroboratedBy. Distinct stories keep their order.
 * Freshness/source tiers must already be set on the input items (computed
 * with the injected clock by processNewsResults).
 */
export function clusterNewsStories(rawItems: NewsItem[]): { items: NewsItem[]; clusters: number } {
  const storyOf = new Map<string, NewsItem>()
  const order: NewsItem[] = []
  for (const r of rawItems) {
    const day = r.publishedAt ? r.publishedAt.slice(0, 10) : 'unknown'
    const exact = normalizeStoryKey(r.title)
    const event = normalizeEventKey(r.title)
    const key = event !== exact ? `${event}|${day}` : exact
    if (key.length === 0) {
      order.push({ ...r })
      continue
    }
    const existing = storyOf.get(key)
    if (existing) {
      existing.corroboratedBy += 1
      continue
    }
    storyOf.set(key, r)
    order.push(r)
  }
  return { items: order, clusters: storyOf.size }
}

// --- Relevance --------------------------------------------------------------

const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'before', 'being', 'from',
  'have', 'into', 'just', 'last', 'more', 'most', 'news', 'over', 'than',
  'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'under', 'very', 'were', 'what', 'when', 'where', 'which',
  'while', 'will', 'with', 'would', 'your', 'market', 'markets',
])

/** Significant subject tokens: words of >=4 letters that are not stopwords. */
export function subjectTokens(subject: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const word of subject.toLowerCase().split(/[^a-z0-9]+/i)) {
    if (word.length >= 4 && !STOPWORDS.has(word) && !seen.has(word)) {
      seen.add(word)
      out.push(word)
    }
  }
  return out
}

/**
 * Relevance ranking: items that clearly do not match the subject are
 * demoted and dropped — but ONLY when at least one relevant item remains
 * (never leave the answer empty on a strict filter). Corroborated stories
 * and breaking/today items rank first among relevant results.
 *
 * Phase 3P — deterministic scoring considers:
 *   - exact word-boundary matches in the title (weighted highest)
 *   - word-boundary matches in the snippet
 *   - number of distinct query tokens that match
 *   - freshness tier (breaking > today > recent > older > unknown)
 *   - source quality tier (major > other)
 *   - corroboration (multiple independent outlets)
 */
export function rankNewsRelevance(items: NewsItem[], subject: string): { items: NewsItem[]; relevantFiltered: number } {
  const tokens = subjectTokens(subject)
  if (tokens.length === 0) return { items, relevantFiltered: 0 }

  const rankOrder: NewsFreshness[] = ['breaking', 'today', 'recent', 'older', 'unknown']
  const scored = items.map((item) => {
    const text = `${item.title ?? ''} ${item.snippet ?? ''}`.toLowerCase()
    let exactTitleMatches = 0
    let exactSnippetMatches = 0
    let partialMatches = 0
    for (const token of tokens) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const titleRegex = new RegExp(`\\b${escaped}\\b`, 'i')
      const snippetRegex = new RegExp(`\\b${escaped}\\b`, 'i')
      if (titleRegex.test(item.title ?? '')) exactTitleMatches += 1
      else if (snippetRegex.test(item.snippet ?? '')) exactSnippetMatches += 1
      else if (text.includes(token)) partialMatches += 1
    }
    const totalMatches = exactTitleMatches + exactSnippetMatches + partialMatches
    const relevant = totalMatches > 0
    const relevanceScore =
      exactTitleMatches * 12 +
      exactSnippetMatches * 6 +
      partialMatches * 1 +
      (item.corroboratedBy >= 2 ? 50 : 0) +
      (item.sourceTier === 'major' ? 20 : 0)
    const freshnessIndex = rankOrder.indexOf(item.freshness)
    const freshnessScore = Math.max(0, rankOrder.length - freshnessIndex) * 10
    return { item, relevant, score: relevanceScore + freshnessScore }
  })

  const relevant = scored.filter((s) => s.relevant)
  if (relevant.length === 0) {
    return { items, relevantFiltered: 0 }
  }

  relevant.sort((a, b) => b.score - a.score)
  return {
    items: relevant.map((s) => ({ ...s.item, relevant: true })),
    relevantFiltered: scored.length - relevant.length,
  }
}

// --- News item budget -------------------------------------------------------

/**
 * Bound the news items to the approved per-request story budget. Truncation
 * only removes items — it never fabricates.
 */
export function boundNewsItems(items: NewsItem[], maxItems: number): { items: NewsItem[]; truncated: boolean } {
  const bounded = items.slice(0, maxItems)
  return { items: bounded, truncated: bounded.length < items.length }
}

// --- Pipeline ---------------------------------------------------------------

export interface ProcessNewsOptions {
  subject: string
  region?: string | null
  /** Result cap applied AFTER clustering (stories, not raw articles). */
  maxItems?: number
  /** Wall clock for freshness classification (injected for determinism). */
  now?: number
  /** Drop dated results outside the requested freshness window. */
  maxAgeDays?: number
}

/**
 * The full deterministic news pipeline over ALREADY-VALIDATED transport
 * results (the orchestrator re-validates before calling). Every output item
 * is a real WebSearchResult with honest freshness/source-tier/corroboration
 * signals. Never fabricates; never invents dates or URLs.
 */
export function processNewsResults(
  results: WebSearchResult[],
  options: ProcessNewsOptions,
): Omit<NewsEvidence, 'query'> {
  const now = options.now ?? Date.now()
  const cutoff = options.maxAgeDays !== undefined ? now - options.maxAgeDays * DAY : null
  const freshResults = cutoff === null
    ? results
    : results.filter((r) => r.publishedAt === null || Date.parse(r.publishedAt) >= cutoff)
  const rawItems: NewsItem[] = freshResults.map((r) => ({
    ...r,
    subject: options.subject,
    freshness: classifyNewsFreshness(r.publishedAt, now),
    sourceTier: tierNewsSource(r.source),
    corroboratedBy: 1,
    relevant: true,
  }))
  const { items: clustered } = clusterNewsStories(rawItems)
  const { items: ranked, relevantFiltered } = rankNewsRelevance(clustered, options.subject)
  const { items, truncated } = boundNewsItems(ranked, options.maxItems ?? NEWS_LIMITS.defaultResults)

  return {
    subject: options.subject,
    region: options.region ?? null,
    items,
    totalItems: ranked.length,
    truncated,
    relevantFiltered,
  }
}
