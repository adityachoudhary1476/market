import type { MarketIndex } from '@/types'
import { mockIndices } from './mockMarkets'

// ---------------------------------------------------------------------------
// Major indices for the Markets terminal, enriched with session details
// (open / prevClose / dayHigh / dayLow). Values are illustrative and kept
// consistent with mockMarketSeries chart anchors.
// ---------------------------------------------------------------------------

interface SessionSeed {
  id: string
  prevClose: number
  dayHigh: number
  dayLow: number
}

const SESSION: Record<string, SessionSeed> = {
  'nifty-50': { id: 'nifty-50', prevClose: 24630.25, dayHigh: 24901.2, dayLow: 24604.15 },
  sensex: { id: 'sensex', prevClose: 80918.92, dayHigh: 81742.1, dayLow: 80824.6 },
  'bank-nifty': { id: 'bank-nifty', prevClose: 52615.4, dayHigh: 53342.0, dayLow: 52598.3 },
  'nifty-it': { id: 'nifty-it', prevClose: 41102.8, dayHigh: 41418.6, dayLow: 40988.25 },
}

export const terminalIndices: MarketIndex[] = [
  'nifty-50',
  'sensex',
  'bank-nifty',
  'nifty-it',
]
  .map((id) => mockIndices.find((m) => m.id === id))
  .filter((m): m is MarketIndex => Boolean(m))
  .map((m) => {
    const s = SESSION[m.id]
    return {
      ...m,
      open: s ? s.prevClose + m.change * 0.12 : m.value,
      prevClose: s?.prevClose,
      dayHigh: s?.dayHigh,
      dayLow: s?.dayLow,
    }
  })
