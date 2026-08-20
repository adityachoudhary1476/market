import { useCallback, useState } from 'react'
import { formatIST } from '@/lib/format'

/**
 * Tracks a "last updated" timestamp for the demo terminal and a refreshing
 * flag to drive the refresh-icon animation. Mock only — does not fetch data.
 */
export function useMarketClock(initial: Date = new Date()) {
  const [lastUpdated, setLastUpdated] = useState(initial)
  const [refreshing, setRefreshing] = useState(false)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => {
    setRefreshing(true)
    // Simulate a brief data fetch; components key off `nonce` to jitter values.
    window.setTimeout(() => {
      setLastUpdated(new Date())
      setNonce((n) => n + 1)
      setRefreshing(false)
    }, 650)
  }, [])

  return {
    lastUpdatedLabel: formatIST(lastUpdated.getTime()),
    lastUpdated,
    refreshing,
    refresh,
    nonce,
  }
}
