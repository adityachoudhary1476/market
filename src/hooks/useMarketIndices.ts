import { useCallback, useEffect, useMemo, useState } from 'react'
import { terminalIndices } from '@/data/mockTerminalIndices'
import { formatIST } from '@/lib/format'
import type { MarketIndex } from '@/types'

// ---------------------------------------------------------------------------
// Live market-data endpoint for the browser.
// Mirrors the tool-context derivation so the UI and the agent see the same
// source when FINOVA_ANALYST_API_URL is configured.
// ---------------------------------------------------------------------------

function browserMarketDataEndpoint(): string | undefined {
  try {
    const api = (import.meta.env as Record<string, string | undefined>).FINOVA_ANALYST_API_URL
    if (!api) return undefined
    const url = new URL(api)
    url.pathname = url.pathname.replace(/\/analyze\/?$/, '/market-data')
    if (!url.pathname.endsWith('/market-data')) url.pathname = '/api/market-data'
    return url.toString()
  } catch {
    return undefined
  }
}

interface InstrumentPoint {
  value: number
  change: number
  changePct: number
  dataMode?: MarketIndex['dataMode']
}

const INDEX_KEYS: Record<string, string> = {
  nifty: 'nifty-50',
  sensex: 'sensex',
  banknifty: 'bank-nifty',
  niftyit: 'nifty-it',
}

// ---------------------------------------------------------------------------
// Hook: useMarketIndices
//
// Polls /api/market-data every 60s and merges the returned NIFTY / SENSEX /
// BANK NIFTY / NIFTY IT values into the existing mock indices. Sparklines
// and session fields (open / prevClose / dayHigh / dayLow) are preserved from
// the mock data because the free Yahoo-Finance endpoint only returns the
// current snapshot.
// ---------------------------------------------------------------------------

export function useMarketIndices(pollIntervalMs = 60_000) {
  const endpoint = useMemo(browserMarketDataEndpoint, [])
  const [indices, setIndices] = useState<MarketIndex[]>(terminalIndices)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMarketData = useCallback(async () => {
    if (!endpoint) return
    setRefreshing(true)
    setError(null)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        cache: 'no-store',
      })
      if (!response.ok) {
        throw new Error(`Market data endpoint returned ${response.status}`)
      }
      const body = (await response.json()) as {
        instruments?: Record<string, InstrumentPoint>
      }
      const instruments = body.instruments ?? {}

      setIndices((prev) =>
        prev.map((idx) => {
          const key = Object.entries(INDEX_KEYS).find(([, id]) => id === idx.id)?.[0]
          if (!key) return idx
          const point = instruments[key]
          if (!point || !Number.isFinite(point.value)) return idx
          const trend: MarketIndex['trend'] =
            point.changePct > 0 ? 'up' : point.changePct < 0 ? 'down' : 'flat'
          return {
            ...idx,
            value: point.value,
            change: point.change ?? idx.change,
            changePct: point.changePct ?? idx.changePct,
            trend,
            dataMode: point.dataMode ?? 'delayed',
          }
        }),
      )
      setLastUpdated(new Date())
    } catch (err) {
      if (endpoint) {
        setError(err instanceof Error ? err.message : 'Failed to fetch market data')
      }
    } finally {
      setRefreshing(false)
    }
  }, [endpoint])

  useEffect(() => {
    if (!endpoint) return
    fetchMarketData()
    const timer = window.setInterval(fetchMarketData, pollIntervalMs)
    return () => {
      window.clearInterval(timer)
    }
  }, [endpoint, pollIntervalMs, fetchMarketData])

  return {
    indices,
    lastUpdatedLabel: lastUpdated ? formatIST(lastUpdated.getTime()) : formatIST(Date.now()),
    lastUpdated,
    refreshing,
    error,
    refresh: fetchMarketData,
  }
}
