import type { GlobalMarket } from '@/types'
import { generateSpark, trendFromChange } from './generators'

// ---------------------------------------------------------------------------
// MOCK DATA — Global indices. Values are illustrative.
// ---------------------------------------------------------------------------

export const globalMarkets: GlobalMarket[] = [
  {
    id: 'spx', name: 'S&P 500', region: 'United States', exchange: 'S&P',
    value: 5624.6, change: 17.32, changePct: 0.31, trend: 'up', marketState: 'closed',
    spark: generateSpark(24, 5560, 16, 2.4),
  },
  {
    id: 'nasdaq', name: 'NASDAQ', region: 'United States', exchange: 'NASDAQ',
    value: 18493.62, change: 79.04, changePct: 0.43, trend: 'up', marketState: 'closed',
    spark: generateSpark(24, 18150, 60, 14),
  },
  {
    id: 'dow', name: 'Dow Jones', region: 'United States', exchange: 'NYSE',
    value: 40974.54, change: -42.1, changePct: -0.1, trend: 'down', marketState: 'closed',
    spark: generateSpark(24, 41050, 70, -3),
  },
  {
    id: 'ftse', name: 'FTSE 100', region: 'United Kingdom', exchange: 'LSE',
    value: 8348.2, change: 22.4, changePct: 0.27, trend: 'up', marketState: 'closed',
    spark: generateSpark(24, 8300, 14, 1.8),
  },
  {
    id: 'dax', name: 'DAX', region: 'Germany', exchange: 'XETRA',
    value: 18633.88, change: 38.2, changePct: 0.21, trend: 'up', marketState: 'closed',
    spark: generateSpark(24, 18540, 42, 4),
  },
  {
    id: 'nikkei', name: 'Nikkei 225', region: 'Japan', exchange: 'JPX',
    value: 38615.66, change: -211.25, changePct: -0.54, trend: 'down', marketState: 'closed',
    spark: generateSpark(24, 38900, 150, -12),
  },
  {
    id: 'hsi', name: 'Hang Seng', region: 'Hong Kong', exchange: 'HKEX',
    value: 17623.98, change: 154.87, changePct: 0.89, trend: 'up', marketState: 'open',
    spark: generateSpark(24, 17380, 95, 9),
  },
  {
    id: 'shcomp', name: 'Shanghai Composite', region: 'China', exchange: 'SSE',
    value: 2871.46, change: 9.82, changePct: 0.34, trend: 'up', marketState: 'open',
    spark: generateSpark(24, 2845, 11, 1.1),
  },
]

export const globalTrend = trendFromChange
