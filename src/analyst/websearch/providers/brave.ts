// ---------------------------------------------------------------------------
// Phase 3C.1 — Provider adapters: Brave
//
// SERVER-ONLY (holds an API key). Implements WebSearchProvider for Brave's
// GET /res/v1/web/search endpoint. All network interaction goes through an
// injectable fetch implementation so tests never touch the live API
// (locked decision 9). `freshness` is derived deterministically from the
// approved recencyDays range.
// ---------------------------------------------------------------------------

import type { RawSearchResult, SearchProviderRequest, SearchProviderResult, WebSearchProvider } from '../types'
import { mapProviderHttpStatus, SearchProviderError } from './errors'
import type { FetchLike } from './tavily'

export interface BraveProviderOptions {
  apiKey: string
  timeoutMs?: number
  /** Optional endpoint override (default: Brave web search API). */
  baseUrl?: string
  fetchImpl?: FetchLike
}

interface BraveResponse {
  web?: unknown
}

interface BraveItem {
  title?: unknown
  url?: unknown
  description?: unknown
  published_time?: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Brave freshness window derived from the approved recencyDays range. */
export function freshnessFromRecencyDays(days: number): string | undefined {
  if (days <= 1) return 'pday'
  if (days <= 7) return 'pweek'
  if (days <= 30) return 'pmonth'
  if (days <= 365) return 'pyear'
  return undefined
}

export function createBraveProvider(options: BraveProviderOptions): WebSearchProvider {
  const { apiKey, timeoutMs = 15_000, fetchImpl = fetch as unknown as FetchLike } = options
  const baseUrl = (options.baseUrl ?? 'https://api.search.brave.com/res/v1/web/search').trim()

  return {
    name: 'brave',

    async search(request: SearchProviderRequest): Promise<SearchProviderResult> {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
      const timer =
        timeoutMs > 0 && controller && !request.signal
          ? setTimeout(() => controller.abort(), timeoutMs)
          : undefined

      const params = new URLSearchParams({ q: request.query, count: String(request.maxResults) })
      if (request.recencyDays !== undefined) {
        const freshness = freshnessFromRecencyDays(request.recencyDays)
        if (freshness) params.set('freshness', freshness)
      }

      let res: { ok: boolean; status: number; json(): Promise<unknown> }
      try {
        res = await fetchImpl(`${baseUrl}?${params.toString()}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Subscription-Token': apiKey,
          },
          ...(request.signal ? { signal: request.signal } : controller ? { signal: controller.signal } : {}),
        })
      } catch (thrown) {
        if (thrown instanceof DOMException && thrown.name === 'AbortError') {
          throw new SearchProviderError('timeout', `Brave timed out after ${timeoutMs}ms.`)
        }
        throw new SearchProviderError('network', thrown instanceof Error ? thrown.message : 'Brave network error')
      } finally {
        if (timer) clearTimeout(timer)
      }

      if (!res.ok) {
        let msg = `Brave returned HTTP ${res.status}.`
        try {
          const parsed = (await res.json()) as { error?: { message?: string } }
          if (parsed?.error?.message) msg = parsed.error.message
        } catch {
          // ignore body parse failure
        }
        throw mapProviderHttpStatus(res.status, msg)
      }

      let parsed: BraveResponse
      try {
        parsed = (await res.json()) as BraveResponse
      } catch {
        throw new SearchProviderError('invalid-response', 'Brave returned a non-JSON response.')
      }

      const web = parsed.web
      if (web !== undefined && web !== null && !Array.isArray(web)) {
        const resultsArray = (web as { results?: unknown }).results
        if (!Array.isArray(resultsArray)) {
          throw new SearchProviderError('invalid-response', 'Brave response had no web.results array.')
        }
        const results: RawSearchResult[] = resultsArray.filter(isRecord).map((item: BraveItem) => ({
          title: item.title,
          url: item.url,
          snippet: item.description,
          publishedAt: item.published_time ?? null,
        }))
        return { results }
      }

      throw new SearchProviderError('invalid-response', 'Brave response had no web object.')
    },
  }
}