// ---------------------------------------------------------------------------
// Phase 3A — Agent layer: LLM-facing tool catalog
//
// Enriches the Phase 2E registry definitions with what an LLM needs to choose
// well: when to use the tool, what the output means, and the data-availability
// constraints of this build. The orchestrator passes these to the provider.
// No implementation details leak — tools are capability descriptions.
// ---------------------------------------------------------------------------

import type { ToolDefinition } from '../tools/types'
import type { AnalystToolRegistry } from '../tools/registry'

const AVAILABILITY_NOTES: Record<string, string> = {
  getMarketSnapshot: 'Whole-market regime for INDIAN equities, plus global equity indices only (S&P 500, Nasdaq, Dow, FTSE, DAX, Nikkei, Hang Seng, Shanghai). NOT a commodity, FX or crypto quote source — do not use it for oil, gold, dollar, bitcoin or similar subjects.',
  getMarketBreadth: 'Advance/decline, new highs/lows for INDIAN equities. Use for participation/health questions beneath the index.',
  analyzeSectors: 'Sector performance table for INDIAN sectors (financials, it, energy, ...). Use for rotation/leadership questions.',
  getMarketMovers: 'Gainers/losers/most-active with relative volume for INDIAN stocks. Use for stock-level action questions.',
  getMacroContext: 'Macro indicators: rates, India VIX, oil (Brent, indicator "brent"), gold (indicator "gold"), USD/INR (indicator "usdinr"). Use for commodity/FX/macro-driver questions — this is the ONLY deterministic source for oil/gold/rupee levels.',
  getTechnicalAnalysis: 'Trend, momentum (RSI/MACD), volatility, volume, structure, S/R, signals for ONE instrument. Only nifty-50, sensex, bank-nifty and nifty-it have price series; other ids (incl. commodities like "crude" or "brent") return UNSUPPORTED_INSTRUMENT — never call it for them.',
  detectPatterns: 'Chart patterns (head-and-shoulders, flags, etc.) and candlestick patterns for one instrument (Indian index price series only).',
  detectDivergences: 'Price vs oscillator divergences (bullish/bearish) for one instrument (Indian index price series only).',
  detectBreakouts: 'Breakout detections with levels and volume context for one instrument (Indian index price series only).',
  getConfluence: 'Aggregated evidence: bias, decomposable score, evidence groups, conflicts, thesis. Use for "challenge the thesis" or weighing all evidence.',
  getHistoricalValidation: 'Walk-forward validation of similar setups (no lookahead). Use for reliability questions. Always caveat sample size.',
  compareInstruments: 'Side-by-side comparison of two or more instruments (quotes and technical evidence where available).',
  searchWeb: 'Live web search (news, events, announcements). Only offered when the session has a configured search gateway. Returns ONLY real, validated sources — never fabricate URLs, dates or snippets. This is the source for commodity/FX/crypto news and drivers.',
  searchNews: 'Live news on a subject ("what is happening with X", "any developments?", "latest headlines"). Returns the top stories with a deterministic freshness tier, a source quality tier and how many outlets independently report each story. Only offered when the session has a configured search gateway. Use for news questions; use searchWeb for general factual lookups.',
}

export const UNIVERSE_HINT =
  'Only index instruments (nifty-50, sensex, bank-nifty, nifty-it) have price series for technical tools in this build. Stocks (e.g. TCS, INFY) have quotes/breadth data; technical/pattern/confluence/historical tools return available=false for them with warnings. Commodities (crude, gold), FX and crypto have NO price series — only the macro levels (Brent, Gold, USD/INR via getMacroContext) and web search can cover them.'

export interface CatalogEntry extends ToolDefinition {
  /** Concatenated description: original + availability note. */
  hint: string
}

export interface BuildCatalogOptions {
  /**
   * Include the searchWeb tool. The orchestrator offers it ONLY when the
   * session actually has a search transport (locked decision 6: dynamic
   * tool selection stays with the orchestrator).
   */
  includeWebSearch?: boolean
  includeSearchWeb?: boolean
  includeSearchNews?: boolean
}

/** Build the LLM-facing tool list for one session. */
export function buildToolCatalog(registry: AnalystToolRegistry, options: BuildCatalogOptions = {}): CatalogEntry[] {
  const includeWebSearch = options.includeWebSearch ?? true
  const webTools = new Set(['searchWeb', 'searchNews'])
  const includeSearchWeb = options.includeSearchWeb ?? includeWebSearch
  const includeSearchNews = options.includeSearchNews ?? includeWebSearch
  return registry
    .definitions()
    .filter((def) => {
      if (def.name === 'searchWeb') return includeSearchWeb
      if (def.name === 'searchNews') return includeSearchNews
      return includeWebSearch || !webTools.has(def.name)
    })
    .map((def) => {
      const note = AVAILABILITY_NOTES[def.name]
      return {
        ...def,
        hint: note ? `${def.description}\n${note}` : def.description,
      }
    })
}

/** The provider-facing definitions (OpenAI-style) — hint folded into description. */
export function buildProviderTools(registry: AnalystToolRegistry, options: BuildCatalogOptions = {}): ToolDefinition[] {
  return buildToolCatalog(registry, options).map((entry) => ({
    name: entry.name,
    description: entry.hint,
    parameters: entry.parameters,
  }))
}