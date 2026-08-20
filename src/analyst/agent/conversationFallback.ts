// ---------------------------------------------------------------------------
// Phase 3A — Agent layer: conversation-aware deterministic fallback
//
// When the LLM path fails (provider down, retries exhausted) the engine
// delegates to the deterministic AnalystEngine. That engine re-classifies the
// raw follow-up text with no conversation memory, so a bare follow-up like
// "What evidence supports that?" cannot map to an instrument and dead-ends in
// "I couldn’t map ... to a specific instrument in the current data."
//
// This wrapper sits between the engine and the deterministic fallback and
// resolves the turn against session memory first:
//   - explicit instrument mentions and the session's active topic decide the
//     primary instrument;
//   - analytical/driver follow-ups with an explicit subject ("why is oil
//     moving again?", "is oil bullish rn?") are treated as NEW analyses and
//     delegated to the research-capable fallback — fresh tools run, session
//     evidence is never reused as if it were current;
//   - when the session already holds tool evidence for that instrument AND the
//     turn is an explicit recap request ("what did you say about oil above?"),
//     the wrapper answers from that evidence — labeled as session memory,
//     never presented as a fresh tool run — with an honest section stating no
//     fresh data was gathered for this follow-up;
//   - otherwise it delegates to the deterministic engine, substituting the
//     display name for bare follow-ups (so deterministic findInstrument can
//     route them) and passing the original text unchanged otherwise.
//
// It never invents values, tools, sources or instruments. It never decides
// intent on its own beyond "recall the session evidence"; the LLM stays the
// semantic reasoner whenever it is reachable.
// ---------------------------------------------------------------------------

import type { AnalystContext, AnalystResponse } from '../types'
import type { AnalystEngine } from '../engine'
import { localAnalystEngine } from '../engine'
import type { ConversationSession, ConversationState, ToolEvidenceMemory } from '../conversation/types'
import { extractExplicitEntities, entityDisplayNames } from '../conversation/entities'
import { truncateText } from '../conversation/summarization'
import { suggestFollowUps } from '../conversation/contextBuilder'
import { understandTurn } from './understanding'
import { isProvenanceAsk, naturalHeadingForTool } from './responseIntelligence'

/** Explicit recap requests — the ONLY follow-ups answered purely from memory. */
const RECAP_RE =
  /what did you (?:just )?(?:say|mention|tell me|told me|said|cover)(?: about| on)?(?: the| this| that)?|repeat (?:the|your|that) (?:previous |last )?(?:analysis|answer|response|read|call)|recap|summarize what you (?:said|told|mentioned|covered)|what was your (?:last|previous) (?:answer|analysis|response)|what do we know (?:so far )?(?:about|from)|can you recap/i

/**
 * Phase 3N.4 — follow-up questions that demand FRESH analysis ("why is X
 * moving", "is X bullish", "what is driving X") must be researched again —
 * session evidence is never reused as if it were current. Only explicit
 * recap requests ("what did you say about oil above?") answer from memory.
 */
function requestsFreshAnalysis(text: string): boolean {
  const u = understandTurn(text, { hasActiveTopic: true })
  if (u.catalystRelevant) return true
  if (u.followUp === 'drivers' || u.followUp === 'bull-bear' || u.followUp === 'confirmed') return true
  if (u.followUp === 'switch-subject' || u.followUp === 'temporal-compare') return true
  if (u.intent === 'explain_move' || u.intent === 'impact' || u.intent === 'compare' || u.intent === 'news') return true
  return false
}

export interface ConversationAwareFallbackOptions {
  /** Session-only conversation memory the fallback resolves against. */
  session: ConversationSession
  /** Deterministic engine to delegate to (defaults to localAnalystEngine). */
  base?: AnalystEngine
}

/**
 * Wrap a deterministic fallback so follow-up turns resolve against session
 * memory before the text is re-classified in isolation.
 */
export function createConversationAwareFallback(options: ConversationAwareFallbackOptions): AnalystEngine {
  const { session, base = localAnalystEngine } = options

  async function generate(input: {
    text: string
    context: AnalystContext
    history?: AnalystResponse[]
  }): Promise<AnalystResponse> {
    const state = session.state
    const explicit = extractExplicitEntities(input.text)
    const primaryId = explicit[0]?.id ?? state.activeTopic ?? null

    if (primaryId) {
      // Phase 3N.4 — an analytical/driver follow-up with an explicit subject
      // ("Why is oil moving again?", "Is oil bullish rn?") is a NEW analysis,
      // not a recap: delegate to the research-capable fallback so fresh tools
      // actually run. Only explicit recap requests ("What did you say about
      // oil above?") answer purely from session memory.
      if (explicit.length > 0 && !isExplicitRecap(input.text) && requestsFreshAnalysis(input.text)) {
        return base.generate(input)
      }
      const evidence = evidenceFor(state, primaryId)
      if (evidence.length > 0) {
        return memorySynthesisResponse(input.text, state, primaryId, evidence, {
          // Phase 3N.4 — "which tool showed that?" is the documented
          // provenance exemption: the exact tool name and turn ARE the
          // answer, so they are rendered verbatim instead of translated.
          provenance: isProvenanceAsk(input.text),
        })
      }
      // No recorded evidence for the resolved instrument. Bare follow-ups
      // ("Why?", "And TCS?") pass the display name so the deterministic
      // engine can route them; explicit mentions pass through unchanged.
      if (explicit.length === 0) {
        return base.generate({ ...input, text: entityDisplayNames(state, [primaryId])[0] })
      }
      return base.generate(input)
    }

    // No instrument context — market-level questions and generic asks stay
    // with the deterministic engine exactly as before.
    return base.generate(input)
  }

  return {
    generate,
    insights: (context: AnalystContext) => (typeof base.insights === 'function' ? base.insights(context) : []),
    suggest: (context: AnalystContext) => (typeof base.suggest === 'function' ? base.suggest(context) : []),
  }
}

/** Tool evidence relevant to one instrument — including market-level (entity undefined). */
function evidenceFor(state: ConversationState, entityId: string): ToolEvidenceMemory[] {
  return state.recentToolEvidence.filter((e) => e.entity === entityId || e.entity === undefined)
}

const HONESTY_LIMIT = 'No Finova tool in this session supports claims beyond the evidence listed above.'

/**
 * Answer a follow-up from recorded session evidence. Every claim is a direct
 * restatement of stored evidence records (bounded note) — nothing is
 * invented, and the response states plainly that no fresh tool run happened
 * for this follow-up. Rendered in analyst vocabulary: no tool function names,
 * no turn identifiers, no raw availability flags — unless the user explicitly
 * asked which tool showed the claim (provenance), in which case the exact
 * tool name and turn are the answer and are named verbatim.
 */
function memorySynthesisResponse(
  question: string,
  state: ConversationState,
  entityId: string,
  evidence: ToolEvidenceMemory[],
  options: { provenance?: boolean } = {},
): AnalystResponse {
  const displayName = entityDisplayNames(state, [entityId])[0]
  const available = evidence.filter((e) => e.ok && e.available)
  const unavailable = evidence.filter((e) => !e.ok || !e.available)
  const last = state.lastResponseMetadata
  const sources = state.lastSources
  const provenance = options.provenance === true

  const evidenceLabel = (e: ToolEvidenceMemory): string =>
    provenance ? `${e.tool} (turn ${e.turn})` : naturalEvidenceLabel(e.tool)

  const sections: NonNullable<AnalystResponse['sections']> = []

  if (available.length > 0) {
    sections.push({
      heading: 'Evidence already gathered',
      kind: 'fact',
      bullets: available.map(
        (e) => `${evidenceLabel(e)}${entityName(state, e.entity)}: ${truncateText(e.note, 200)}`,
      ),
    })
  }

  if (unavailable.length > 0) {
    sections.push({
      heading: 'Data unavailable this session',
      kind: 'fact',
      bullets: unavailable.map(
        (e) => `${evidenceLabel(e)}${entityName(state, e.entity)}: ${truncateText(e.note, 200)}`,
      ),
    })
  }

  if (sources.length > 0) {
    sections.push({
      heading: 'Web sources from this session',
      kind: 'fact',
      bullets: sources.slice(0, 6).map((s) => `"${truncateText(s.title, 160)}" — ${s.url}`),
    })
  }

  sections.push({
    heading: 'Honest limits',
    kind: 'inference',
    bullets: [
      `This follow-up was answered from session memory — no fresh data was gathered for "${truncateText(question, 120)}".`,
      HONESTY_LIMIT,
    ],
  })

  const findings: NonNullable<AnalystResponse['findings']> = available.slice(0, 4).map((e) => ({
    kind: 'fact',
    title: evidenceLabel(e),
    detail: truncateText(e.note, 200),
  }))

  // Phase 3O — the fallback answers FIRST (the strongest stored evidence),
  // then labels its limitation naturally. The honesty contract is unchanged:
  // the answer is explicitly a recap of the evidence already gathered, no
  // fresh tool run happened, and no Finova tool supports claims beyond it.
  const lead = available.length > 0 ? truncateText(available[0].note, 180) : `no fresh data exists for ${displayName}`

  return {
    id: `mem-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`,
    intent: 'ask',
    title: `What we know so far about ${displayName}`,
    summary: `Here's what the session evidence shows for ${displayName}: ${lead}. I couldn't run the tools for this follow-up, so this is a recap of the evidence already gathered for ${displayName} in this conversation.${last ? ` The last answer was "${last.title}".` : ''}`,
    sections,
    ...(findings.length > 0 ? { findings } : {}),
    recommendations: ['Ask a fresh question to get a fresh analysis.', 'Say "new analysis" to start a clean session.'],
    confidence: 'Low',
    followUps: suggestFollowUps(state),
    partial: true,
    generatedAt: new Date().toISOString(),
  }
}

/** The natural label an evidence record's tool earns in user-facing prose. */
function naturalEvidenceLabel(tool: string): string {
  return naturalHeadingForTool(tool) ?? 'The data gathered'
}

/** Display name for an evidence record's entity ("for Crude Oil (Brent)"). */
function entityName(state: ConversationState, entityId: string | undefined): string {
  if (!entityId) return ' for the market level'
  const names = entityDisplayNames(state, [entityId])
  return names.length > 0 ? ` for ${names[0]}` : ` for ${entityId}`
}

/** True when the text is an explicit request to recap the session's answer. */
function isExplicitRecap(text: string): boolean {
  return RECAP_RE.test(text)
}