export type ProviderCostClass = 'FREE' | 'FREE_WITH_LIMITS' | 'PAID' | 'UNKNOWN'

export interface ProviderCapability {
  provider: string
  category: 'news' | 'macro' | 'crypto' | 'fx' | 'metals' | 'equities' | 'market-data'
  costClass: ProviderCostClass
  requiresKey: boolean
  dataMode: 'live' | 'delayed' | 'daily' | 'reference' | 'unavailable'
  freshness: string
  rateLimit: string
  status: 'implemented' | 'optional' | 'unavailable'
}

/** Static policy registry. Automatic selection must only use FREE classes. */
export const FREE_PROVIDER_REGISTRY: readonly ProviderCapability[] = [
  { provider: 'eia', category: 'market-data', costClass: 'FREE_WITH_LIMITS', requiresKey: true, dataMode: 'daily', freshness: 'daily', rateLimit: 'provider-governed', status: 'optional' },
  { provider: 'coingecko', category: 'crypto', costClass: 'FREE_WITH_LIMITS', requiresKey: false, dataMode: 'delayed', freshness: 'short-cache', rateLimit: 'public free endpoint limits', status: 'implemented' },
  { provider: 'ecb-frankfurter', category: 'fx', costClass: 'FREE', requiresKey: false, dataMode: 'reference', freshness: 'daily', rateLimit: 'public service limits', status: 'implemented' },
  { provider: 'rss', category: 'news', costClass: 'FREE', requiresKey: false, dataMode: 'daily', freshness: 'feed-published', rateLimit: 'feed-owner limits', status: 'optional' },
  { provider: 'tavily', category: 'news', costClass: 'UNKNOWN', requiresKey: true, dataMode: 'live', freshness: 'provider-defined', rateLimit: 'plan-defined', status: 'unavailable' },
  { provider: 'brave', category: 'news', costClass: 'UNKNOWN', requiresKey: true, dataMode: 'live', freshness: 'provider-defined', rateLimit: 'plan-defined', status: 'unavailable' },
]

export function isFreeProvider(provider: string): boolean {
  const entry = FREE_PROVIDER_REGISTRY.find((item) => item.provider === provider)
  return entry?.costClass === 'FREE' || entry?.costClass === 'FREE_WITH_LIMITS'
}