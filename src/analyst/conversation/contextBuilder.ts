// ---------------------------------------------------------------------------
// Phase 3D.1 — Conversation & Context Intelligence: context builder
//
// Renders the bounded ConversationState + current-turn interpretation into the
// structured payload the orchestrator injects as a system message. The LLM is
// told this is session memory (never new evidence), and every memory record is
// labeled with its turn and freshness. The payload is hard-capped at
// maxContextChars — memory beyond the cap is dropped from the prompt.
// ---------------------------------------------------------------------------

import type { ConversationConfig, ContextInterpretation, ConversationState, ReferenceResolution } from './types'
import { entityDisplayNames } from './entities'
import { truncateText } from './summarization'
import { scrubAdversarial } from './thread'

const HEADER = 'CONVERSATION CONTEXT (session-only memory — reference it, but never present it as fresh tool evidence)'

/**
 * Build the bounded, rendered context payload for the LLM. Deterministic:
 * given the same state, interpretation and config, the output is identical.
 */
export function buildContextPayload(
  state: ConversationState,
  interpretation: ContextInterpretation,
  config: ConversationConfig,
): string {
  const sections: string[] = []

  const last = state.lastResponseMetadata
  if (last) {
    const partial = last.partial ? ' (partial)' : ''
    sections.push(`- Last answer: "${scrubAdversarial(last.title)}"${partial} (turn ${last.turn})`)
  }

  // Phase 3O — the live analytical thread: the compact anchor a follow-up
  // resolves against ("what could kill it?" → the bullish Nifty thesis).
  // Rendered from real memory only — thesis from the evidence groups, the
  // conclusion from the response summary, news themes from validated items.
  if (state.analyticalThread) {
    const t = state.analyticalThread
    const lines: string[] = [
      `- Analytical thread: ${t.questionKind} · ${t.timeframe ?? 'no timeframe'} on ${t.subjectLabel ?? 'broad market'} (turn ${t.turn})`,
    ]
    if (t.conclusion) lines.push(`  * Last conclusion: "${truncateText(t.conclusion, 200)}"${t.partial ? ' (partial)' : ''}`)
    if (t.thesis) {
      const conf = t.confidence ? ` · confidence ${t.confidence}` : ''
      lines.push(`  * Thesis from the evidence: ${t.thesis}${conf}`)
    }
    if (t.supportingFactors.length > 0) lines.push(`  * Supporting: ${t.supportingFactors.join(', ')}`)
    if (t.opposingFactors.length > 0) lines.push(`  * Opposing: ${t.opposingFactors.join(' | ')}`)
    if (t.comparisonIds.length > 0) {
      lines.push(`  * Active comparison: ${entityDisplayNames(state, t.comparisonIds).join(' vs ')}`)
    }
    if (t.newsThemes.length > 0) lines.push(`  * News themes: ${t.newsThemes.join(' | ')}`)
    sections.push(lines.join('\n'))
  }

  const activeTopic = state.activeEntities.find((e) => e.id === state.activeTopic)
  if (activeTopic) {
    sections.push(`- Active topic: ${activeTopic.id} (${activeTopic.displayName})`)
  }

  if (state.activeEntities.length > 0) {
    const names = entityDisplayNames(state, state.activeEntities.map((e) => e.id))
    sections.push(`- Active entities: ${names.join(', ')}`)
  }

  if (state.recentEntities.length > 0) {
    const names = entityDisplayNames(state, state.recentEntities.map((e) => e.id))
    sections.push(`- Previously mentioned entities: ${names.join(', ')}`)
  }

  if (state.activeComparison) {
    const c = state.activeComparison
    const names = entityDisplayNames(state, c.entities)
    sections.push(
      `- Active comparison: ${names.join(' vs ')}${c.dimensions.length > 0 ? ` (dimensions: ${c.dimensions.join(', ')})` : ''} (started turn ${c.sourceTurn})`,
    )
  }

  if (state.temporalContext) {
    sections.push(`- Temporal context: "${state.temporalContext.raw}" → ${state.temporalContext.normalized} (turn ${state.temporalContext.turn})`)
  }

  if (state.recentAssistantSummaries.length > 0) {
    const lines = state.recentAssistantSummaries.map(
      (s) => `  * "${scrubAdversarial(s.title)}" — ${truncateText(scrubAdversarial(s.summary), 240)} (turn ${s.turn}, ${s.freshness})`,
    )
    sections.push(`- Prior summaries:\n${lines.join('\n')}`)
  }

  if (state.recentFindings.length > 0) {
    const lines = state.recentFindings.map((f) =>
      `  * [${f.kind}] ${f.title}${f.entity ? ` (${f.entity})` : ''} — ${truncateText(f.detail, 160)} (turn ${f.turn}, ${f.freshness})`,
    )
    sections.push(`- Recent important findings:\n${lines.join('\n')}`)
  }

  if (state.recentToolEvidence.length > 0) {
    const lines = state.recentToolEvidence.map((e) =>
      `  * ${e.tool}${e.entity ? ` → ${e.entity}` : ''}: ${truncateText(e.note, 160)}${e.available ? '' : ' (available=false)'} (turn ${e.turn}, ${e.freshness})`,
    )
    sections.push(`- Latest tool evidence (already gathered — reuse before rerunning tools):\n${lines.join('\n')}`)
  }

  if (state.lastSources.length > 0) {
    const lines = state.lastSources.map((s) =>
      `  * "${s.title}" — ${s.url}${s.publishedAt ? ` (published ${s.publishedAt})` : ''} (turn ${s.turn}, ${s.freshness})`,
    )
    sections.push(`- Recent web sources:\n${lines.join('\n')}`)
  }

  // Phase 3N.1 — live-news memory: the deterministic freshness tier, whether
  // the story is corroborated by multiple outlets, and when it was fetched.
  // The headline is rendered WITHOUT its URL: news headlines are untrusted
  // data and the context payload must not leak raw URLs (Phase 3O security).
  if (state.recentNews.length > 0) {
    const lines = state.recentNews.map((n) =>
      `  * "${scrubAdversarial(n.headline)}"${n.publishedAt ? ` (published ${n.publishedAt})` : ''} [${n.newsFreshness}${n.corroborated ? ', multiple outlets' : ', single outlet'}] (turn ${n.turn})`,
    )
    sections.push(`- Recent news:\n${lines.join('\n')}`)
  }

  if (state.corrections.length > 0) {
    const lines = state.corrections.map((c) =>
      `  * "${truncateText(c.raw, 120)}"${c.previous && c.corrected ? ` — ${c.previous} → ${c.corrected}` : ''} (turn ${c.turn})`,
    )
    sections.push(`- User corrections:\n${lines.join('\n')}`)
  }

  const interpretations = interpretationLine(interpretation.references)
  if (interpretations) sections.push(`- This turn's interpretation:\n${interpretations}`)

  if (interpretation.needsClarification) {
    sections.push('- Ambiguity: one or more references are unresolved or low-confidence — if the answer depends on them, ask the user rather than guessing.')
  }

  const body = sections.join('\n')
  const full = `${HEADER}\n${body}`
  if (full.length <= config.maxContextChars) return full

  // Preserve the current turn and active thread before older evidence. A raw
  // prefix slice commonly dropped the interpretation that resolves "why?".
  const priority = [
    'This turn\'s interpretation:',
    'Ambiguity:',
    '- Analytical thread:',
    '- Last answer:',
    '- Active topic:',
    '- Active entities:',
    '- Prior summaries:',
    '- Recent important findings:',
    '- Latest tool evidence',
    '- Recent news:',
    '- Recent web sources:',
  ]
  const selected = priority.flatMap((marker) => sections.filter((section) => section.includes(marker)))
  const remainder = sections.filter((section) => !selected.includes(section))
  const ordered = [...selected, ...remainder]
  let output = HEADER
  for (const section of ordered) {
    const next = `${output}\n${section}`
    if (next.length > config.maxContextChars - 24) break
    output = next
  }
  return `${output}\n…[context truncated]`
}

function interpretationLine(references: ReferenceResolution[]): string {
  if (references.length === 0) return ''
  return references
    .map((r) => {
      const target = r.entityId ? r.entityId : r.confidence === 'unresolved' ? '— unresolved' : '— broad context'
      return `  * "${r.raw}" → ${target} (${r.confidence} confidence, ${r.reason})`
    })
    .join('\n')
}

/**
 * Context-aware follow-up suggestions derived ONLY from session memory.
 * Deterministic templates — suggestions are UI chips, not intent routing.
 */
export function suggestFollowUps(state: ConversationState): string[] {
  const out: string[] = []
  const primary = state.activeEntities.find((e) => e.id === state.activeTopic) ?? state.activeEntities[0]

  if (state.activeComparison) {
    const names = entityDisplayNames(state, state.activeComparison.entities.slice(0, 2))
    out.push(`Which one is stronger today?`)
    out.push(`How did ${names[0]} compare to ${names[1]} this week?`)
  }

  if (primary && out.length < 3) {
    out.push(`What's the technical outlook for ${primary.displayName}?`)
  }

  if (out.length === 0 && state.recentEntities.length > 0) {
    const name = entityDisplayNames(state, [state.recentEntities[0].id])[0]
    out.push(`What about ${name}?`)
  }

  return out.slice(0, 2)
}