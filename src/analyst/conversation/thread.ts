// ---------------------------------------------------------------------------
// Phase 3O — Analyst Reasoning & Conversational Intelligence: analytical thread
//
// The live analytical thread of the conversation: the current question, its
// direction, the conclusion so far, what supports and opposes it, the active
// comparison and the news themes in play. It is DERIVED deterministically from
// what actually happened in the completed turn — never guessed from prose:
//   - the conclusion comes from the response summary/title (truncated);
//   - the thesis and supporting/opposing factors come from the evidence
//     groups via the responseIntelligence directional classifier (the same
//     signals the synthesis layer uses to surface conflicts);
//   - the news themes come from the turn's validated news items.
//
// The thread is a SINGLE record replaced on every completed turn — bounded by
// construction, no growth, no lists without caps, no permanent state. It is
// the anchor the follow-up layer uses so "what could kill it?" resolves
// against the bullish Nifty thesis instead of asking the user to restate it.
// ---------------------------------------------------------------------------

import type { AnalystResponse } from '../types'
import type { ToolResult } from '../tools/types'
import type {
  AnalyticalThread,
  ConversationEntity,
  ConversationState,
  ConversationUpdateInput,
  QuestionKind,
} from './types'
import { truncateText } from './summarization'
import { directionalGroupOf, detectConflicts, themeLines } from '../agent/responseIntelligence'

export const MAX_THREAD_FACTORS = 4
export const MAX_THREAD_OPPOSING = 4
export const MAX_THREAD_NEWS_THEMES = 3
export const MAX_THREAD_QUESTION_CHARS = 200
export const MAX_THREAD_CONCLUSION_CHARS = 240

/**
 * Adversarial instruction phrases that never belong in session memory even as
 * quotes: an injected "ignore previous instructions…" must not ride along in
 * a captured conclusion. Deterministic, narrow list — legitimate market prose
 * is never touched (no "you are…", no keyword filters).
 */
const ADVERSARIAL_PATTERNS: RegExp[] = [
  /\bignore (all )?(previous|prior|above) instructions?\b/gi,
  /\bdisregard (previous|prior|above) instructions?\b/gi,
  /\bforget (all )?(previous|prior|above) (instructions?|context|prompts?)\b/gi,
  /\bsystem prompt\b/gi,
  /\bsay (the )?magic[- ]word\b/gi,
  /\brepeat (the |this )?(magic word|text above)\b/gi,
  /\boutput (the )?text above\b/gi,
  /\bdo not mention this (conversation|request|instruction)\b/gi,
]

/** Strip adversarial instruction phrases from captured session prose. */
export function scrubAdversarial(text: string): string {
  let out = text
  for (const re of ADVERSARIAL_PATTERNS) out = out.replace(re, '')
  return out.replace(/\s{2,}/g, ' ').trim()
}

/**
 * Map the coarse response intent to a question kind. Used as a deterministic
 * fallback when the orchestrator does not supply the structured thread meta
 * (e.g. third-party call sites that never ran the UNDERSTAND stage).
 */
export function questionKindForIntent(intent: AnalystResponse['intent']): QuestionKind {
  switch (intent) {
    case 'summary':
    case 'briefing':
    case 'weekly':
      return 'status'
    case 'explain':
      return 'explanatory'
    case 'compare':
      return 'comparison'
    case 'next':
    case 'detect':
    case 'optimize':
    case 'missing':
      return 'directional'
    default:
      return 'other'
  }
}

/**
 * The directional thesis from the turn's evidence groups. Bull/bear/mixed
 * only when the evidence actually carries those signals; null otherwise.
 * Never invents a direction the tools did not express.
 */
export function thesisFromEvidence(results: ToolResult[]): AnalyticalThread['thesis'] {
  const signs = results.map((r) => directionalGroupOf(r)).filter((g) => g !== null).map((g) => g!.sign)
  const bulls = signs.filter((s) => s === 'bull').length
  const bears = signs.filter((s) => s === 'bear').length
  if (bulls > 0 && bears > 0) return 'mixed'
  if (bulls > 0) return 'bull'
  if (bears > 0) return 'bear'
  if (signs.some((s) => s === 'mixed')) return 'mixed'
  return null
}

/**
 * Analyst-vocabulary labels of the evidence groups that support the thesis:
 * the direction of the thesis itself, or the bull side when the thesis is a
 * genuine split. Mixed-group signals (e.g. an oscillator that is both
 * overbought and positive) are never presented as "support".
 */
export function supportingFactorsOf(results: ToolResult[], thesis: AnalyticalThread['thesis']): string[] {
  if (!thesis) return []
  const wanted = thesis === 'mixed' ? 'bull' : thesis
  const seen = new Set<string>()
  const out: string[] = []
  for (const result of results) {
    const group = directionalGroupOf(result)
    if (group && group.sign === wanted && !seen.has(group.label)) {
      seen.add(group.label)
      out.push(group.label)
    }
  }
  return out.slice(0, MAX_THREAD_FACTORS)
}

/**
 * What opposes the thesis: honest conflict notes from the evidence plus the
 * labels of groups carrying the opposite direction. Never hides a split.
 */
export function opposingFactorsOf(results: ToolResult[], thesis: AnalyticalThread['thesis']): string[] {
  const out: string[] = []
  for (const result of results) {
    const group = directionalGroupOf(result)
    if (thesis && thesis !== 'mixed' && group && group.sign && group.sign !== thesis) {
      out.push(group.label)
    }
  }
  for (const note of detectConflicts(results).map((c) => c.note)) {
    if (!out.includes(note)) out.push(note)
  }
  return out.slice(0, MAX_THREAD_OPPOSING)
}

/**
 * Capture the analytical thread of a completed turn. Deterministic given the
 * state, update input and turn number. Replaces the previous thread — the
 * thread always reflects the LATEST completed turn.
 */
export function captureAnalyticalThread(
  state: ConversationState,
  input: ConversationUpdateInput,
  turn: number,
  primary?: ConversationEntity,
): AnalyticalThread {
  // `recordTurn` runs before entity memory merges, so the resolution's own
  // primary entity is authoritative; the stored entities are a fallback for
  // third-party call sites that only have the state.
  const resolvedPrimary = primary ?? state.activeEntities.find((e) => e.id === state.activeTopic) ?? state.activeEntities[0]
  const results = input.evidence.map((e) => e.result)
  const thesis = thesisFromEvidence(results)
  const newsThemes = themeLines(input.news ?? [], MAX_THREAD_NEWS_THEMES)

  const thread: AnalyticalThread = {
    turn,
    subjectId: resolvedPrimary?.id ?? null,
    subjectLabel: resolvedPrimary?.displayName ?? null,
    question: truncateText(scrubAdversarial(input.response.title ?? ''), MAX_THREAD_QUESTION_CHARS),
    questionKind: input.thread?.questionKind ?? questionKindForIntent(input.response.intent),
    timeframe: input.thread?.timeframe ?? null,
    thesis,
    conclusion: truncateText(
      scrubAdversarial(input.response.summary ?? input.response.title ?? ''),
      MAX_THREAD_CONCLUSION_CHARS,
    ),
    ...(input.response.confidence ? { confidence: input.response.confidence } : {}),
    partial: input.response.partial === true,
    supportingFactors: supportingFactorsOf(results, thesis),
    opposingFactors: opposingFactorsOf(results, thesis),
    comparisonIds: state.activeComparison ? state.activeComparison.entities.slice(0, 2) : [],
    newsThemes: newsThemes.map(scrubAdversarial),
    lastUpdatedTurn: turn,
  }
  return thread
}