// ---------------------------------------------------------------------------
// Phase 3D — Agent layer: canonical financial subjects
//
// A small canonical-entity layer that recognizes natural-language subjects
// ("oil", "gold", "dollar", "bitcoin", "Indian banks", "US markets") that are
// not instruments in the deterministic universe (or map onto deterministic
// coverage like the Brent macro indicator or the Financials sector).
//
// This is NOT an intent router: the LLM remains the primary reasoner. This
// layer only (1) resolves what the user is talking about, (2) states what
// deterministic coverage exists for it, and (3) tells the model (and the
// deterministic fallback) how to answer honestly.
// ---------------------------------------------------------------------------

export type AssetClass =
  | 'index'
  | 'company'
  | 'sector'
  | 'commodity'
  | 'fx'
  | 'crypto'
  | 'global'
  | 'macro'

/** 'deterministic' = Finova data exists; 'web-only' = only searchWeb can cover it; 'hybrid' = both. */
export type SubjectCoverage = 'deterministic' | 'web-only' | 'hybrid'

export type SubjectDataRef =
  | { kind: 'macro'; id: string }
  | { kind: 'global'; id: string }
  | { kind: 'sector'; id: string }
  | { kind: 'index'; id: string }

export interface FinancialSubject {
  /** Canonical subject id (also used as the entityResolution entity id). */
  id: string
  label: string
  assetClass: AssetClass
  /** Entity type exposed through entityResolution. */
  entityType:
    | 'commodity'
    | 'fx'
    | 'crypto'
    | 'sector'
    | 'global'
    | 'macro'
    | 'index'
  /** Natural-language aliases, longest-first matching, word-boundary aware. */
  aliases: string[]
  coverage: SubjectCoverage
  /** Where deterministic evidence lives, when it exists. */
  dataRef?: SubjectDataRef
  /** Natural web-search query hint for news-type questions. */
  searchHint: string
  /** Guidance shown to the model when this subject is the turn's subject. */
  guidance: string
}

export const SUBJECTS: FinancialSubject[] = [
  {
    id: 'brent',
    label: 'Crude Oil (Brent)',
    assetClass: 'commodity',
    entityType: 'commodity',
    aliases: ['oil', 'crude', 'crude oil', 'brent', 'brent crude', 'wti'],
    coverage: 'hybrid',
    dataRef: { kind: 'macro', id: 'brent' },
    searchHint: 'crude oil price, supply, demand and geopolitics',
    guidance:
      "Finova's deterministic macro data has the daily Brent level (getMacroContext, indicator 'brent'); there is no live oil price series and no WTI-specific series. For drivers, news and supply-demand, use searchWeb. Never answer an oil question with Indian equity data.",
  },
  {
    id: 'gold',
    label: 'Gold',
    assetClass: 'commodity',
    entityType: 'commodity',
    aliases: ['gold'],
    coverage: 'hybrid',
    dataRef: { kind: 'macro', id: 'gold' },
    searchHint: 'gold price, central bank buying, safe-haven demand',
    guidance:
      "Finova's deterministic macro data has the daily gold spot level (getMacroContext, indicator 'gold'). For drivers and news, use searchWeb. Never answer a gold question with Indian equity data.",
  },
  {
    id: 'silver',
    label: 'Silver',
    assetClass: 'commodity',
    entityType: 'commodity',
    aliases: ['silver'],
    coverage: 'web-only',
    searchHint: 'silver price, industrial demand, precious metals',
    guidance:
      "Finova has no deterministic silver series in this session; only web evidence (searchWeb) can cover silver. Never answer with Indian equity data or fabricated prices.",
  },
  {
    id: 'commodities',
    label: 'Commodities',
    assetClass: 'commodity',
    entityType: 'commodity',
    aliases: ['commodities', 'commodity', 'commodity market', 'commodity markets'],
    coverage: 'hybrid',
    searchHint: 'commodities market news, oil, gold, metals',
    guidance:
      "Finova's deterministic data covers daily levels for Brent Crude and Gold (getMacroContext, indicators 'brent' and 'gold'). Other commodities require searchWeb.",
  },
  {
    id: 'bitcoin',
    label: 'Bitcoin',
    assetClass: 'crypto',
    entityType: 'crypto',
    aliases: ['bitcoin', 'btc'],
    coverage: 'web-only',
    searchHint: 'bitcoin price, crypto market news',
    guidance:
      "Finova has no deterministic crypto data source in this session; only web evidence (searchWeb) can cover Bitcoin. Never answer with Indian equity data or fabricated prices.",
  },
  {
    id: 'crypto',
    label: 'Cryptocurrencies',
    assetClass: 'crypto',
    entityType: 'crypto',
    aliases: [
      'crypto',
      'cryptocurrencies',
      'cryptocurrency',
      'crypto market',
      'crypto markets',
      'digital assets',
    ],
    coverage: 'web-only',
    searchHint: 'cryptocurrency market news',
    guidance:
      "Finova has no deterministic crypto data source in this session; only web evidence (searchWeb) can cover cryptocurrencies. Never answer with Indian equity data or fabricated prices.",
  },
  {
    id: 'usdinr',
    label: 'USD/INR (Dollar-Rupee)',
    assetClass: 'fx',
    entityType: 'fx',
    aliases: [
      'usd inr',
      'usd/inr',
      'dollar',
      'us dollar',
      'rupee',
      'inr',
      'dollar rupee',
      'dollar-rupee',
      'dollar rate',
      'usd',
    ],
    coverage: 'hybrid',
    dataRef: { kind: 'macro', id: 'usdinr' },
    searchHint: 'rupee vs dollar, RBI, oil imports',
    guidance:
      "Finova's deterministic macro data has the daily USD/INR level (getMacroContext, indicator 'usdinr'). For drivers and news, use searchWeb. Never answer an FX question with Indian equity data.",
  },
  {
    id: 'banks',
    label: 'Indian banks (Financials sector)',
    assetClass: 'sector',
    entityType: 'sector',
    aliases: ['banks', 'banking', 'bank stocks', 'banking sector', 'indian banks', 'indian banking', 'financials'],
    coverage: 'deterministic',
    dataRef: { kind: 'sector', id: 'financials' },
    searchHint: 'Indian banking sector news, credit growth, RBI',
    guidance:
      "The Financials sector is Finova's deterministic coverage for banks (analyzeSectors 'financials' / getMarketSnapshot sectors). Finova tracks no individual Indian bank prices except HDFC Bank (stock symbol HDFCBANK).",
  },
  {
    id: 'tech',
    label: 'Technology stocks (IT sector)',
    assetClass: 'sector',
    entityType: 'sector',
    aliases: ['tech', 'technology', 'tech stocks', 'technology stocks', 'it stocks', 'it sector', 'software stocks'],
    coverage: 'deterministic',
    dataRef: { kind: 'sector', id: 'it' },
    searchHint: 'IT sector earnings, tech stocks news',
    guidance:
      "The IT sector is Finova's deterministic coverage for technology stocks (analyzeSectors 'it' / getMarketSnapshot sectors).",
  },
  {
    id: 'energy',
    label: 'Energy sector',
    assetClass: 'sector',
    entityType: 'sector',
    aliases: ['energy', 'energy stocks', 'energy sector', 'oil stocks', 'oil and gas', 'energy companies'],
    coverage: 'deterministic',
    dataRef: { kind: 'sector', id: 'energy' },
    searchHint: 'energy sector news, oil prices',
    guidance:
      "The Energy sector is Finova's deterministic coverage (analyzeSectors 'energy' / getMarketSnapshot sectors). For crude drivers themselves, the Brent macro indicator (getMacroContext 'brent') applies.",
  },
  {
    id: 'india',
    label: 'Indian equity market',
    assetClass: 'index',
    entityType: 'index',
    aliases: [
      'india',
      'indian market',
      'indian markets',
      'indian equities',
      'indian stocks',
      'indian equity market',
      'indian stock market',
    ],
    coverage: 'deterministic',
    dataRef: { kind: 'index', id: 'nifty-50' },
    searchHint: 'Indian market news',
    guidance:
      "The Indian market is fully covered by Finova deterministic data (getMarketSnapshot, getMarketBreadth, getTechnicalAnalysis on nifty-50 / sensex).",
  },
  {
    id: 'global',
    label: 'Global markets',
    assetClass: 'global',
    entityType: 'global',
    aliases: ['global markets', 'global market', 'world markets', 'globally', 'worldwide', 'global equities'],
    coverage: 'hybrid',
    searchHint: 'global markets news',
    guidance:
      "Finova deterministic data covers the major global equity indices (getMarketSnapshot global: S&P 500, Nasdaq, Dow, FTSE, DAX, Nikkei, Hang Seng, Shanghai). Broader global coverage (commodities, geopolitics) requires searchWeb.",
  },
  {
    id: 'usmarkets',
    label: 'US markets',
    assetClass: 'global',
    entityType: 'global',
    aliases: ['us markets', 'us market', 'american markets', 'wall street'],
    coverage: 'hybrid',
    dataRef: { kind: 'global', id: 'spx' },
    searchHint: 'US market news, Federal Reserve',
    guidance:
      "US equity indices (S&P 500, Nasdaq, Dow) are in Finova's deterministic global data (getMarketSnapshot global). Broader US coverage requires searchWeb.",
  },
  {
    id: 'spx',
    label: 'S&P 500',
    assetClass: 'global',
    entityType: 'global',
    aliases: ['s&p 500', 's&p', 'spx'],
    coverage: 'hybrid',
    dataRef: { kind: 'global', id: 'spx' },
    searchHint: 'S&P 500 news, earnings season',
    guidance:
      "Covered by Finova's deterministic global index data (getMarketSnapshot global, id 'spx').",
  },
  {
    id: 'nasdaq',
    label: 'Nasdaq Composite',
    assetClass: 'global',
    entityType: 'global',
    aliases: ['nasdaq'],
    coverage: 'hybrid',
    dataRef: { kind: 'global', id: 'nasdaq' },
    searchHint: 'Nasdaq news, technology stocks',
    guidance:
      "Covered by Finova's deterministic global index data (getMarketSnapshot global, id 'nasdaq').",
  },
  {
    id: 'dow',
    label: 'Dow Jones Industrial Average',
    assetClass: 'global',
    entityType: 'global',
    aliases: ['dow jones', 'dow'],
    coverage: 'hybrid',
    dataRef: { kind: 'global', id: 'dow' },
    searchHint: 'Dow Jones news',
    guidance:
      "Covered by Finova's deterministic global index data (getMarketSnapshot global, id 'dow').",
  },
]

export interface FinancialSubjectMatch {
  subject: FinancialSubject
  /** The exact alias text matched in the user's input. */
  matched: string
  /** Character position of the match, so results can be ordered as spoken. */
  index: number
}

const SORTED = SUBJECTS.flatMap((s) =>
  s.aliases.map((alias) => ({ subject: s, alias })),
).sort((a, b) => b.alias.length - a.alias.length)

/**
 * Find financial subjects in free text. Longest aliases match first
 * ("crude oil" beats "oil"), each subject is returned at most once, and
 * matches are ordered by their position in the text.
 */
export function findFinancialSubjects(text: string): FinancialSubjectMatch[] {
  if (!text) return []
  const lower = text.toLowerCase()
  const seen = new Set<string>()
  const out: FinancialSubjectMatch[] = []

  for (const { subject, alias } of SORTED) {
    if (seen.has(subject.id)) continue
    const index = indexOfWord(lower, alias)
    if (index >= 0) {
      seen.add(subject.id)
      out.push({ subject, matched: alias, index })
    }
  }
  return out.sort((a, b) => a.index - b.index)
}

/** Find the first word-boundary match and return its character position. */
function indexOfWord(text: string, needle: string): number {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i')
  const m = re.exec(text)
  if (!m) return -1
  return m.index + m[1].length
}

/** Look up a subject by canonical id. */
export function findSubjectById(id: string): FinancialSubject | undefined {
  return SUBJECTS.find((s) => s.id === id)
}