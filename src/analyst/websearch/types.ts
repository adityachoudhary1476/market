// ---------------------------------------------------------------------------
// Phase 3C.1 — Web search evidence layer: core types
//
// CLIENT-SAFE module. Everything here is plain JSON-shaped data, constants and
// pure functions — no provider credentials, no fetch, no DOM, no secrets.
// It is the shared contract between:
//
//   - the searchWeb AnalystTool (browser)
//   - the WebSearchTransport client (browser)
//   - the /api/search gateway (server)
//   - the Tavily / Brave provider adapters (server)
//
// Honesty rules (locked decision 7):
//   - Results are ALWAYS real provider output, normalized and deduplicated.
//   - A result with no valid http(s) URL is dropped — it cannot be cited.
//   - publishedAt is null unless the provider actually returned a date;
//     it is never guessed, derived from "age" strings or invented.
//   - Snippets are the provider's own text, truncated to the approved limit.
// ---------------------------------------------------------------------------

export type SearchProviderId = 'tavily' | 'brave'

/** The validated, bounded query the LLM (via searchWeb) may send. */
export interface WebSearchQuery {
  /** 1..400 characters. */
  query: string
  /** 1..8 results (default 5). */
  maxResults?: number
  /** 1..3650 days of recency (optional). */
  recencyDays?: number
  /** At most ONE domain filter (e.g. "reuters.com"). */
  domainFilter?: string
}

/** A single normalized piece of search evidence. */
export interface WebSearchResult {
  /** Trimmed, bounded (<=200 chars). Never fabricated. */
  title: string
  /** Validated http(s) URL (<=2048 chars). Never fabricated. */
  url: string
  /** Provider text, trimmed to <=500 chars. Never fabricated. */
  snippet: string
  /** Hostname derived from the real URL (never invented). */
  source: string
  /** ISO timestamp when the provider returned one; null otherwise. */
  publishedAt: string | null
  /** Which provider adapter produced this result. */
  provider: SearchProviderId
}

/** The gateway / transport response shape. */
export interface WebSearchResponse {
  query: string
  provider: SearchProviderId
  results: WebSearchResult[]
  /** Valid results before the evidence budget cut (honest count). */
  totalResults: number
  /** True when results were cut to fit the evidence budget. */
  truncated: boolean
  /** True when served from the server-side cache. */
  cached?: boolean
  durationMs?: number
}

// --- Phase 3N.1 — Live news evidence ----------------------------------------

/**
 * Deterministic freshness classification of a news item (never guessed from
 * text — derived ONLY from a real provider-supplied publishedAt).
 */
export type NewsFreshness = 'breaking' | 'today' | 'recent' | 'older' | 'unknown'

/**
 * Deterministic source quality tier derived from the item's real hostname
 * (curated major financial-news outlets vs other domains).
 */
export type NewsSourceTier = 'major' | 'other'

/**
 * One processed live-news item. Everything a WebSearchResult guarantees still
 * holds (real URL, real title/snippet, real or null publishedAt), plus the
 * deterministic news signals: freshness tier, source tier and how many
 * independent articles were merged into this story (corroboration).
 */
export interface NewsItem extends WebSearchResult {
  /** The news subject this item was fetched for (carried for memory/UI). */
  subject: string
  freshness: NewsFreshness
  sourceTier: NewsSourceTier
  /**
   * Number of distinct articles merged into this story (>=1). >=2 means the
   * story is independently reported by multiple outlets.
   */
  corroboratedBy: number
  /** True when the item matched the requested subject (relevance filter). */
  relevant: boolean
}

/** The processed output of one news request (searchNews tool). */
export interface NewsEvidence {
  subject: string
  /** Normalized region hint, or null when none was requested. */
  region: string | null
  /** The validated query the transport actually ran. */
  query: WebSearchQuery
  items: NewsItem[]
  /** Items after dedupe/corpus accounting, before the news budget cut. */
  totalItems: number
  /** True when items were cut to fit the approved news budget. */
  truncated: boolean
  /** Items dropped as clearly irrelevant to the subject. */
  relevantFiltered: number
}

// --- Server-side provider contract (adapters) -------------------------------

/** A raw provider item BEFORE normalization — shape is not trusted. */
export interface RawSearchResult {
  title?: unknown
  url?: unknown
  snippet?: unknown
  publishedAt?: unknown
}

export interface SearchProviderRequest {
  query: string
  maxResults: number
  /** Optional recency in days (mapped to the provider's own param). */
  recencyDays?: number
  /** Optional single-domain filter. */
  domainFilter?: string
  /** Optional caller-provided abort signal (server timeout). */
  signal?: AbortSignal
}

export interface SearchProviderResult {
  /** Raw provider items — normalized and validated by the gateway. */
  results: RawSearchResult[]
}

/** Provider-agnostic seam: Tavily and Brave both implement this. */
export interface WebSearchProvider {
  readonly name: SearchProviderId
  search(request: SearchProviderRequest): Promise<SearchProviderResult>
}

// --- Client transport contract ----------------------------------------------

/** Injectable client seam the orchestrator uses to reach /api/search. */
export interface WebSearchTransport {
  search(query: WebSearchQuery): Promise<WebSearchResponse>
}

// --- Gateway wire contract (client-safe) ------------------------------------

export type SearchGatewayErrorCode =
  | 'invalid-request'
  | 'request-too-large'
  | 'provider-not-configured'
  | 'provider-error'
  | 'rate-limit'
  | 'timeout'
  | 'internal'

/** Sanitized error — the ONLY error shape a client may ever see. */
export interface SearchGatewayError {
  code: SearchGatewayErrorCode
  message: string
}

export type SearchGatewayResponseBody = WebSearchResponse | { error: SearchGatewayError }