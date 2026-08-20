import type { NewsItem } from '@/types'

// ---------------------------------------------------------------------------
// MOCK DATA — News headlines
// Clearly fictional, for layout/demo purposes only.
// ---------------------------------------------------------------------------

export const mockNews: NewsItem[] = [
  {
    id: 'n1',
    source: 'Market Wire',
    headline: 'Financials lead gains as risk sentiment improves',
    summary:
      'Banking stocks advanced on improved credit growth outlook and stable asset quality trends.',
    time: '12 min ago',
    sentiment: 'positive',
    symbols: ['HDFCBANK', 'ICICIBANK', 'SBIN'],
  },
  {
    id: 'n2',
    source: 'Tech Desk',
    headline: 'IT majors see steady deal momentum amid global demand',
    summary:
      'Large-cap IT companies reported stable pipeline commentary despite mixed macro signals.',
    time: '38 min ago',
    sentiment: 'positive',
    symbols: ['TCS', 'INFY'],
  },
  {
    id: 'n3',
    source: 'Commodities',
    headline: 'Crude eases as supply concerns soften',
    summary:
      'Brent trimmed weekly gains on expectations of improved supply and softer demand forecasts.',
    time: '1h ago',
    sentiment: 'neutral',
    symbols: ['CRUDE', 'ONGC'],
  },
  {
    id: 'n4',
    source: 'Auto Beat',
    headline: 'PV retail sales hold steady ahead of festive demand',
    summary:
      'Dechannel inventory remained within normal range while two-wheeler demand stayed muted.',
    time: '2h ago',
    sentiment: 'neutral',
    symbols: ['TATAMOTORS', 'MARUTI'],
  },
]
