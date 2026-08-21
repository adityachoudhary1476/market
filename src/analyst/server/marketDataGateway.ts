// Free-first official market data gateway.
// EIA petroleum spot prices are daily, not intraday. Missing configuration or
// an upstream failure is returned as unavailable; no demo value is fabricated.
// Indian equity indices are fetched from Yahoo Finance (free, no key, delayed).

export interface EiaPricePoint {
  value: number
  timestamp: string
  frequency: 'daily'
  source: 'eia'
  dataMode: 'daily'
}

export interface NsePricePoint {
  value: number
  change: number
  changePct: number
  timestamp: string
  frequency: 'delayed'
  source: 'yahoo-finance'
  dataMode: 'delayed'
}

export interface MarketDataBody {
  provider: 'free-aggregate'
  classification: 'FREE'
  fetchedAt: string
  instruments: {
    brent?: EiaPricePoint
    wti?: EiaPricePoint
    btc?: FreePricePoint
    eth?: FreePricePoint
    eurusd?: FreePricePoint
    gbpusd?: FreePricePoint
    usdjpy?: FreePricePoint
    usdinr?: FreePricePoint
    nifty?: NsePricePoint
    sensex?: NsePricePoint
    banknifty?: NsePricePoint
    niftyit?: NsePricePoint
  }
}

export interface FreePricePoint {
  value: number
  timestamp: string
  frequency: 'reference' | 'daily'
  source: 'coingecko' | 'ecb'
  dataMode: 'daily' | 'delayed' | 'reference'
}

export interface MarketDataGatewayResult {
  status: number
  body: MarketDataBody | { error: { code: string; message: string } }
}

interface EiaResponse {
  response?: { data?: Array<{ period?: unknown; value?: unknown }> }
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: unknown
        regularMarketChange?: unknown
        regularMarketChangePercent?: unknown
        regularMarketTime?: unknown
      }
    }>
    error?: { code?: unknown; description?: unknown }
  }
}

export interface MarketDataGatewayOptions {
  apiKey: string | null
  now?: () => number
  fetchImpl?: typeof fetch
}

const EIA_URL = 'https://api.eia.gov/v2/petroleum/pri/spt/data/'
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price'
const FRANKFURTER_URL = 'https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,INR'
const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/'
const SERIES: Record<'brent' | 'wti', string> = {
  brent: 'RBRTE',
  wti: 'RWTC',
}
const NSE_INDICES: Record<string, string> = {
  nifty: '^NSEI',
  sensex: '^BSESN',
  banknifty: '^NSEBANK',
  niftyit: '^CNXIT',
}
let cached: { expiresAt: number; body: MarketDataBody } | null = null

function error(message: string): MarketDataGatewayResult {
  return { status: 503, body: { error: { code: 'market-data-unavailable', message } } }
}

function finiteNumber(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

async function fetchSeries(seriesId: string, apiKey: string | null, fetchImpl: typeof fetch): Promise<EiaPricePoint | undefined> {
  const url = new URL(EIA_URL)
  url.searchParams.set('frequency', 'daily')
  url.searchParams.append('data[0]', 'value')
  url.searchParams.append('facets[seriesId][]', seriesId)
  url.searchParams.set('sort[0][column]', 'period')
  url.searchParams.set('sort[0][direction]', 'desc')
  url.searchParams.set('length', '1')
  if (apiKey) url.searchParams.set('api_key', apiKey)

  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) return undefined
  const parsed = (await response.json()) as EiaResponse
  const row = parsed.response?.data?.[0]
  const value = finiteNumber(row?.value)
  if (value === undefined || typeof row?.period !== 'string') return undefined
  return { value, timestamp: `${row.period}T00:00:00.000Z`, frequency: 'daily', source: 'eia', dataMode: 'daily' }
}

async function fetchCrypto(fetchImpl: typeof fetch, now: number): Promise<Pick<MarketDataBody['instruments'], 'btc' | 'eth'>> {
  const url = `${COINGECKO_URL}?ids=bitcoin%2Cethereum&vs_currencies=usd&include_24hr_change=true`
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) return {}
  const body = (await response.json()) as Record<string, { usd?: unknown; usd_24h_change?: unknown }>
  const point = (id: 'bitcoin' | 'ethereum'): FreePricePoint | undefined => {
    const value = finiteNumber(body[id]?.usd)
    if (value === undefined) return undefined
    return { value, timestamp: new Date(now).toISOString(), frequency: 'daily', source: 'coingecko', dataMode: 'delayed' }
  }
  return { ...(point('bitcoin') ? { btc: point('bitcoin') } : {}), ...(point('ethereum') ? { eth: point('ethereum') } : {}) }
}

async function fetchFx(fetchImpl: typeof fetch, now: number): Promise<Pick<MarketDataBody['instruments'], 'eurusd' | 'gbpusd' | 'usdjpy' | 'usdinr'>> {
  const response = await fetchImpl(FRANKFURTER_URL, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) return {}
  const body = (await response.json()) as { date?: unknown; rates?: Record<string, unknown> }
  const rates = body.rates ?? {}
  const value = (currency: string): number | undefined => {
    const n = Number(rates[currency])
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  const date = typeof body.date === 'string' ? `${body.date}T00:00:00.000Z` : new Date(now).toISOString()
  const point = (currency: string, invert = false): FreePricePoint | undefined => {
    const n = value(currency)
    if (n === undefined) return undefined
    return { value: invert ? 1 / n : n, timestamp: date, frequency: 'reference', source: 'ecb', dataMode: 'reference' }
  }
  return {
    ...(point('EUR', true) ? { eurusd: point('EUR', true) } : {}),
    ...(point('GBP', true) ? { gbpusd: point('GBP', true) } : {}),
    ...(point('JPY') ? { usdjpy: point('JPY') } : {}),
    ...(point('INR') ? { usdinr: point('INR') } : {}),
  }
}

async function fetchNseIndex(symbol: string, fetchImpl: typeof fetch): Promise<NsePricePoint | undefined> {
  const url = `${YAHOO_CHART_URL}${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) return undefined
  const parsed = (await response.json()) as YahooChartResponse
  const meta = parsed.chart?.result?.[0]?.meta
  if (!meta) return undefined
  const price = finiteNumber(meta.regularMarketPrice)
  if (price === undefined) return undefined
  const prevClose = finiteNumber(meta.chartPreviousClose)
  const change = prevClose !== undefined ? price - prevClose : undefined
  const changePct = prevClose !== undefined && prevClose !== 0 ? (change! / prevClose) * 100 : undefined
  const ts = typeof meta.regularMarketTime === 'number' ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString()
  if (change === undefined || changePct === undefined) return undefined
  return { value: price, change, changePct, timestamp: ts, frequency: 'delayed', source: 'yahoo-finance', dataMode: 'delayed' }
}

async function fetchNseData(fetchImpl: typeof fetch): Promise<Pick<MarketDataBody['instruments'], 'nifty' | 'sensex' | 'banknifty' | 'niftyit'>> {
  const entries = Object.entries(NSE_INDICES)
  const results = await Promise.all(entries.map(async ([key, symbol]) => {
    const point = await fetchNseIndex(symbol, fetchImpl)
    return [key, point] as const
  }))
  const out: Record<string, NsePricePoint> = {}
  for (const [key, point] of results) {
    if (point) out[key] = point
  }
  return out as Pick<MarketDataBody['instruments'], 'nifty' | 'sensex' | 'banknifty' | 'niftyit'>
}

export async function handleMarketDataRequest(
  _body: unknown,
  deps: MarketDataGatewayOptions,
): Promise<MarketDataGatewayResult> {
  const now = deps.now ?? (() => Date.now())
  const current = now()
  if (cached && cached.expiresAt > current) return { status: 200, body: cached.body }

  try {
    const fetchImpl = deps.fetchImpl ?? fetch
    const [brent, wti, crypto, fx, nse] = await Promise.all([
      deps.apiKey ? fetchSeries(SERIES.brent, deps.apiKey, fetchImpl) : Promise.resolve(undefined),
      deps.apiKey ? fetchSeries(SERIES.wti, deps.apiKey, fetchImpl) : Promise.resolve(undefined),
      fetchCrypto(fetchImpl, current).catch(() => ({})),
      fetchFx(fetchImpl, current).catch(() => ({})),
      fetchNseData(fetchImpl).catch(() => ({})),
    ])
    if (!brent && !wti && Object.keys(crypto).length === 0 && Object.keys(fx).length === 0 && Object.keys(nse).length === 0) {
      return error('The free market-data sources returned no usable data.')
    }
    const body: MarketDataBody = {
      provider: 'free-aggregate',
      classification: 'FREE',
      fetchedAt: new Date(current).toISOString(),
      instruments: {
        ...(brent ? { brent } : {}),
        ...(wti ? { wti } : {}),
        ...crypto,
        ...fx,
        ...nse,
      },
    }
    cached = { expiresAt: current + 15 * 60_000, body }
    return { status: 200, body }
  } catch {
    return error('The free EIA market-data source is unavailable right now.')
  }
}
