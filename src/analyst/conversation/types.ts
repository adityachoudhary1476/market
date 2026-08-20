// ---------------------------------------------------------------------------
// Phase 3D.1 — Conversation & Context Intelligence: core types
//
// The conversation layer is CONTEXT INFRASTRUCTURE, not an intent router. It
// remembers what the user asked, which instruments are in play, how entities
// were referred to, comparisons that were started and corrections that were
// made — and hands the LLM a bounded, deterministic summary. The LLM stays the
// semantic reasoner: it interprets, picks tools and synthesizes. This layer
// never decides "the user asked X, so answer with Y".
//
// Design rules:
//   - SESSION-ONLY memory: no persistence, no accounts, no network. State is
//     bounded (every list has a cap) and lives for the active session only.
//   - Deterministic: every timestamp comes from an injected clock / explicit
//     `now` — no Date.now() inside state operations.
//   - No fabrication: nothing here invents entities, dates, sources or values.
//     Unknown references resolve to `unresolved`, never a silent guess.
//   - No server imports: this module must stay safe in the browser bundle.
// ---------------------------------------------------------------------------

import type { AnalystResponse } from '../types'
import type { NewsItem, NewsFreshness, WebSearchResult } from '../websearch/types'

// --- Determinism ------------------------------------------------------------

/** Injectable clock so tests (and the orchestrator) fix the wall clock. */
export type Clock = () => number

// --- Limits ----------------------------------------------------------------

export interface FreshnessPolicy {
  /**
   * How long market/technical tool evidence stays "fresh". Operational
   * default (15 min), documented in README — it is a policy knob, not a
   * claim about news lifecycles.
   */
  marketDataTtlMs: number
  /** How long web/evidence findings stay "fresh" (default 1 hour). */
  evidenceTtlMs: number
  /** How long assistant summaries stay "fresh" (default 1 hour). */
  summaryTtlMs: number
}

export interface ConversationConfig {
  /** Maximum remembered turns (older memory is dropped, not deleted — dropped). */
  maxConversationTurns: number
  /** Maximum entities tracked as "active" (current focus). */
  maxActiveEntities: number
  /** Maximum previously-seen entities remembered beyond the active set. */
  maxRecentEntities: number
  /** Maximum remembered findings (response-derived memory). */
  maxConversationFindings: number
  /** Maximum remembered web sources. */
  maxConversationSources: number
  /** Maximum remembered live-news stories (Phase 3N.1). */
  maxConversationNews: number
  /** Maximum remembered corrections. */
  maxCorrections: number
  /** Truncation cap for stored summaries. */
  maxSummaryChars: number
  /** Hard cap for the context payload rendered for the LLM. */
  maxContextChars: number
  /**
   * Reference resolutions at or above this confidence (0..1) are safe to
   * assume; below it, the interpretation is flagged as ambiguous so the LLM
   * can decide whether to ask. high=0.9, medium=0.6, low=0.3, unresolved=0.
   */
  referenceConfidenceThreshold: number
  /** Freshness classification thresholds. */
  freshness: FreshnessPolicy
}

export const DEFAULT_CONVERSATION_CONFIG: ConversationConfig = {
  maxConversationTurns: 20,
  maxActiveEntities: 8,
  maxRecentEntities: 12,
  maxConversationFindings: 12,
  maxConversationSources: 12,
  maxConversationNews: 8,
  maxCorrections: 8,
  maxSummaryChars: 6000,
  maxContextChars: 16_000,
  referenceConfidenceThreshold: 0.5,
  freshness: {
    marketDataTtlMs: 15 * 60_000,
    evidenceTtlMs: 60 * 60_000,
    summaryTtlMs: 60 * 60_000,
  },
}

// --- Shared value types ----------------------------------------------------

export type ReferenceConfidence = 'high' | 'medium' | 'low' | 'unresolved'

export type Freshness = 'fresh' | 'recent' | 'stale' | 'expired' | 'unknown'

// --- Memory records --------------------------------------------------------

export interface ConversationEntity {
  /** Canonical instrument id, e.g. 'nifty-50' or 'TCS'. */
  id: string
  displayName: string
  type: 'index' | 'stock' | 'commodity' | 'fx' | 'crypto' | 'sector' | 'global' | 'macro'
  /** 'primary' = current focus of the conversation. */
  role: 'primary' | 'context'
  firstSeenTurn: number
  lastSeenTurn: number
  /** Wall-clock time the entity was last mentioned/resolved. */
  retrievedAt: number
  freshness: Freshness
  /** The exact alias text matched in the user's input (mention provenance). */
  matched?: string
}

/** An in-progress instrument comparison the user started. */
export interface ComparisonMemory {
  /** Canonical ids of the compared instruments (2 max). */
  entities: string[]
  /** Bounded list of dimension nouns the user cares about (e.g. momentum). */
  dimensions: string[]
  sourceTurn: number
}

export interface UserTurnMemory {
  turn: number
  text: string
}

export interface ConversationSummary {
  turn: number
  title: string
  summary: string
  intent: AnalystResponse['intent']
  confidence?: AnalystResponse['confidence']
  partial: boolean
  generatedAt: string
  freshness: Freshness
}

export interface FindingMemory {
  turn: number
  entity?: string
  kind: 'fact' | 'inference' | 'recommendation'
  title: string
  detail: string
  retrievedAt: number
  freshness: Freshness
}

export interface ToolEvidenceMemory {
  turn: number
  tool: string
  entity?: string
  ok: boolean
  available: boolean
  /** Compact, bounded note about what the tool reported. */
  note: string
  retrievedAt: number
  freshness: Freshness
}

export interface SourceMemory {
  turn: number
  url: string
  title: string
  snippet: string
  publishedAt: string | null
  retrievedAt: number
  freshness: Freshness
}

/**
 * Phase 3N.1 — one remembered live-news story (from searchNews evidence).
 * Bounded like every memory record; stores only the deterministic signals the
 * news layer already computed (never raw tool output).
 */
export interface NewsMemory {
  turn: number
  /** The news subject that was searched. */
  subject: string
  /** Headline of the story's first (canonical) article. */
  headline: string
  url: string
  publishedAt: string | null
  /** Deterministic freshness tier from the real publishedAt. */
  newsFreshness: NewsFreshness
  /** True when >=2 independent outlets reported the story. */
  corroborated: boolean
  retrievedAt: number
}

export interface TemporalContext {
  /** The exact text matched in the user's message. */
  raw: string
  /** Normalized description — never a fabricated absolute date. */
  normalized: string
  kind: 'relative-period' | 'relative-point' | 'day-of-week' | 'moment' | 'none'
  confidence: ReferenceConfidence
  turn: number
}

export interface CorrectionMemory {
  turn: number
  /** The raw correction phrase, e.g. "Actually, I meant Infosys". */
  raw: string
  /** Entity the user walked back (when it can be determined). */
  previous?: string
  /** Entity the user meant instead (when it can be determined). */
  corrected?: string
}

export interface LastResponseMetadata {
  turn: number
  intent: AnalystResponse['intent']
  title: string
  confidence?: AnalystResponse['confidence']
  partial: boolean
  generatedAt: string
}

// --- Phase 3O — analytical thread -------------------------------------------

/** What kind of question the current analytical thread is answering. */
export type QuestionKind =
  | 'directional'
  | 'explanatory'
  | 'comparison'
  | 'news'
  | 'status'
  | 'other'

/** The timeframe the current thread is anchored to (matches Understanding). */
export type ThreadTimeframe = 'today' | 'recent' | 'longer' | 'unspecified'

/**
 * Phase 3O — the live analytical thread of the conversation: the current
 * question, its direction, the conclusion so far, what supports and opposes
 * it, the active comparison and the news themes in play.
 *
 * Bounded by construction (single record, capped lists, truncated prose) and
 * derived DETERMINISTICALLY from what actually happened: the response summary
 * (conclusion), the evidence groups (supporting/opposing factors via the
 * responseIntelligence directional classifier) and the turn's news (themes).
 * Nothing here is guessed from prose — fields the evidence cannot support
 * stay null/empty.
 */
export interface AnalyticalThread {
  turn: number
  /** Canonical id of the instrument this thread is about (active topic). */
  subjectId: string | null
  /** Display name of the subject (e.g. "Nifty 50"). */
  subjectLabel: string | null
  /** Bounded copy of the user's question this thread answers. */
  question: string
  questionKind: QuestionKind
  timeframe: ThreadTimeframe | null
  /**
   * Directional read derived from the evidence groups ('bull' / 'bear' /
   * 'mixed'), or null when the evidence carries no directional signal.
   */
  thesis: 'bull' | 'bear' | 'mixed' | null
  /** Bounded copy of the latest conclusion (response summary/title). */
  conclusion: string
  confidence?: AnalystResponse['confidence']
  partial: boolean
  /** Evidence groups that support the read (analyst vocabulary, capped 4). */
  supportingFactors: string[]
  /** Honest conflict notes opposing the read (capped 4). */
  opposingFactors: string[]
  /** Canonical ids of the active comparison pair (capped 2). */
  comparisonIds: string[]
  /** Theme lines of the turn's news (capped 3). */
  newsThemes: string[]
  /** Turn that last updated the thread (the latest completed turn). */
  lastUpdatedTurn: number
}

// --- Resolution ------------------------------------------------------------

export interface ReferenceResolution {
  /** The exact token(s) resolved, e.g. "it", "which one". */
  raw: string
  /** Canonical entity id when a reference was resolved. */
  entityId?: string
  displayName?: string
  confidence: ReferenceConfidence
  reason: string
  kind: 'pronoun' | 'comparison' | 'role' | 'entity'
}

export interface ContextInterpretation {
  /** Entities this turn explicitly mentions or resolves to (canonical records). */
  entities: ConversationEntity[]
  references: ReferenceResolution[]
  temporal: TemporalContext | null
  comparison: ComparisonMemory | null
  /** True when a reference is ambiguous below the confidence threshold. */
  needsClarification: boolean
}

/** The result of resolving ONE user turn against the conversation state. */
export interface TurnResolution {
  text: string
  interpretation: ContextInterpretation
  /** Detected corrections this turn (raw phrase + walked-back/target ids). */
  corrections: CorrectionDetect[]
  /** Bounded, rendered context payload for the LLM (system message). */
  payload: string
}

/** Structural correction info carried by a TurnResolution. */
export interface CorrectionDetect {
  raw: string
  previous?: string
  corrected?: string
}

// --- Session ---------------------------------------------------------------

export interface ConversationUpdateInput {
  response: AnalystResponse
  /** Tool evidence gathered this turn (compact summaries stored only). */
  evidence: Array<{ result: import('../tools/types').ToolResult; entity?: string }>
  /** Validated web evidence this response actually cites. */
  sources: WebSearchResult[]
  /** Phase 3N.1 — validated live-news stories gathered this turn. */
  news?: NewsItem[]
  /**
   * Phase 3O — the turn's question kind and timeframe (computed by the
   * orchestrator from the structured UNDERSTAND stage). Stored so the thread
   * is deterministic; omitted call sites fall back to the intent mapping.
   */
  thread?: { questionKind: QuestionKind; timeframe: ThreadTimeframe }
  now: number
}

/**
 * The session owns the conversation state for one analyst conversation.
 * `resolve` is pure (never mutates); `update` records a completed turn;
 * `reset` clears all memory for a fresh session.
 */
export interface ConversationSession {
  readonly state: ConversationState
  readonly config: ConversationConfig
  resolve(text: string, now: number): TurnResolution
  update(resolution: TurnResolution, input: ConversationUpdateInput): void
  reset(): void
}

// --- State -----------------------------------------------------------------

export interface ConversationState {
  conversationId: string
  turnCount: number
  /** Canonical id of the instrument the conversation currently focuses on. */
  activeTopic: string | null
  activeEntities: ConversationEntity[]
  recentEntities: ConversationEntity[]
  activeComparison: ComparisonMemory | null
  /** The user's current/last question. */
  activeQuestion: string | null
  recentUserMessages: UserTurnMemory[]
  recentAssistantSummaries: ConversationSummary[]
  recentToolEvidence: ToolEvidenceMemory[]
  recentFindings: FindingMemory[]
  unresolvedReferences: ReferenceResolution[]
  temporalContext: TemporalContext | null
  lastResponseMetadata: LastResponseMetadata | null
  /** Phase 3O — the live analytical thread (latest completed turn). */
  analyticalThread: AnalyticalThread | null
  lastSources: SourceMemory[]
  recentNews: NewsMemory[]
  corrections: CorrectionMemory[]
  createdAt: number
  updatedAt: number
}