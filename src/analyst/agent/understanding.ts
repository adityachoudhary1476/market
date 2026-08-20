// ---------------------------------------------------------------------------
// Phase 3D — Agent layer: structured understanding (the UNDERSTAND stage)
//
// Deterministic, compact signal extraction for the current turn: which
// financial subject(s) the user is talking about, the asset class, the
// intent, the timeframe, whether the scope is broad, and whether a
// clarification is genuinely needed. This feeds the model context note and
// the deterministic fallback — it does NOT route or restrict the LLM.
// ---------------------------------------------------------------------------

import {
  findFinancialSubjects,
  type FinancialSubjectMatch,
  type AssetClass,
} from './subjects'
import { findEntityMentions } from './entityResolution'
import type { QuestionKind, ThreadTimeframe } from '../conversation/types'

export type UnderstandingIntent =
  | 'current_market_status'
  | 'explain_move'
  | 'news'
  | 'forecast_outlook'
  | 'compare'
  | 'impact'
  | 'technical'
  | 'other'

export type UnderstandingTimeframe = 'today' | 'recent' | 'longer' | 'unspecified'

export type UnderstandingScope = 'specific' | 'broad'

/**
 * Phase 3O — the type of continuation a turn is, when it continues the
 * current analytical thread. `new` means the turn starts a fresh question;
 * `clarify` means the turn cannot be resolved and one concise clarification
 * is warranted. The rest are progressive-disclosure directives that tell the
 * model HOW to answer the follow-up (expand vs risks vs drivers vs deepen…)
 * instead of treating it as a brand-new question.
 */
export type FollowUpKind =
  | 'new'
  | 'why'
  | 'expand'
  | 'deepen'
  | 'drivers'
  | 'risks'
  | 'premise'
  | 'opinion'
  | 'switch-subject'
  | 'temporal-compare'
  | 'counterfactual'
  | 'bull-bear'
  | 'confirmed'
  | 'clarify'
  | 'other'

/**
 * Phase 3O — options that let the UNDERSTAND stage classify a follow-up
 * correctly. `hasActiveTopic` is true when the session memory already holds a
 * subject the turn may continue ("why?" → the active Nifty thesis).
 */
export interface UnderstandTurnOptions {
  hasActiveTopic?: boolean
}

/**
 * Phase 3N — the depth of answer a question warrants. Deterministic, compact
 * and derived from intent/timeframe/question length: brief questions get
 * brief answers, deep questions get structured depth. This is guidance for
 * the LLM (via the context note) and for the fallback — it never changes the
 * schema or weakens validation.
 */
export type UnderstandingDepth = 'brief' | 'standard' | 'deep'

export interface Understanding {
  /** The raw user text that was understood. */
  text: string
  /** Explicit subjects mentioned in the text, in spoken order. */
  subjects: FinancialSubjectMatch[]
  /** The main subject of the turn, or null when none was mentioned. */
  primary: FinancialSubjectMatch | null
  /** A second subject (e.g. "oil … and India"), or null. */
  secondary: FinancialSubjectMatch | null
  /** Asset classes represented by the resolved subjects/entities. */
  assetClasses: AssetClass[]
  intent: UnderstandingIntent
  timeframe: UnderstandingTimeframe
  scope: UnderstandingScope
  /**
   * Phase 3N — how deep the answer should be. A status question ("how is
   * NIFTY doing?") is brief; an outlook or long-horizon question is deep.
   */
  depth: UnderstandingDepth
  /**
   * Phase 3O — how this turn continues (or starts) the analytical thread.
   * A bare "why?" with an active topic is a `why` continuation; "go deeper"
   * is `deepen`; a fresh question with its own instrument is `new`.
   */
  followUp: FollowUpKind
  /** True when the turn continues the active thread (not new/other/clarify). */
  continuation: boolean
  /**
   * Phase 3O — a causal claim the user asserted ("…because of banks, right?").
   * When present, the model must EVALUATE it against the evidence and say
   * plainly when the data does not support it — never inherit a premise.
   */
  premise: string | null
  /**
   * True only when the question is genuinely ambiguous — no subject, no
   * broad-market wording, and a bare pronoun ("how is it doing?").
   */
  needsClarification: boolean
  /** Natural web-search query hint for news-type questions, or null. */
  newsHint: string | null
  /**
   * Phase 3N.3 — true for market-driver questions: "what is happening with X",
   * "why is X moving", "what is driving X", "is X bullish/bearish". For these,
   * price levels alone are never a complete answer — the agent must
   * investigate current catalysts (searchNews/searchWeb) and combine them with
   * the deterministic market data, and say plainly when no catalyst can be
   * established.
   */
  catalystRelevant: boolean
  /**
   * Phase 3N.5 — true for bull/bear DEBATE asks: "is X bullish right now?",
   * "are you bullish on X?", "what's your read on X?", "should I buy X?",
   * "give me the bull case and the bear case". These warrant the full debate
   * structure: a calibrated verdict, a bull case, a bear case, what is
   * winning right now, and what would invalidate the view. Requires an
   * explicit subject (or the explicit "bull and bear case" phrasing).
   */
  debate: boolean
}

// Intent signals, checked in precedence order (explain > forecast > impact >
// compare > news > technical > status). Compact and pattern-based on purpose:
// the LLM stays the primary reasoner; this is only a signal estimate.
const INTENT_SIGNALS: Array<{
  intent: UnderstandingIntent
  pattern: RegExp
}> = [
  {
    intent: 'explain_move',
    pattern:
      /\b(why|explain|reason|because|cause|caused|drove|driving|what made|what is driving|what's driving)\b/i,
  },
  {
    intent: 'forecast_outlook',
    pattern:
      /\b(outlook|forecast|prediction|projections?|expected to|where do you think|going to (go|keep)|keep (rising|falling|climbing)|what happens if|expectations?)\b/i,
  },
  {
    intent: 'impact',
    pattern:
      /\b(affect|affects|impact|implications?|mean for|effect on|influence|how would|how does)\b/i,
  },
  {
    intent: 'compare',
    pattern: /\b(compare|comparison|versus|vs\.?|between)\b/i,
  },
  {
    intent: 'news',
    pattern:
      /\b(news|latest|headlines?|updates?|developments?|happened|anything (new|interesting|going on)|coverage|breaking)\b/i,
  },
  {
    intent: 'technical',
    pattern:
      /\b(technical|technicals|chart|rsi|macd|support|resistance|momentum|breakout|moving average|trendline)\b/i,
  },
  {
    intent: 'current_market_status',
    pattern:
      /\b(what'?s? happening|what is happening|what'?s? going on|how (are|is)|how'?s?|doing|status|movement|moving)\b/i,
  },
]

const TIMEFRAME_SIGNALS: Array<{ timeframe: UnderstandingTimeframe; pattern: RegExp }> = [
  {
    timeframe: 'today',
    pattern:
      /\b(rn|right now|now|today|currently|at the moment|latest|just now|this (morning|afternoon|evening)|overnight)\b/i,
  },
  {
    timeframe: 'recent',
    pattern:
      /\b(this week|last week|weekend|recently|lately|past few (days|weeks)|since (yesterday|monday|tuesday|wednesday|thursday|friday))\b/i,
  },
  {
    timeframe: 'longer',
    pattern: /\b(long term|long-term|this year|quarter|annual|outlook)\b/i,
  },
]

const BROAD_WORDING = /\b(markets?|global|globally|world|everything|broad|indices)\b/i
const BARE_PRONOUN = /\b(it|this|that|they|them)\b/i

/**
 * Phase 3N.3 — "what is happening with X" / "what is going on with X" wording:
 * a driver/catalyst question even when the intent signal classifies it as a
 * status ask. Price levels alone are not a complete answer for these.
 */
const WHATS_HAPPENING_RE =
  /\b(what'?s? happening (with|to)|what is happening (with|to)|what'?s? going on (with|to)|what is going on (with|to))\b/i

// --- Phase 3O — follow-up / continuation classification ----------------------
//
// Determines how a turn continues (or starts) the analytical thread. These are
// PROGRESSIVE-DISCLOSURE signals: they tell the model HOW to answer ("expand
// the reasoning", "focus on invalidation", "investigate drivers") — they never
// route the answer or replace the LLM. Deterministic, bounded, pattern-based.

const SWITCH_SUBJECT_RE = /^\s*(what about|how about|and|also)\b/i

const COUNTERFACTUAL_RE =
  /\b(what (if|happens if|would happen if)|what would (that|it|the (market|move)) do)\b/i

const CAUSAL_RE = /\b(because|due to|thanks to|as a result of)\b/i

const OPINION_RE =
  /\b(would you (be|chase|buy|enter)|what do you think|what('?s| is) your (view|take|read|opinion)|do you (like|fancy|think)|your opinion|how do you see|should i (buy|chase|enter)|are you bullish)\b/i

const BULL_BEAR_RE =
  /\b(bull and bear (case|side|story)|both (cases|sides)|bear case|case for (and against)|bull case and the bear case)\b/i

/**
 * Phase 3N.5 — directional/opinion asks that warrant a bull/bear DEBATE when
 * they carry an explicit subject: "is oil bullish right now?", "are you
 * bullish on brent?", "what's your read on oil?", "do you like TCS?",
 * "should I buy the dip?". Combined with BULL_BEAR_RE (the explicit "bull and
 * bear case" phrasing) to set `understanding.debate`.
 */
const DEBATE_DIRECTIONAL_RE =
  /\b(is\s+[\w ,.'&()/=-]{1,50}\s+(bullish|bearish|rallying|declining|trending (up|down)|going (up|down|higher|lower)|climbing|sliding|strengthening|weakening|bullish|bearish)|are you (bullish|bearish)\s+(on|about|re)|what('?s| is) your (read|take|view|opinion|call)\s+on|what do you think (of|about)|do you (like|fancy|buy|favour|favor)|should i (buy|sell|chase|enter|short|long|accumulate|average)|your (read|take|view|opinion|call) (on|about)|how do you (see|read) (the|this|that))\b/i

const CONFIRMED_RE = /\b(confirmed|just reported|merely reported|actually (confirmed|verified)|verified|corroborat\w*|is that reported)\b/i

const TEMPORAL_COMPARE_RE =
  /\b(compared with|compared to|vs\.? (yesterday|last|earlier|before)|since earlier|what changed|same story|still the same|different (from|than) (yesterday|earlier|before)|this time last|since this (morning|afternoon)|relative to (yesterday|last week|earlier))\b/i

const DRIVERS_RE =
  /\b(what'?s (actually )?driving|what is (actually )?driving|what'?s behind|what is behind|what'?s (really )?going on with|what is (really )?going on with|behind the move|underlying the move|what'?s moving)\b/i

const RISKS_RE =
  /\b(what could (kill|break|invalidate|derail|undo|change|go wrong)|what would (invalidate|break|change)|what'?s the (risk|catch|downside)|what are the risks|biggest risk|main risk|risk to that|against that|the other side)\b/i

const DEEPEN_RE = /\b(go deeper|deeper|elaborate|expand (on|that|this|it)|more detail|fuller|further detail|in more depth|more depth|get into it)\b/i

const EXPAND_RE = /\b(expand|tell me more|more on that|continue|keep going)\b/i

const WHY_RE = /\b(why|explain|what do you mean|what makes|what'?s the logic|why do you say)\b/i

const CAUSAL_CLAUSE_RE = /\b(?:because|due to|thanks to|as a result of)\s+([^.!?;]{5,140})/i

/** Extract the user's asserted causal claim (bounded), or null. */
export function extractPremise(text: string): string | null {
  const m = text.match(CAUSAL_CLAUSE_RE)
  if (!m) return null
  return m[1].trim().replace(/^of\s+/i, '').replace(/[,;:]+$/, '').slice(0, 140) || null
}

/**
 * Classify how this turn continues the analytical thread. Deterministic.
 * `hasActiveTopic` tells the classifier whether a bare follow-up ("why?",
 * "what could kill it?") has a thread to continue.
 */
export function classifyFollowUp(text: string, options: UnderstandTurnOptions = {}): { kind: FollowUpKind; premise: string | null } {
  const lower = text.toLowerCase()
  const hasEntity = findEntityMentions(text).length > 0
  const thread = options.hasActiveTopic === true

  if (COUNTERFACTUAL_RE.test(lower)) return { kind: 'counterfactual', premise: null }
  if (CAUSAL_RE.test(lower)) return { kind: 'premise', premise: extractPremise(text) }
  if (OPINION_RE.test(lower)) return { kind: 'opinion', premise: null }
  if (BULL_BEAR_RE.test(lower)) return { kind: thread ? 'bull-bear' : 'new', premise: null }
  if (CONFIRMED_RE.test(lower)) return { kind: thread ? 'confirmed' : 'new', premise: null }
  if (TEMPORAL_COMPARE_RE.test(lower)) return { kind: thread ? 'temporal-compare' : 'new', premise: null }
  if (hasEntity && SWITCH_SUBJECT_RE.test(lower)) return { kind: 'switch-subject', premise: null }

  if (!hasEntity) {
    if (DRIVERS_RE.test(lower)) return { kind: thread ? 'drivers' : 'clarify', premise: null }
    if (RISKS_RE.test(lower)) return { kind: thread ? 'risks' : 'clarify', premise: null }
    if (DEEPEN_RE.test(lower)) return { kind: thread ? 'deepen' : 'clarify', premise: null }
    if (EXPAND_RE.test(lower)) return { kind: thread ? 'expand' : 'clarify', premise: null }
    if (WHY_RE.test(lower)) return { kind: thread ? 'why' : 'clarify', premise: null }
  }

  if (hasEntity) return { kind: 'new', premise: null }
  return { kind: 'other', premise: null }
}

/** True when a follow-up kind continues the active thread. */
export function isContinuation(kind: FollowUpKind): boolean {
  return kind !== 'new' && kind !== 'other' && kind !== 'clarify'
}

/** Map the structured intent/timeframe to the conversation thread meta. */
export function threadMetaOf(u: Understanding): { questionKind: QuestionKind; timeframe: ThreadTimeframe } {
  let questionKind: QuestionKind
  switch (u.intent) {
    case 'current_market_status':
      questionKind = 'status'
      break
    case 'news':
      questionKind = 'news'
      break
    case 'compare':
      questionKind = 'comparison'
      break
    case 'technical':
    case 'forecast_outlook':
      questionKind = 'directional'
      break
    case 'impact':
    case 'explain_move':
      questionKind = 'explanatory'
      break
    default:
      // Phase 3O — an otherwise-unclassified ask that carries directional
      // wording ("Is Nifty bullish today?", "is gold rallying?") is a
      // directional question, never a bare "other" thread.
      questionKind = DIRECTIONAL_ASK.test(u.text) ? 'directional' : 'other'
  }
  const timeframe: ThreadTimeframe = u.timeframe
  return { questionKind, timeframe }
}

/** Directional wording used to anchor otherwise-unclassified asks as directional. */
const DIRECTIONAL_ASK =
  /\b(bullish|bearish|bull case|bear case|rally|declin\w*|advanc\w*|retreat\w*|climb\w*|slide\w*|going (up|down|higher|lower)|direction|trending (up|down))\b/i

/**
 * Phase 3N — estimate how deep the answer should be. Never a rule that routes
 * the LLM; it only signals how much structure is warranted. Phase 3O — a
 * continuation follow-up ("why?", "go deeper", "bull and bear cases") is
 * never answered at "brief" even when short: these asks want reasoning, not a
 * one-liner.
 */
export function estimateDepth(
  text: string,
  intent: UnderstandingIntent,
  timeframe: UnderstandingTimeframe,
  followUp: FollowUpKind = 'new',
): UnderstandingDepth {
  const len = text.trim().length
  const terseStatus =
    intent === 'current_market_status' ||
    intent === 'technical' ||
    intent === 'news'
  if (terseStatus && len < 80) return 'brief'
  if (intent === 'forecast_outlook' || intent === 'impact' || timeframe === 'longer' || len > 220) return 'deep'
  if (followUp === 'deepen' || followUp === 'bull-bear') return 'deep'
  if (isContinuation(followUp)) return 'standard'
  // Short status/definitional questions are brief; a short "why" still
  // deserves a real explanation, so explain/compare stay standard.
  if (len < 40 && intent !== 'explain_move' && intent !== 'compare') return 'brief'
  return 'standard'
}

export function understandTurn(text: string, options: UnderstandTurnOptions = {}): Understanding {
  const subjects = findFinancialSubjects(text)
  const primary = subjects[0] ?? null
  const secondary = subjects[1] ?? null

  const intent = INTENT_SIGNALS.find((s) => s.pattern.test(text))?.intent ?? 'other'
  const timeframe = TIMEFRAME_SIGNALS.find((t) => t.pattern.test(text))?.timeframe ?? 'unspecified'
  const hasBroadWording = BROAD_WORDING.test(text)
  const scope: UnderstandingScope = subjects.length > 0 ? 'specific' : hasBroadWording ? 'broad' : 'specific'

  // Phase 3O — how this turn continues the analytical thread (progressive
  // disclosure: why/risks/drivers/deepen/bull-bear/confirmed/temporal…).
  const follow = classifyFollowUp(text, options)
  const followUp = follow.kind
  const continuation = isContinuation(followUp)
  const premise = follow.premise

  // Phase 3N.3 — driver/catalyst questions. The four ask-patterns the task
  // contract names: "what is happening with X", "why is X moving", "what is
  // driving X", and directional asks ("is X bullish/bearish", "is it
  // rallying?"). These must never be answered by price data alone.
  const catalystRelevant =
    intent === 'explain_move' ||
    followUp === 'drivers' ||
    followUp === 'why' ||
    followUp === 'premise' ||
    followUp === 'bull-bear' ||
    DIRECTIONAL_ASK.test(text) ||
    WHATS_HAPPENING_RE.test(text)

  // Phase 3N.5 — a bull/bear debate needs a subject to weigh: the explicit
  // "bull case / bear case" phrasing always counts; a directional/opinion ask
  // counts only when the turn names what it is about ("is oil bullish?",
  // "what's your read on brent?"). A bare "are you bullish?" with no subject
  // and no active topic is not a debate — it cannot be weighed.
  const debate = BULL_BEAR_RE.test(text) || (DEBATE_DIRECTIONAL_RE.test(text) && subjects.length > 0)

  const needsClarification =
    (subjects.length === 0 && !hasBroadWording && BARE_PRONOUN.test(text)) ||
    followUp === 'clarify'

  const entityTypes = new Set(findEntityMentions(text).map((m) => m.type))
  const assetClasses = new Set<AssetClass>()
  for (const { subject } of subjects) assetClasses.add(subject.assetClass)
  if (entityTypes.has('index')) assetClasses.add('index')
  if (entityTypes.has('stock')) assetClasses.add('company')

  let newsHint: string | null = null
  if (intent === 'news') {
    if (primary) newsHint = primary.subject.searchHint
    else if (scope === 'broad') newsHint = 'global markets news'
  } else if (catalystRelevant && primary) {
    // Driver questions also need fresh catalyst research — offer the same
    // natural search query so the context note can point the model at it.
    newsHint = primary.subject.searchHint
  }

  return {
    text,
    subjects,
    primary,
    secondary,
    assetClasses: [...assetClasses],
    intent,
    timeframe,
    scope,
    depth: estimateDepth(text, intent, timeframe, followUp),
    followUp,
    continuation,
    premise,
    needsClarification,
    newsHint,
    catalystRelevant,
    debate,
  }
}