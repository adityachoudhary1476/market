import type { MacroIndicator } from '@/types'
import { trendFromChange } from './generators'

// ---------------------------------------------------------------------------
// MOCK DATA — Macro indicators for the terminal.
// `invertColor` flips semantic coloring for indicators where a falling value
// is positive for risk (e.g. VIX). All values illustrative.
// ---------------------------------------------------------------------------

export const terminalMacro: MacroIndicator[] = [
  {
    id: 'repo', label: 'India Repo Rate', value: '6.50%',
    change: 0, changePct: 0, trend: trendFromChange(0), unit: '%',
    dataMode: 'synthetic-demo',
  },
  {
    id: 'usdinr', label: 'USD / INR', value: '83.92',
    change: -0.15, changePct: -0.18, trend: trendFromChange(-0.18), unit: '₹',
    dataMode: 'synthetic-demo',
  },
  {
    id: 'in10y', label: 'India 10Y Yield', value: '6.94%',
    change: -0.03, changePct: -0.43, trend: trendFromChange(-0.43), unit: '%',
    dataMode: 'synthetic-demo',
  },
  {
    id: 'brent', label: 'Brent Crude', value: '$76.84',
    change: 0.62, changePct: 0.81, trend: trendFromChange(0.81), unit: '$',
    dataMode: 'synthetic-demo',
  },
  {
    id: 'gold', label: 'Gold (spot)', value: '$2,512',
    change: 5.5, changePct: 0.22, trend: trendFromChange(0.22), unit: '$',
    dataMode: 'synthetic-demo',
  },
  {
    id: 'indiavix', label: 'India VIX', value: '13.84',
    change: -0.9, changePct: -6.1, trend: trendFromChange(-6.1), invertColor: true,
    dataMode: 'synthetic-demo',
  },
  {
    id: 'us10y', label: 'US 10Y Yield', value: '3.92%',
    change: -0.04, changePct: -1.1, trend: trendFromChange(-1.1), unit: '%',
    dataMode: 'synthetic-demo',
  },
  {
    id: 'nifty', label: 'NIFTY 50', value: '24,816',
    change: 62.35, changePct: 0.25, trend: 'up', unit: 'pts',
    dataMode: 'synthetic-demo',
  },
  {
    id: 'sensex', label: 'SENSEX', value: '81,320',
    change: 210.5, changePct: 0.26, trend: 'up', unit: 'pts',
    dataMode: 'synthetic-demo',
  },
  {
    id: 'banknifty', label: 'BANK NIFTY', value: '52,450',
    change: -120.3, changePct: -0.23, trend: 'down', unit: 'pts',
    dataMode: 'synthetic-demo',
  },
  {
    id: 'niftyit', label: 'NIFTY IT', value: '43,180',
    change: 85.6, changePct: 0.20, trend: 'up', unit: 'pts',
    dataMode: 'synthetic-demo',
  },
]
