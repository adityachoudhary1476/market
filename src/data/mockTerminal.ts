import type {
  MarketSnapshotData,
  MarketStatusData,
  AIEvidence,
  SearchResult,
} from '@/types'
import { terminalSectors } from './mockTerminalSectors'
import { terminalStocks } from './mockTerminalStocks'

// ---------------------------------------------------------------------------
// MOCK DATA — Market snapshot, session status, insight, search index.
// Centralized so the UI never hardcodes these values.
// ---------------------------------------------------------------------------

export const marketSnapshot: MarketSnapshotData = {
  sentiment: 'Bullish',
  breadthPct: 60,
  volatility: 'Moderate',
  volume: 'Above average',
  fii: 'Positive',
  dii: 'Positive',
  globalCues: 'Supportive',
}

export const marketStatus: MarketStatusData = {
  nse: 'Open',
  bse: 'Open',
  fii: 'Positive',
  dii: 'Positive',
  volatility: 'Moderate',
  advancing: 1842,
  declining: 1203,
  unchanged: 87,
}

export interface MarketInsightData {
  title: string
  body: string
  evidence: AIEvidence[]
  howToRead: string
  disclaimer: string
}

export const marketInsight: MarketInsightData = {
  title: 'Financials lead a broad-based advance',
  body:
    'Financials are currently leading the broader market, while technology stocks remain mixed. Market breadth is positive, suggesting gains are not limited to a small group of large-cap names. FII flows have turned positive and global cues are supportive, though volatility remains moderate.',
  evidence: [
    { id: 'ev1', label: 'Financials', value: '+1.4%', trend: 'up' },
    { id: 'ev2', label: 'Breadth', value: '60% positive', trend: 'up' },
    { id: 'ev3', label: 'FII Flow', value: 'Positive', trend: 'up' },
    { id: 'ev4', label: 'India VIX', value: 'Moderate', trend: 'flat' },
    { id: 'ev5', label: 'Global cues', value: 'Supportive', trend: 'up' },
  ],
  howToRead:
    'Read this as a measure of participation, not a forecast. Broad breadth and firm financials indicate a healthy, well-supported session; if breadth narrows to a handful of names or VIX rises, the picture becomes more fragile. Use the evidence to frame your own view.',
  disclaimer:
    'Illustrative analysis based on mock market data. Not investment advice.',
}

// ---------------------------------------------------------------------------
// Search index — stocks, indices and sectors. Used by the command palette.
// ---------------------------------------------------------------------------

const INDEX_RESULTS: SearchResult[] = [
  { id: 'idx-nifty', type: 'index', title: 'NIFTY 50', subtitle: 'Index · NSE', to: '/markets' },
  { id: 'idx-sensex', type: 'index', title: 'SENSEX', subtitle: 'Index · BSE', to: '/markets' },
  { id: 'idx-banknifty', type: 'index', title: 'BANK NIFTY', subtitle: 'Index · NSE', to: '/markets' },
  { id: 'idx-niftyit', type: 'index', title: 'NIFTY IT', subtitle: 'Index · NSE', to: '/markets' },
]

const SECTOR_RESULTS: SearchResult[] = terminalSectors.map((s) => ({
  id: `sec-${s.id}`,
  type: 'sector',
  title: s.name,
  subtitle: `Sector · ${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}% today`,
  to: `/markets/sector/${s.id}`,
}))

const STOCK_RESULTS: SearchResult[] = terminalStocks.map((s) => ({
  id: `stk-${s.id}`,
  type: 'stock',
  title: s.name,
  subtitle: `${s.symbol} · ${s.sector}`,
  to: `/research/${s.symbol}`,
}))

export const searchIndex: SearchResult[] = [
  ...STOCK_RESULTS,
  ...INDEX_RESULTS,
  ...SECTOR_RESULTS,
]

export function searchMarket(query: string, limit = 8): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored = searchIndex
    .map((r) => {
      let score = 0
      if (r.title.toLowerCase().startsWith(q)) score += 100
      else if (r.title.toLowerCase().includes(q)) score += 60
      if (r.subtitle.toLowerCase().includes(q)) score += 20
      // symbol match (after stripping non-alnum)
      const sym = r.title.replace(/[^a-z0-9]/gi, '').toLowerCase()
      if (sym.startsWith(q)) score += 40
      return { r, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((x) => x.r)
}
