// ---------------------------------------------------------------------------
// Phase 3D.1 — Conversation & Context Intelligence: bounded summarization
//
// Converts analyst responses, tool results and web sources into compact,
// bounded memory records. Raw tool output is never stored — only short notes
// (the orchestrator already truncates what the LLM sees; memory is stricter).
// ---------------------------------------------------------------------------

import type { ConversationConfig, ConversationState, ConversationUpdateInput } from './types'
import { classifyFreshness } from './state'
import { naturalToolNote } from '../agent/responseIntelligence'

export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n…[truncated]`
}

function noteMax(config: ConversationConfig): number {
  return Math.max(200, Math.floor(config.maxSummaryChars / 8))
}

/** Compact record of the assistant's latest answer. */
export function summarizeResponse(
  response: ConversationUpdateInput['response'],
  turn: number,
  now: number,
  config: ConversationConfig,
): ConversationState['recentAssistantSummaries'][number] {
  // Store the conversational answer, not a flattened copy of the rendered
  // report. Structured evidence remains available through bounded claim and
  // tool records, without injecting the same prose into every later prompt.
  const summary = response.answer ?? response.summary ?? response.title
  return {
    turn,
    title: truncateText(response.title, 200),
    summary: truncateText(summary, config.maxSummaryChars),
    intent: response.intent,
    ...(response.confidence ? { confidence: response.confidence } : {}),
    partial: response.partial === true,
    generatedAt: response.generatedAt,
    freshness: classifyFreshness(now, now, config.freshness, 'summary'),
  }
}

/** Compact records of the response's findings. */
export function summarizeFindings(
  response: ConversationUpdateInput['response'],
  turn: number,
  now: number,
  config: ConversationConfig,
): ConversationState['recentFindings'] {
  const out: ConversationState['recentFindings'] = []
  for (const f of (response.findings ?? []).slice(0, config.maxConversationFindings)) {
    out.push({
      turn,
      kind: f.kind,
      title: truncateText(f.title, 200),
      detail: truncateText(f.detail, noteMax(config)),
      retrievedAt: now,
      freshness: classifyFreshness(now, now, config.freshness, 'evidence'),
    })
  }
  return out
}

/** Compact record of one tool execution (never raw output). */
export function summarizeToolEvidence(
  evidence: ConversationUpdateInput['evidence'][number],
  turn: number,
  now: number,
  config: ConversationConfig,
): ConversationState['recentToolEvidence'][number] {
  const r = evidence.result
  // Phase 3N.4 — memory stores a NATURAL note (naturalToolNote), never raw
  // JSON: the recap quotes this note verbatim to the user. Tool shape is
  // rendered into analyst vocabulary; unknown shapes degrade to a bounded
  // count, and an error surfaces only its message.
  const note = r.ok && r.data !== null
    ? truncateText(naturalToolNote(r.metadata.tool, r.data).replace(/\s+/g, ' '), noteMax(config))
    : r.error
      ? truncateText(r.error.message, noteMax(config))
      : 'no evidence produced'
  return {
    turn,
    tool: r.metadata.tool,
    ...(evidence.entity ? { entity: evidence.entity } : {}),
    ok: r.ok,
    available: r.metadata.available,
    note,
    retrievedAt: now,
    freshness: classifyFreshness(now, now, config.freshness, 'market'),
  }
}

/** Compact records of the web sources a response actually cites. */
export function summarizeSources(
  sources: ConversationUpdateInput['sources'],
  turn: number,
  now: number,
  config: ConversationConfig,
): ConversationState['lastSources'] {
  return sources.slice(0, config.maxConversationSources).map((s) => ({
    turn,
    url: s.url,
    title: s.title,
    snippet: truncateText(s.snippet, noteMax(config)),
    publishedAt: s.publishedAt,
    retrievedAt: now,
    freshness: classifyFreshness(now, now, config.freshness, 'evidence'),
  }))
}

/** Compact records of the live-news stories gathered this turn (Phase 3N.1). */
export function summarizeNews(
  news: NonNullable<ConversationUpdateInput['news']>,
  turn: number,
  now: number,
  config: ConversationConfig,
): ConversationState['recentNews'] {
  return news.slice(0, config.maxConversationNews).map((n) => ({
    turn,
    subject: truncateText(n.subject, 200),
    headline: truncateText(n.title, 200),
    url: n.url,
    publishedAt: n.publishedAt,
    newsFreshness: n.freshness,
    corroborated: n.corroboratedBy >= 2,
    retrievedAt: now,
  }))
}