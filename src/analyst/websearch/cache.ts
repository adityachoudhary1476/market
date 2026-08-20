// ---------------------------------------------------------------------------
// Phase 3C.1 — Web search evidence layer: in-memory response cache
//
// A tiny in-memory LRU cache for /api/search responses, used by the server
// gateway AND as the session-level evidence cache on the client (retrieve.ts).
// It is a pure, injectable module — no timers, no global state — so tests
// drive it deterministically.
// Approved limits: TTL 300s, max 100 entries.
// ---------------------------------------------------------------------------

import type { WebSearchResponse } from './types'
import { WEBSEARCH_LIMITS } from './limits'

export interface SearchCacheOptions {
  /** Approved: 100 entries. */
  maxEntries?: number
  /** Approved: 300,000 ms. */
  ttlMs?: number
  /** Injectable clock for deterministic tests. */
  now?: () => number
}

export interface SearchCache {
  get(key: string): WebSearchResponse | undefined
  set(key: string, value: WebSearchResponse): void
  /** Number of live entries (expired entries are lazily evicted). */
  size(): number
  clear(): void
}

interface CacheEntry {
  value: WebSearchResponse
  expiresAt: number
}

export function createSearchCache(options: SearchCacheOptions = {}): SearchCache {
  const maxEntries = options.maxEntries ?? WEBSEARCH_LIMITS.cacheMaxEntries
  const ttlMs = options.ttlMs ?? WEBSEARCH_LIMITS.cacheTtlMs
  const now = options.now ?? (() => Date.now())
  const entries = new Map<string, CacheEntry>()

  return {
    get(key: string): WebSearchResponse | undefined {
      const entry = entries.get(key)
      if (!entry) return undefined
      if (now() >= entry.expiresAt) {
        entries.delete(key)
        return undefined
      }
      // LRU refresh: move to the most-recent position.
      entries.delete(key)
      entries.set(key, entry)
      return entry.value
    },

    set(key: string, value: WebSearchResponse): void {
      if (entries.has(key)) entries.delete(key)
      entries.set(key, { value, expiresAt: now() + ttlMs })
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next()
        if (oldest.done) break
        entries.delete(oldest.value)
      }
    },

    size(): number {
      return entries.size
    },

    clear(): void {
      entries.clear()
    },
  }
}