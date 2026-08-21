// ---------------------------------------------------------------------------
// Phase 3N.3 — Agent layer: research-capable deterministic fallback
//
// When the LLM path fails BEFORE any evidence is gathered (provider down,
// rate-limited on the first round), the engine falls back to a deterministic
// AnalystEngine. That fallback had no research capability, so a driver
// question ("why is oil up?", "what is driving gold?") got the honest but
// thin "no live price series or news feed here" answer even when web search
// WAS configured for the session.
//
// This wrapper sits between the conversation wrapper and the subject-aware
// fallback. For driver/catalyst questions (understanding.catalystRelevant),
// when the session has a web-search transport it runs the SAME honest
// research pipeline the orchestrator would have run in round 1:
//   - the deterministic market tools for the resolved subject (the price
//     read), and
//   - a searchNews retrieval through the session transport (validated
//     results, deterministic news processing, headline-only citations later).
// It then synthesizes a driver answer through the unchanged Phase 3N.3
// machinery: lead with the established catalyst, or state plainly that none
// could be established — never invent a driver. When the question is not a
// driver question, no search is configured, or the research yields nothing,
// it delegates unchanged to the base fallback (whose wording is untouched).
// ---------------------------------------------------------------------------

import type { AnalystContext, AnalystResponse } from '../types'
import type { AnalystEngine } from '../engine'
import type { AnalystToolRegistry } from '../tools/registry'
import type { ToolContext, ToolResult } from '../tools/types'
import type { NewsItem, WebSearchResult } from '../websearch/types'
import { buildNewsQuery, processNewsResults } from '../websearch/news'
import { isValidWebSearchResult } from '../websearch/limits'
import { dedupeResults } from '../websearch/normalize'
import { retrieveEvidence } from '../websearch/retrieve'
import { SearchTransportError } from '../websearch/transport'
import { understandTurn } from './understanding'
import { synthesizeResponse } from './synthesis'
import { refineResponse } from './responseIntelligence'
import { findEntityMentions } from './entityResolution'
import { successNewsResult, type SearchSessionDeps } from './orchestrator'
import { logAgent } from './logger'

export interface ResearchAwareFallbackOptions {
  /** The deterministic tool registry (same one the orchestrator uses). */
  registry: AnalystToolRegistry
  /** Shared execution context (clock + data sources). */
  toolContext: ToolContext
  /** The session's web-search seam — present means research is possible. */
  search: SearchSessionDeps
  /** Fallback to delegate to when research cannot or should not run. */
  base: AnalystEngine
}

/** What the research fallback gathered in its last run (for session memory). */
export interface ResearchFallbackSession {
  evidence: Array<{ result: ToolResult; entity?: string }>
  sources: WebSearchResult[]
}

export type ResearchAwareFallbackEngine = AnalystEngine & {
  /** Evidence gathered by the most recent research run (empty when none). */
  lastSession: ResearchFallbackSession
}

/**
 * Wrap a deterministic fallback so driver/catalyst questions still get
 * researched when the LLM is down but web search is available.
 */
export function createResearchAwareFallback(options: ResearchAwareFallbackOptions): ResearchAwareFallbackEngine {
  const { registry, toolContext, search, base } = options
  const session: ResearchFallbackSession = { evidence: [], sources: [] }

  async function generate(input: {
    text: string
    context: AnalystContext
    history?: AnalystResponse[]
  }): Promise<AnalystResponse> {
    session.evidence = []
    session.sources = []
    const understanding = understandTurn(input.text)
    const primary = understanding.primary

    // Only driver/catalyst questions trigger research. Everything else keeps
    // the existing deterministic fallback exactly as it was.
    if (!understanding.catalystRelevant || !primary) return base.generate(input)

    const evidence: ToolResult[] = []

    // 1. The deterministic price read for the subject — the same tools the
    //    LLM would have called in round 1 (macro indicator, technicals or
    //    sector data depending on what the subject is covered by).
    const dataResult = subjectDataResult(primary.subject.id, primary.subject.assetClass, primary.subject.dataRef, registry, toolContext)
    if (dataResult) evidence.push(dataResult)

    // 2. Catalyst research through the session transport — the same honesty
    //    pipeline as the orchestrator's searchNews path: validated results
    //    only, deterministic news processing (freshness, source tiers, story
    //    corroboration), never fabricated. A transport failure or an empty
    //    feed simply leaves the news evidence out.
    try {
      const news = await researchNews(primary.subject.label, primary.subject.searchHint, search, toolContext.now)
      if (news) {
        evidence.push(news.result)
        for (const item of news.items) session.sources.push(item)
      }
    } catch (thrown) {
      const message = thrown instanceof SearchTransportError
        ? thrown.message
        : thrown instanceof Error
          ? thrown.message
          : 'Web search failed unexpectedly'
      logAgent({ kind: 'error', message })
    }

    if (evidence.length === 0) {
      logAgent({
        kind: 'research-fallback',
        subject: primary.subject.label,
        evidenceTools: [],
        headlineCount: 0,
        branched: true,
      })
      return base.generate(input)
    }

    session.evidence = evidence.map((result) => ({ result, entity: primary.subject.id }))
    logAgent({
      kind: 'research-fallback',
      subject: primary.subject.label,
      evidenceTools: evidence.map((r) => r.metadata.tool),
      headlineCount: session.sources.length,
      branched: false,
    })

    const response = synthesizeResponse({
      question: input.text,
      results: evidence,
      mentions: findEntityMentions(input.text),
      subject: primary.subject.label,
      subjectLabel: primary.subject.label,
      assetClass: primary.subject.assetClass,
      subjectCoverage: primary.subject.coverage,
      sources: session.sources,
      catalystRelevant: true,
      debate: understanding.debate,
      followUp: understanding.followUp,
      now: toolContext.now,
    })
    return refineResponse(response)
  }

  return {
    generate,
    insights: (context: AnalystContext) => (typeof base.insights === 'function' ? base.insights(context) : []),
    suggest: (context: AnalystContext) => (typeof base.suggest === 'function' ? base.suggest(context) : []),
    lastSession: session,
  }
}

/** Deterministic evidence for one subject (macro indicator, technicals, sectors). */
function subjectDataResult(
  subjectId: string,
  assetClass: string,
  dataRef: { kind: 'macro' | 'global' | 'sector' | 'index'; id: string } | undefined,
  registry: AnalystToolRegistry,
  toolContext: ToolContext,
): ToolResult | null {
  if (dataRef?.kind === 'macro') {
    return registry.execute('getMacroContext', { indicatorId: dataRef.id }, toolContext)
  }
  if (dataRef?.kind === 'index' || dataRef?.kind === 'global') {
    return registry.execute('getTechnicalAnalysis', { instrument: dataRef.id }, toolContext)
  }
  if (dataRef?.kind === 'sector') {
    return registry.execute('analyzeSectors', { sector: dataRef.id }, toolContext)
  }
  if (assetClass === 'company' || assetClass === 'index') {
    return registry.execute('getTechnicalAnalysis', { instrument: subjectId }, toolContext)
  }
  return null
}

/** One searchNews retrieval: validated results -> news pipeline -> ToolResult. */
async function researchNews(
  label: string,
  searchHint: string,
  search: SearchSessionDeps,
  now: number,
): Promise<{ result: ToolResult; items: NewsItem[] } | null> {
  const subject = searchHint.trim() || label.trim()
  const build = buildNewsQuery(subject, { maxResults: 5, maxAgeDays: 7 })
  if (!build.ok) return null

  const { response } = await retrieveEvidence({ transport: search.transport, query: build.query, tool: 'searchNews', cache: search.cache })
  const validated = response.results.filter((r) => isValidWebSearchResult(r))
  const processed = processNewsResults(dedupeResults(validated).results, {
    subject: build.query.query,
    maxItems: build.query.maxResults,
    maxAgeDays: build.maxAgeDays,
    now,
  })
  if (processed.items.length === 0) return null

  return {
    result: successNewsResult(now, { ...processed, query: build.query }, []),
    items: processed.items,
  }
}