// ---------------------------------------------------------------------------
// Finova AI Analyst — domain types
//
// The analyst always returns STRUCTURED responses (not free-form text), so the
// UI can render rich, consistent layouts and so a future LLM can be swapped in
// behind the same `AnalystEngine` interface without component changes.
// ---------------------------------------------------------------------------

export type Confidence = 'High' | 'Medium' | 'Low'

export type FactKind = 'fact' | 'inference' | 'recommendation'

export type Intent =
  | 'summary' // "what's happening" / greeting
  | 'insights' // "what do you notice"
  | 'explain' // "why" — explain a move/metric
  | 'compare' // period/index/sector comparison
  | 'detect' // anomalies / risks / unusual activity
  | 'plan' // turn a goal into a plan
  | 'optimize' // what to improve
  | 'next' // "what should I do next" — ONE action
  | 'missing' // "what am I missing"
  | 'briefing' // daily briefing
  | 'weekly' // weekly review
  | 'ask' // free-form fallback

export interface AnalystMetric {
  label: string
  value: string
  /** Optional delta vs a comparison baseline, e.g. "+0.8%" */
  delta?: string
  trend?: 'up' | 'down' | 'flat'
  /** Marks this as the hero metric for the response. */
  primary?: boolean
}

export interface AnalystFinding {
  kind: FactKind
  title: string
  detail: string
  metric?: string
}

export type AnalystActionKind =
  | 'explore'
  | 'add-watchlist'
  | 'set-alert'
  | 'analyze'
  | 'plan'
  | 'explain'

export interface AnalystAction {
  label: string
  kind: AnalystActionKind
  /** Internal route or target symbol/sector. */
  to?: string
  /** Optional machine-readable payload for a future action handler. */
  payload?: Record<string, string | number | boolean>
}

export interface AnalystChartPoint {
  label: string
  value: number
}

export interface AnalystChart {
  title: string
  type: 'bar' | 'line'
  unit?: string
  points: AnalystChartPoint[]
  /** Highlight a specific point (e.g. the comparison baseline). */
  highlightLast?: boolean
}

export interface PlanStep {
  time: string
  title: string
  detail?: string
  action?: AnalystAction
}

export interface AnalystResponse {
  id: string
  intent: Intent
  title: string
  /** One-line summary shown directly under the title. */
  summary?: string
  metrics?: AnalystMetric[]
  sections?: {
    heading: string
    kind?: FactKind
    /** Either bullets or paragraphs are provided. */
    bullets?: string[]
    body?: string
  }[]
  findings?: AnalystFinding[]
  recommendations?: string[]
  actions?: AnalystAction[]
  chart?: AnalystChart
  plan?: PlanStep[]
  /** Tabular comparison output. */
  table?: {
    headers: string[]
    rows: (string | number)[][]
    caption?: string
  }
  confidence?: Confidence
  followUps?: string[]
  /** ISO timestamp this analysis was produced. */
  generatedAt: string
  /** True when the engine could not fully answer with available data. */
  partial?: boolean
  /**
   * Phase 3C.1 — validated web search evidence this answer actually cites.
   * Populated ONLY from real search executions by the orchestrator — never
   * from model output, and never fabricated.
   */
  sources?: import('./websearch/types').WebSearchResult[]
}

export interface AnalystInsight {
  id: string
  category: 'attention' | 'positive' | 'negative' | 'opportunity' | 'pattern'
  title: string
  detail: string
  metric?: string
  trend?: 'up' | 'down' | 'flat'
  confidence?: Confidence
  action: AnalystAction
}

export interface ConversationMessage {
  id: string
  role: 'user' | 'analyst'
  text: string
  response?: AnalystResponse
  /** Present while a response is being generated. */
  pending?: boolean
  /**
   * Phase 3N — stage-aware loading statuses for this pending message, so the
   * UI shows what the analyst is actually doing instead of a generic spinner.
   */
  stages?: string[]
  error?: boolean
  createdAt: string
}

/** Normalized, compact market context handed to the analyst engine. */
export interface AnalystContext {
  generatedAt: string
  regime: 'risk-on' | 'risk-off' | 'mixed' | 'neutral'
  indices: Array<{
    id: string
    symbol: string
    name: string
    value: number
    changePct: number
    trend: 'up' | 'down' | 'flat'
    prevClose: number
    dayHigh: number
    dayLow: number
  }>
  sectors: Array<{
    id: string
    name: string
    changePct: number
    strength: number
    advancers: number
    decliners: number
  }>
  breadth: {
    advancing: number
    declining: number
    unchanged: number
    newHighs: number
    newLows: number
    ratio: number
    advPct: number
  }
  gainers: Array<{
    symbol: string
    name: string
    changePct: number
    price: number
    volume: number
    avgVolume: number
    sector: string
  }>
  losers: Array<{
    symbol: string
    name: string
    changePct: number
    price: number
    volume: number
    avgVolume: number
    sector: string
  }>
  active: Array<{
    symbol: string
    name: string
    changePct: number
    volume: number
    relVolume: number
    sector: string
  }>
  macro: Array<{
    id: string
    label: string
    value: string
    changePct: number
    invertColor?: boolean
  }>
  global: Array<{
    id: string
    name: string
    region: string
    changePct: number
    trend: 'up' | 'down' | 'flat'
  }>
  /**
   * Technical evidence derived from real OHLCV history. Always present but may
   * have `available: false` when the source lacks sufficient bars. This is the
   * structured evidence Phase 2B/2C and the future LLM consume.
   */
  technical?: import('./technical').StructuredTechnicalContext
  /**
   * Empirical validation of how similar historical setups performed afterwards.
   * Computed walk-forward from the same historical series (zero lookahead).
   * Always present; `available: false` when the source cannot support
   * reliable validation (e.g. insufficient bars). Evidence only — never a
   * prediction or recommendation.
   */
  historicalValidation?: import('./technical/historical').HistoricalValidationContext
}
