// ---------------------------------------------------------------------------
// Phase 3C.1 — Web search evidence layer: normalization, dedupe, budget
//
// Pure, deterministic functions that turn untrusted provider output into
// validated WebSearchResult evidence. Shared by the server-side adapters
// (through finalizeSearchResults) and referenced by the client orchestrator
// for defensive source checks. No network, no secrets.
//
// Honesty rules enforced here (locked decision 7):
//   - A result without a valid http(s) URL is DROPPED — it cannot be cited.
//   - publishedAt is kept ONLY when the provider returned a parseable date.
//   - Snippets/titles are the provider's own text, bounded to approved caps.
//   - The evidence budget (<=12,000 chars) truncates, never invents.
// ---------------------------------------------------------------------------

import type { RawSearchResult, SearchProviderId, WebSearchResult } from './types'
import { WEBSEARCH_LIMITS } from './limits'

export interface NormalizedRaw {
  results: WebSearchResult[]
  /** Items dropped because they were not usable evidence. */
  dropped: number
}

/**
 * Normalize ONE raw provider item into a valid WebSearchResult, or null when
 * it cannot be cited honestly (bad/missing URL, no content at all).
 */
export function normalizeRawResult(raw: RawSearchResult, provider: SearchProviderId): WebSearchResult | null {
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, WEBSEARCH_LIMITS.maxTitleChars) : ''
  const rawUrl = typeof raw.url === 'string' ? raw.url.trim() : ''
  const snippet = (typeof raw.snippet === 'string' ? raw.snippet : '').trim().slice(0, WEBSEARCH_LIMITS.maxSnippetChars)

  if (!rawUrl || rawUrl.length > WEBSEARCH_LIMITS.maxUrlChars) return null
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!parsed.hostname) return null

  // No content at all is not evidence.
  if (!title && !snippet) return null

  let publishedAt: string | null = null
  if (typeof raw.publishedAt === 'string' && raw.publishedAt.trim().length > 0) {
    const t = Date.parse(raw.publishedAt.trim())
    if (Number.isFinite(t)) publishedAt = new Date(t).toISOString()
  }

  return {
    title,
    url: rawUrl,
    snippet,
    source: parsed.hostname.replace(/^www\./, '').toLowerCase(),
    publishedAt,
    provider,
  }
}

/** Dedupe key: same host + path + search, ignoring hash and case. */
function dedupeKey(r: WebSearchResult): string {
  try {
    const parsed = new URL(r.url)
    parsed.hash = ''
    parsed.hostname = parsed.hostname.toLowerCase()
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return r.url
  }
}

export interface DedupeOutput {
  results: WebSearchResult[]
  /** Count of later duplicates removed. */
  deduplicated: number
}

/** Remove later duplicates (first occurrence wins) — order preserved. */
export function dedupeResults(results: WebSearchResult[]): DedupeOutput {
  const seen = new Set<string>()
  const out: WebSearchResult[] = []
  let deduplicated = 0
  for (const r of results) {
    const key = dedupeKey(r)
    if (seen.has(key)) {
      deduplicated += 1
      continue
    }
    seen.add(key)
    out.push(r)
  }
  return { results: out, deduplicated }
}

export interface TruncateOutput {
  results: WebSearchResult[]
  /** True when results were cut to fit the budget. */
  truncated: boolean
}

/**
 * Keep results while their cumulative evidence (title + url + snippet) stays
 * within the approved per-search budget (12,000 chars).
 */
export function truncateEvidence(
  results: WebSearchResult[],
  maxChars: number = WEBSEARCH_LIMITS.maxEvidenceChars,
): TruncateOutput {
  const out: WebSearchResult[] = []
  let used = 0
  for (const r of results) {
    const size = r.title.length + r.url.length + r.snippet.length
    if (out.length > 0 && used + size > maxChars) break
    if (used + size > maxChars) break
    out.push(r)
    used += size
  }
  return { results: out, truncated: out.length < results.length }
}

/** Normalize all raw items, then dedupe, then apply the evidence budget. */
export function finalizeSearchResults(
  raw: RawSearchResult[],
  opts: { provider: SearchProviderId; maxResults: number },
): { results: WebSearchResult[]; totalResults: number; truncated: boolean; dropped: number; deduplicated: number } {
  const normalized: WebSearchResult[] = []
  let dropped = 0
  for (const item of raw) {
    const r = normalizeRawResult(item, opts.provider)
    if (r === null) dropped += 1
    else normalized.push(r)
  }

  const deduped = dedupeResults(normalized)
  const bounded = deduped.results.slice(0, opts.maxResults)
  const { results, truncated } = truncateEvidence(bounded)

  return {
    results,
    totalResults: bounded.length,
    truncated,
    dropped,
    deduplicated: deduped.deduplicated,
  }
}