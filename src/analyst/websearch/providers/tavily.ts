// ---------------------------------------------------------------------------
// Phase 3C.1 — Provider adapters: Tavily
//
// SERVER-ONLY (holds an API key). Implements WebSearchProvider for Tavily's
// POST /search endpoint. All network interaction goes through an injectable
// fetch implementation so tests never touch the live API (locked decision 9).
// ---------------------------------------------------------------------------

import type { RawSearchResult, SearchProviderRequest, SearchProviderResult, WebSearchProvider } from '../types'
import { mapProviderHttpStatus, SearchProviderError } from './errors'

export type FetchLike = (url: string, init: Record<string, unknown>) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

export interface TavilyProviderOptions {
  apiKey: string
  timeoutMs?: number
  /** Optional endpoint override (default: https://api.tavily.com/search). */
  baseUrl?: string
  fetchImpl?: FetchLike
}

interface TavilyResponse {
  results?: unknown
}

interface TavilyItem {
  title?: unknown
  url?: unknown
  content?: unknown
  snippet?: unknown
  published_date?: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function createTavilyProvider(options: TavilyProviderOptions): WebSearchProvider {
  const { apiKey, timeoutMs = 15_000, fetchImpl = fetch as unknown as FetchLike } = options
  const url = (options.baseUrl ?? 'https://api.tavily.com/search').trim()

  return {
    name: 'tavily',

    async search(request: SearchProviderRequest): Promise<SearchProviderResult> {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
      const timer =
        timeoutMs > 0 && controller && !request.signal
          ? setTimeout(() => controller.abort(), timeoutMs)
          : undefined

      const body: Record<string, unknown> = {
        api_key: apiKey,
        query: request.query,
        max_results: request.maxResults,
        search_depth: 'basic',
        include_answer: false,
        ...(request.recencyDays !== undefined ? { days: request.recencyDays } : {}),
        ...(request.domainFilter !== undefined ? { include_domains: [request.domainFilter] } : {}),
      }

      let res: { ok: boolean; status: number; json(): Promise<unknown> }
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          ...(request.signal ? { signal: request.signal } : controller ? { signal: controller.signal } : {}),
        })
      } catch (thrown) {
        if (thrown instanceof DOMException && thrown.name === 'AbortError') {
          throw new SearchProviderError('timeout', `Tavily timed out after ${timeoutMs}ms.`)
        }
        throw new SearchProviderError('network', thrown instanceof Error ? thrown.message : 'Tavily network error')
      } finally {
        if (timer) clearTimeout(timer)
      }

      if (!res.ok) {
        let msg = `Tavily returned HTTP ${res.status}.`
        try {
          const parsed = (await res.json()) as { error?: { message?: string } }
          if (parsed?.error?.message) msg = parsed.error.message
        } catch {
          // ignore body parse failure
        }
        throw mapProviderHttpStatus(res.status, msg)
      }

      let parsed: TavilyResponse
      try {
        parsed = (await res.json()) as TavilyResponse
      } catch {
        throw new SearchProviderError('invalid-response', 'Tavily returned a non-JSON response.')
      }

      if (!Array.isArray(parsed.results)) {
        throw new SearchProviderError('invalid-response', 'Tavily response had no results array.')
      }

      const results: RawSearchResult[] = parsed.results.filter(isRecord).map((item: TavilyItem) => ({
        title: item.title,
        url: item.url,
        snippet: typeof item.content === 'string' && item.content.length > 0 ? item.content : item.snippet,
        publishedAt: item.published_date ?? null,
      }))

      return { results }
    },
  }
}