import type { StockQuote } from '@/types'
import { generateSpark } from './generators'

// ---------------------------------------------------------------------------
// MOCK DATA — Stocks for the Markets terminal.
// changePct is derived from (change / prevClose) so values always agree.
// All figures are illustrative.
// ---------------------------------------------------------------------------

interface Seed {
  symbol: string
  name: string
  sector: string
  price: number
  changePct: number
  volume: number
  avgVolume: number
  marketCapCr: number
  week52High: number
  week52Low: number
}

// changePct signed; positive = gainer
const SEEDS: Seed[] = [
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Financials', price: 1742.6, changePct: 2.14, volume: 18_400_000, avgVolume: 12_200_000, marketCapCr: 1_285_000, week52High: 1794.0, week52Low: 1430.5 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Financials', price: 1268.45, changePct: 1.86, volume: 14_900_000, avgVolume: 9_800_000, marketCapCr: 8_92_000, week52High: 1296.5, week52Low: 982.3 },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Financials', price: 824.9, changePct: 1.72, volume: 16_200_000, avgVolume: 11_500_000, marketCapCr: 7_35_000, week52High: 840.2, week52Low: 602.1 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', sector: 'Financials', price: 7286.3, changePct: 1.54, volume: 2_100_000, avgVolume: 1_500_000, marketCapCr: 4_48_000, week52High: 7420.0, week52Low: 6180.4 },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv', sector: 'Financials', price: 1684.2, changePct: 1.42, volume: 1_900_000, avgVolume: 1_300_000, marketCapCr: 2_68_000, week52High: 1742.0, week52Low: 1420.6 },
  { symbol: 'LT', name: 'Larsen & Toubro', sector: 'Infrastructure', price: 3698.75, changePct: 1.68, volume: 3_400_000, avgVolume: 2_100_000, marketCapCr: 5_08_000, week52High: 3786.0, week52Low: 2890.2 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom', price: 1624.3, changePct: 1.28, volume: 5_800_000, avgVolume: 4_200_000, marketCapCr: 9_64_000, week52High: 1658.0, week52Low: 1180.7 },
  { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical', sector: 'Healthcare', price: 1842.6, changePct: 1.18, volume: 3_900_000, avgVolume: 2_700_000, marketCapCr: 4_42_000, week52High: 1896.0, week52Low: 1392.4 },

  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy', price: 2947.85, changePct: 1.19, volume: 9_600_000, avgVolume: 6_400_000, marketCapCr: 19_92_000, week52High: 3024.9, week52Low: 2220.3 },
  { symbol: 'INFY', name: 'Infosys', sector: 'Information Technology', price: 1876.45, changePct: 0.66, volume: 7_200_000, avgVolume: 5_100_000, marketCapCr: 7_79_000, week52High: 1992.0, week52Low: 1351.6 },
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'Information Technology', price: 4238.7, changePct: -0.43, volume: 2_800_000, avgVolume: 1_900_000, marketCapCr: 15_39_000, week52High: 4585.0, week52Low: 3310.5 },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', sector: 'FMCG', price: 2486.9, changePct: -0.38, volume: 2_200_000, avgVolume: 1_800_000, marketCapCr: 5_84_000, week52High: 2779.6, week52Low: 2178.0 },
  { symbol: 'ITC', name: 'ITC', sector: 'FMCG', price: 468.25, changePct: -0.62, volume: 12_400_000, avgVolume: 11_800_000, marketCapCr: 5_84_000, week52High: 499.6, week52Low: 399.3 },
  { symbol: 'NTPC', name: 'NTPC', sector: 'Energy', price: 362.4, changePct: -1.12, volume: 11_800_000, avgVolume: 9_200_000, marketCapCr: 3_52_000, week52High: 448.45, week52Low: 245.2 },
  { symbol: 'WIPRO', name: 'Wipro', sector: 'Information Technology', price: 548.6, changePct: -1.34, volume: 8_600_000, avgVolume: 6_100_000, marketCapCr: 2_88_000, week52High: 582.0, week52Low: 376.1 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', sector: 'Auto', price: 982.6, changePct: -1.82, volume: 13_200_000, avgVolume: 9_900_000, marketCapCr: 3_61_000, week52High: 1179.0, week52Low: 652.6 },
  { symbol: 'ADANIENT', name: 'Adani Enterprises', sector: 'Conglomerate', price: 2784.5, changePct: -2.06, volume: 6_800_000, avgVolume: 4_700_000, marketCapCr: 3_18_000, week52High: 3743.0, week52Low: 2025.0 },
  { symbol: 'COALINDIA', name: 'Coal India', sector: 'Energy', price: 421.8, changePct: -2.34, volume: 9_400_000, avgVolume: 7_100_000, marketCapCr: 2_60_000, week52High: 543.9, week52Low: 342.5 },
]

function build(s: Seed): StockQuote {
  // prevClose = price / (1 + changePct/100); change = price - prevClose
  const prevClose = s.price / (1 + s.changePct / 100)
  const change = s.price - prevClose
  const changePct = (change / prevClose) * 100
  return {
    id: s.symbol.toLowerCase(),
    symbol: s.symbol,
    name: s.name,
    sector: s.sector,
    price: s.price,
    change: Number(change.toFixed(2)),
    changePct: Number(changePct.toFixed(2)),
    trend: changePct > 0.04 ? 'up' : changePct < -0.04 ? 'down' : 'flat',
    volume: s.volume,
    avgVolume: s.avgVolume,
    marketCapCr: s.marketCapCr,
    week52High: s.week52High,
    week52Low: s.week52Low,
    spark: generateSpark(
      24,
      prevClose * (s.changePct >= 0 ? 0.985 : 1.012),
      s.price * 0.006,
      s.price * 0.0004 * (s.changePct >= 0 ? 1 : -1),
    ),
  }
}

export const terminalStocks: StockQuote[] = SEEDS.map(build)

/** Top N gainers by percentage change. */
export function topGainers(n = 8): StockQuote[] {
  return [...terminalStocks].sort((a, b) => b.changePct - a.changePct).slice(0, n)
}

/** Top N losers by percentage change. */
export function topLosers(n = 8): StockQuote[] {
  return [...terminalStocks].sort((a, b) => a.changePct - b.changePct).slice(0, n)
}

/** Most active by traded volume. */
export function mostActive(n = 8): StockQuote[] {
  return [...terminalStocks].sort((a, b) => b.volume - a.volume).slice(0, n)
}

/** Stocks within 2% of their 52-week high. */
export function nearWeekHigh(n = 8): StockQuote[] {
  return terminalStocks
    .map((s) => ({ s, dist: (s.week52High - s.price) / s.week52High }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n)
    .map((x) => x.s)
}

/** Stocks within 8% of their 52-week low. */
export function nearWeekLow(n = 8): StockQuote[] {
  return terminalStocks
    .map((s) => ({ s, dist: (s.price - s.week52Low) / s.week52Low }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n)
    .map((x) => x.s)
}

export function findStock(symbol: string): StockQuote | undefined {
  const sym = symbol.toUpperCase().replace(/\s+/g, '')
  return terminalStocks.find((s) => s.symbol === sym)
}
