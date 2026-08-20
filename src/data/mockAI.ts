import type { AIMessage, AIEvidence, IntelligenceFeature } from '@/types'

// ---------------------------------------------------------------------------
// MOCK DATA — AI Analyst conversation + intelligence feature grid
// The AI is framed as explanation/evidence, never prediction or guarantees.
// ---------------------------------------------------------------------------

export const aiEvidence: AIEvidence[] = [
  { id: 'e1', label: 'Global Markets', value: '+0.6%', trend: 'up' },
  { id: 'e2', label: 'Banking', value: '+1.2%', trend: 'up' },
  { id: 'e3', label: 'FII Flow', value: 'Positive', trend: 'up' },
  { id: 'e4', label: 'Volatility', value: 'Subdued', trend: 'flat' },
]

export const aiConversation: AIMessage[] = [
  {
    role: 'user',
    content: 'Why is the market moving higher today?',
  },
  {
    role: 'analyst',
    content:
      'Indian equities are trading higher, led by financials and large-cap stocks. Global risk sentiment is supportive, while FII flows turned positive and banking credit data showed steady momentum. Moves appear broad-based rather than concentrated in a single name.',
    evidence: aiEvidence,
  },
]

export const intelligenceFeatures: IntelligenceFeature[] = [
  {
    id: 'pulse',
    title: 'Market Pulse',
    description: 'Track indices, sectors and breadth in one calm, real-time view.',
    icon: 'pulse',
    accent: 'forest',
  },
  {
    id: 'research',
    title: 'Stock Research',
    description: 'Understand companies beyond their price — financials, moat and management.',
    icon: 'research',
    accent: 'terracotta',
  },
  {
    id: 'news',
    title: 'News Intelligence',
    description: 'Turn hundreds of headlines into the few that actually move the market.',
    icon: 'news',
    accent: 'forest',
  },
  {
    id: 'technical',
    title: 'Technical Signals',
    description: 'Identify trends, momentum and unusual activity without the noise.',
    icon: 'technical',
    accent: 'neutral',
  },
  {
    id: 'fundamentals',
    title: 'Fundamentals',
    description: 'Compare growth, profitability and valuation across peers.',
    icon: 'fundamentals',
    accent: 'forest',
  },
  {
    id: 'alerts',
    title: 'Smart Alerts',
    description: 'Know when something important changes — price, volume or news.',
    icon: 'alerts',
    accent: 'terracotta',
  },
]
