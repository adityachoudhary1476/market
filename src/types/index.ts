// ---------------------------------------------------------------------------
// Finova Markets — domain types
// These types describe the shape of data used across the UI. The mock layer
// (src/data) conforms to them; future API integrations should too, so that
// components never need to know where the data comes from.
// ---------------------------------------------------------------------------

export type Trend = 'up' | 'down' | 'flat'

/** A tradeable index / instrument shown in the ticker and market cards. */
export interface MarketIndex {
  id: string
  symbol: string
  name: string
  exchange: string
  value: number
  change: number // absolute points change
  changePct: number // percentage change
  trend: Trend
  /** Sparkline values, oldest -> newest. */
  spark: number[]
  region: 'india' | 'us' | 'asia' | 'europe' | 'commodity' | 'fx'
  marketState: 'open' | 'closed' | 'pre' | 'post'
  // Extended session fields (used by the Markets terminal; optional so the
  // homepage's simpler cards remain unaffected).
  open?: number
  prevClose?: number
  dayHigh?: number
  dayLow?: number
}

// ---------------------------------------------------------------------------
// Phase 1 — Markets terminal types
// ---------------------------------------------------------------------------

export type Timeframe = '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y'

/** A single point on a price chart. */
export interface ChartPoint {
  t: number // epoch ms
  label: string // human-readable axis/tooltip label
  v: number // price / index value
  volume?: number // participation (contracts/shares)
}

/** A full time series for an index over a given timeframe. */
export interface IndexSeries {
  symbol: string
  timeframe: Timeframe
  points: ChartPoint[]
  current: number
  change: number
  changePct: number
  high: number
  low: number
  open: number
  prevClose: number
  trend: Trend
}

/** A rich stock quote used by the terminal tables. */
export interface StockQuote {
  id: string
  symbol: string
  name: string
  sector: string
  price: number
  change: number
  changePct: number
  trend: Trend
  volume: number // shares traded today
  avgVolume: number // 20-day average volume
  marketCapCr: number // market cap in INR crore (numeric for sorting)
  week52High: number
  week52Low: number
  spark: number[]
}

/** A global index for the world markets panel. */
export interface GlobalMarket {
  id: string
  name: string
  region: string
  exchange: string
  value: number
  change: number
  changePct: number
  trend: Trend
  spark: number[]
  marketState: 'open' | 'closed'
}

export type MoverCategory = 'gainers' | 'losers' | 'active' | 'highs' | 'lows'

export type Sentiment = 'Bullish' | 'Neutral' | 'Cautious'

export interface MarketSnapshotData {
  sentiment: Sentiment
  breadthPct: number // % advancing
  volatility: 'Low' | 'Moderate' | 'Elevated' | 'High'
  volume: 'Below average' | 'Average' | 'Above average'
  fii: 'Positive' | 'Neutral' | 'Negative'
  dii: 'Positive' | 'Neutral' | 'Negative'
  globalCues: 'Supportive' | 'Mixed' | 'Weak'
}

export interface MarketStatusData {
  nse: 'Open' | 'Closed'
  bse: 'Open' | 'Closed'
  fii: MarketSnapshotData['fii']
  dii: MarketSnapshotData['dii']
  volatility: MarketSnapshotData['volatility']
  advancing: number
  declining: number
  unchanged: number
}

export type SearchResultType = 'stock' | 'index' | 'sector'

export interface SearchResult {
  id: string
  type: SearchResultType
  title: string
  subtitle: string
  to: string
}

export interface Sector {
  id: string
  name: string
  changePct: number
  trend: Trend
  /** Relative strength 0–100, drives the horizontal bar. */
  strength: number
  advancers: number
  decliners: number
}

export interface MarketBreadth {
  advancing: number
  declining: number
  unchanged: number
  /** New highs / lows for the session. */
  newHighs: number
  newLows: number
}

export interface StockSnapshot {
  id: string
  symbol: string
  name: string
  sector: string
  price: number
  change: number
  changePct: number
  trend: Trend
  marketCap: string
  pe: number
  roe: number // percentage
  revenueGrowth: number // percentage, YoY
  spark: number[]
  /** Intraday 15m-ish candles for the chart (open,high,low,close). */
  intraday: [number, number, number, number][]
}

export interface NewsItem {
  id: string
  source: string
  headline: string
  summary: string
  time: string // human-readable relative
  sentiment: 'positive' | 'negative' | 'neutral'
  symbols: string[]
}

export type AlertSeverity = 'info' | 'signal' | 'news' | 'risk'

export interface MarketAlert {
  id: string
  title: string
  detail: string
  symbol?: string
  severity: AlertSeverity
  time: string
}

export interface AIEvidence {
  id: string
  label: string
  value: string
  trend: Trend
}

export interface AIMessage {
  role: 'user' | 'analyst'
  content: string
  evidence?: AIEvidence[]
}

export interface IntelligenceFeature {
  id: string
  title: string
  description: string
  icon: string // icon key, resolved in the component
  accent: 'forest' | 'terracotta' | 'neutral'
}

export interface MacroIndicator {
  id: string
  label: string
  value: string
  changePct: number
  trend: Trend
  /** Absolute change (in the indicator's own units), when meaningful. */
  change?: number
  /** When true, a falling value is "good" (e.g. VIX) so the semantic color flips. */
  invertColor?: boolean
  unit?: string
}
