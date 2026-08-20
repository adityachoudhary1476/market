import type { MarketAlert } from '@/types'

// ---------------------------------------------------------------------------
// MOCK DATA — Smart alerts (demo examples only)
// ---------------------------------------------------------------------------

export const mockAlerts: MarketAlert[] = [
  {
    id: 'a1',
    title: 'Reliance moved above its 50-day average',
    detail: 'Price crossed ₹2,910 with above-average volume over the last three sessions.',
    symbol: 'RELIANCE',
    severity: 'signal',
    time: 'Just now',
  },
  {
    id: 'a2',
    title: 'NIFTY volatility increased sharply',
    detail: 'India VIX rose 6.2% intraday — monitor position sizing and hedges.',
    symbol: 'NIFTY 50',
    severity: 'risk',
    time: '8 min ago',
  },
  {
    id: 'a3',
    title: 'Unusual volume detected in HDFC Bank',
    detail: 'Volume is 2.4× the 20-day average with a modest positive price move.',
    symbol: 'HDFCBANK',
    severity: 'info',
    time: '24 min ago',
  },
  {
    id: 'a4',
    title: 'Major news detected for Tata Motors',
    detail: 'Multiple sources reported on monthly sales and brokerage commentary.',
    symbol: 'TATAMOTORS',
    severity: 'news',
    time: '41 min ago',
  },
]
