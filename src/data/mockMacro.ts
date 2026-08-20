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
  },
  {
    id: 'usdinr', label: 'USD / INR', value: '83.92',
    change: -0.15, changePct: -0.18, trend: trendFromChange(-0.18), unit: '₹',
  },
  {
    id: 'in10y', label: 'India 10Y Yield', value: '6.94%',
    change: -0.03, changePct: -0.43, trend: trendFromChange(-0.43), unit: '%',
  },
  {
    id: 'brent', label: 'Brent Crude', value: '$76.84',
    change: 0.62, changePct: 0.81, trend: trendFromChange(0.81), unit: '$',
  },
  {
    id: 'gold', label: 'Gold (spot)', value: '$2,512',
    change: 5.5, changePct: 0.22, trend: trendFromChange(0.22), unit: '$',
  },
  {
    id: 'indiavix', label: 'India VIX', value: '13.84',
    change: -0.9, changePct: -6.1, trend: trendFromChange(-6.1), invertColor: true,
  },
  {
    id: 'us10y', label: 'US 10Y Yield', value: '3.92%',
    change: -0.04, changePct: -1.1, trend: trendFromChange(-1.1), unit: '%',
  },
]
