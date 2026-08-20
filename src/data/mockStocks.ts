import type { StockSnapshot } from '@/types'
import { generateSpark, generateCandles } from './generators'

// ---------------------------------------------------------------------------
// MOCK DATA — Stocks
// The featured stock (Reliance) drives the stock research preview. Additional
// entries are included so future watchlist / screener views have seed data.
// ---------------------------------------------------------------------------

export const featuredStock: StockSnapshot = {
  id: 'reliance',
  symbol: 'RELIANCE',
  name: 'Reliance Industries',
  sector: 'Energy / Diversified',
  price: 2947.85,
  change: 34.6,
  changePct: 1.19,
  trend: 'up',
  marketCap: '₹19.92L Cr',
  pe: 25.4,
  roe: 9.8,
  revenueGrowth: 11.6,
  spark: generateSpark(40, 2870, 18, 2.2),
  intraday: generateCandles(48, 2913, 6, 0.72),
}

export const mockStocks: StockSnapshot[] = [
  featuredStock,
  {
    id: 'hdfcbank',
    symbol: 'HDFCBANK',
    name: 'HDFC Bank',
    sector: 'Banking',
    price: 1684.3,
    change: 21.85,
    changePct: 1.31,
    trend: 'up',
    marketCap: '₹12.83L Cr',
    pe: 19.6,
    roe: 17.2,
    revenueGrowth: 8.4,
    spark: generateSpark(40, 1640, 12, 1.2),
    intraday: generateCandles(48, 1660, 5, 0.6),
  },
  {
    id: 'tcs',
    symbol: 'TCS',
    name: 'Tata Consultancy Services',
    sector: 'IT',
    price: 4238.7,
    change: -18.25,
    changePct: -0.43,
    trend: 'down',
    marketCap: '₹15.39L Cr',
    pe: 29.1,
    roe: 46.3,
    revenueGrowth: 4.1,
    spark: generateSpark(40, 4270, 22, -0.9),
    intraday: generateCandles(48, 4250, 8, -0.4),
  },
  {
    id: 'infy',
    symbol: 'INFY',
    name: 'Infosys',
    sector: 'IT',
    price: 1876.45,
    change: 12.3,
    changePct: 0.66,
    trend: 'up',
    marketCap: '₹7.79L Cr',
    pe: 27.8,
    roe: 31.5,
    revenueGrowth: 5.2,
    spark: generateSpark(40, 1850, 14, 0.8),
    intraday: generateCandles(48, 1864, 5, 0.4),
  },
  {
    id: 'tatamotors',
    symbol: 'TATAMOTORS',
    name: 'Tata Motors',
    sector: 'Auto',
    price: 982.6,
    change: -7.95,
    changePct: -0.8,
    trend: 'down',
    marketCap: '₹3.61L Cr',
    pe: 11.2,
    roe: 28.9,
    revenueGrowth: 18.7,
    spark: generateSpark(40, 995, 11, -0.5),
    intraday: generateCandles(48, 990, 6, -0.3),
  },
]
