// ---------------------------------------------------------------------------
// Phase 3A — Agent layer: bounded reasoning orchestrator
//
// The agent loop. The model talks to an LLMProvider; when the model requests
// tool calls they are executed against the Phase 2E registry and the results
// are fed back so the model can decide whether more evidence is needed.
//
// Hard bounds (AgentConfig) keep the loop finite:
//   - maxReasoningRounds  — never `while (true)`
//   - maxToolCalls        — total tool executions per session
//   - maxRetries          — transient provider failures
//   - maxValidationRetries— malformed structured output
//   - maxToolResultChars  — tool results are truncated before being fed back
//   - cacheToolResults    — identical tool calls in one session are cached
//
// When a limit is reached or the provider/validation keeps failing, the
// orchestrator stops gracefully, preserves the evidence already gathered and
// synthesizes the best possible response (see synthesis.ts). It never
// throws to the UI for ordinary failures.
// ---------------------------------------------------------------------------

import type { AnalystResponse } from '../types'
import type { ToolContext, ToolResult } from '../tools/types'
import type { AnalystToolRegistry } from '../tools/registry'
import type {
  AgentConfig,
  AgentSessionInput,
  AgentSessionOutput,
  AgentTraceStep,
  LLMMessage,
  LLMToolCall,
  LLMProvider,
} from './types'
import { DEFAULT_AGENT_CONFIG, ProviderError } from './types'
import { buildSystemPrompt } from './systemPrompt'
import { buildProviderTools } from './toolCatalog'
import { describeUniverse, findEntityMentions, resolveEntity } from './entityResolution'
import { understandTurn, threadMetaOf, type Understanding } from './understanding'
import { validateStructuredResponse } from './responseValidator'
import { synthesizeResponse } from './synthesis'
import { refineResponse, auditResponse, applyOutputHygiene, annotateSyntheticData } from './responseIntelligence'
import { logAgent } from './logger'
import { isValidWebSearchResult } from '../websearch/limits'
import { validateWebSearchQuery } from '../websearch/limits'
import { WEBSEARCH_LIMITS } from '../websearch/limits'
import { dedupeResults, truncateEvidence } from '../websearch/normalize'
import { buildNewsQuery, processNewsResults } from '../websearch/news'
import type { NewsItem, NewsEvidence, WebSearchQuery, WebSearchResult, WebSearchTransport } from '../websearch/types'
import { SearchTransportError } from '../websearch/transport'
import { createSearchCache, type SearchCache } from '../websearch/cache'
import { retrieveEvidence } from '../websearch/retrieve'
import { ToolError } from '../tools/errors'
import { errorResult } from '../tools/results'
import type { ConversationSession } from '../conversation/types'
import { extractExplicitEntities } from '../conversation/entities'

export interface OrchestratorDeps {
  provider: LLMProvider
  registry: AnalystToolRegistry
  toolContext: ToolContext
  config?: Partial<AgentConfig>
  /**
   * Phase 3C.1 — web search session. When present, searchWeb is offered to
   * the model and executed through the transport; when absent, searchWeb is
   * not in the catalog (dynamic tool selection stays with the orchestrator).
   */
  search?: SearchSessionDeps
  /**
   * Phase 3D.1 — session-only conversation memory. When present, each turn
   * is resolved against the session state, the bounded context payload is
   * injected as a system message, and the completed turn (response, tool
   * evidence, sources) is recorded afterwards. When absent, the orchestrator
   * behaves exactly as before (no context injection, no memory).
   */
  conversation?: ConversationSession
}

export interface SearchSessionDeps {
  transport: WebSearchTransport
  /** Approved: 4 web searches per session. */
  maxSearches?: number
  /** Shared request/session cache used by the main loop and fallbacks. */
  cache?: SearchCache
}

const VALIDATION_HINT =
  'Your previous message did not pass validation. Respond again with a SINGLE JSON object matching the required schema exactly. Fix these errors:'

/**
 * Phase 3O — progressive-disclosure directives for continuation follow-ups.
 * Deterministic: the classification comes from understanding.classifyFollowUp;
 * this map turns it into ONE natural line the model can act on. `new` and
 * `other` carry no directive (they are fresh questions, not continuations).
 */
const FOLLOW_UP_DIRECTIVES: Record<import('./understanding').FollowUpKind, string | null> = {
  new: null,
  other: null,
  clarify: 'No active thread to continue. If the answer depends on which instrument or question they mean, ask one concise clarification.',
  why: 'This is a follow-up asking WHY. Expand the reasoning behind your previous answer — add information; do not restate the prior conclusion.',
  expand: 'The user wants more on this. Add the supporting detail the previous answer left out.',
  deepen: 'The user wants to GO DEEPER. Widen the analysis — weigh scenarios, conflicts and evidence quality.',
  drivers: 'This is a follow-up about DRIVERS. Investigate what is actually moving it rather than repeating the summary.',
  risks: 'This is a follow-up about RISKS. Focus on what could invalidate or oppose the current view; name the biggest caveat plainly.',
  premise: 'The user asserted a causal claim. Evaluate it against the evidence — agree where the data supports it, and say plainly when it does not. Never inherit a premise just because it was embedded in the question.',
  opinion: 'The user wants your judgment. Give a labeled, evidence-based opinion as an inference — never as fact or certainty.',
  'switch-subject': 'The user switched to a new instrument. Treat it as the new focus of the analysis.',
  'temporal-compare': 'The user is comparing states. Compare the current evidence with the earlier state in this session and say what changed.',
  counterfactual: 'The user is asking a hypothetical. Answer conditionally — what would need to be true, and what the evidence suggests.',
  'bull-bear': 'The user wants BOTH cases. Present the bull and bear sides with the evidence for each — do not collapse them.',
  confirmed: 'The user asks reported-vs-confirmed. Say how widely the story is reported and by whom; never claim verification beyond the corroboration the evidence shows.',
}

/** Phase 3D.1 — evidence record for one executed tool call. */
interface GatheredEvidence {
  result: ToolResult
  entity?: string
}

/** Canonical entity a tool call targeted (from its normalized arguments). */
function evidenceEntity(name: string, args: Record<string, unknown>): string | undefined {
  if (typeof args.instrument === 'string') return resolveEntity(args.instrument)?.id
  if (Array.isArray(args.instruments)) {
    const first = args.instruments.find((i): i is string => typeof i === 'string')
    if (first) return resolveEntity(first)?.id
  }
  // Phase 3D — macro indicator ids ('brent', 'gold', 'usdinr') are canonical
  // subject entities, so their evidence is attributable in memory.
  if (name === 'getMacroContext' && typeof args.indicatorId === 'string') {
    return resolveEntity(args.indicatorId)?.id
  }
  if (name === 'searchWeb' && typeof args.query === 'string') {
    return extractExplicitEntities(args.query)[0]?.id
  }
  if (name === 'searchNews' && typeof args.subject === 'string') {
    return extractExplicitEntities(args.subject)[0]?.id
  }
  return undefined
}

export async function runAgentSession(
  input: AgentSessionInput,
  deps: OrchestratorDeps,
): Promise<AgentSessionOutput> {
  const config: AgentConfig = { ...DEFAULT_AGENT_CONFIG, ...(deps.config ?? {}) }
  const { provider, registry, toolContext } = deps
  if (toolContext.refresh) await toolContext.refresh()
  const trace: AgentTraceStep[] = []

  // Phase 3D.1 — resolve this turn against session memory (pure, never mutates).
  const turn = deps.conversation
    ? deps.conversation.resolve(input.text, toolContext.now)
    : null

  const mentions = findEntityMentions(input.text)
  const historyMentions = (input.history ?? []).slice(-config.maxHistoryTurns).flatMap((h) =>
    findEntityMentions(`${h.title} ${h.summary ?? ''}`),
  )

  // Phase 3D — structured UNDERSTAND stage: subject, asset class, intent,
  // timeframe, scope, clarification need. Feeds the context note, synthesis
  // and the debug trace; the LLM stays the primary reasoner.
  // Phase 3O — the stage also classifies how this turn continues the thread
  // (why/risks/drivers/deepen/premise/opinion/switch/temporal…) so the model
  // gets a progressive-disclosure directive instead of a fresh question.
  const hasActiveTopic = turn
    ? turn.interpretation.entities.length > 0 || deps.conversation?.state.activeTopic != null
    : false
  const understanding = understandTurn(input.text, { hasActiveTopic })
  logAgent({
    kind: 'understanding',
    text: understanding.text,
    subject: understanding.primary?.subject.id ?? null,
    assetClass: understanding.primary?.subject.assetClass ?? null,
    intent: understanding.intent,
    scope: understanding.scope,
    newsHint: understanding.newsHint,
    followUp: understanding.followUp,
    continuation: understanding.continuation,
    premise: understanding.premise,
    catalystRelevant: understanding.catalystRelevant,
  })

  const universe = buildUniverseNote()
  const webSearchAvailable = deps.search !== undefined
  const system = buildSystemPrompt({ universe, webSearch: webSearchAvailable })

  const messages: LLMMessage[] = []
  appendHistory(messages, input.history ?? [], config.maxHistoryTurns)
  messages.push(buildContextNote(understanding, mentions, historyMentions))
  if (turn) {
    messages.push({ role: 'system', content: turn.payload })
    logAgent({ kind: 'conversation-context-built', chars: turn.payload.length, entities: turn.interpretation.entities.length })
  }
  messages.push({ role: 'user', content: input.text })

  logAgent({ kind: 'request-started', text: input.text })

  const toolCache = new Map<string, ToolResult>()
  // Retrieval-cost optimization — session-level evidence cache: duplicate or
  // equivalent search queries within this request are served from here and
  // never reach the transport (and therefore never reach Tavily). Bounded by
  // the approved cache limits; entries expire (configurable TTL, default 300s).
  const evidenceCache: SearchCache | null = config.cacheToolResults
    ? (deps.search?.cache ?? createSearchCache({
        ttlMs: config.searchCacheTtlMs ?? WEBSEARCH_LIMITS.cacheTtlMs,
        maxEntries: WEBSEARCH_LIMITS.cacheMaxEntries,
      }))
    : null
  let toolCallsUsed = 0
  let round = 0
  let validationFailures = 0
  // Phase 3D.1 — gathered evidence carries the entity each call targeted so
  // conversation memory can remember which instruments were examined.
  const gathered: GatheredEvidence[] = []
  // Phase 3C.1 — validated web evidence accumulated across the session.
  const sessionSources: WebSearchResult[] = []
  const searchUsage = { used: 0 }
  // Phase 3N.1 — validated live-news evidence (subset of sessionSources that
  // came from searchNews) plus its own per-session budget.
  const sessionNews: NewsItem[] = []
  const newsUsage = { used: 0 }
  const totalSearchUsage = { used: 0 }
  // Retrieval-cost optimization — observability counters for the session
  // summary (dev logs only, never user-facing).
  const searchCacheHits = { count: 0 }
  const newsCacheHits = { count: 0 }

  let final: AgentSessionOutput | null = null

  while (round < config.maxReasoningRounds) {
    round += 1
    logAgent({ kind: 'reasoning-round', round, provider: provider.name })

    // Phase 5 — deterministic intent-based research policies: restrict the
    // offered tool catalog to what the question actually needs. This prevents
    // the model from blindly calling every tool and keeps retrieval cheap.
    // - simple price/status: market-data tools only, no web search
    // - driver/catalyst: market data + searchNews (RSS-first at the gateway)
    // - compare: market data for both subjects, news only if explicitly needed
    // - generic factual: searchWeb only, no market data
    // - deep research: full catalog allowed
    const isSimpleStatus = understanding.intent === 'current_market_status' && !understanding.catalystRelevant && !understanding.debate
    const isDriver = understanding.catalystRelevant && !understanding.debate
    const isCompare = understanding.intent === 'compare'
    const isDeepResearch = understanding.depth === 'deep'
    const isNewsOnly = understanding.intent === 'news'
    const isGenericFactual = understanding.intent === 'other' && !understanding.catalystRelevant

    const tools = buildProviderTools(registry, {
      includeWebSearch: webSearchAvailable && !isSimpleStatus && !isCompare,
      includeSearchNews: webSearchAvailable && (isNewsOnly || isDriver || isDeepResearch),
      includeSearchWeb: webSearchAvailable && (isGenericFactual || isDeepResearch),
    })
    let result
    try {
      result = await callWithRetry(provider, { system, messages, tools, config, trace, round })
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : 'Provider failed unexpectedly'
      logAgent({ kind: 'error', message })
      trace.push({ kind: 'error', round, detail: `provider-failure: ${message}` })
      // If the provider is down before any evidence was gathered, let the
      // engine fall back to the deterministic AnalystEngine.
      if (gathered.length === 0) throw thrown
      break
    }

    trace.push({
      kind: 'llm',
      round,
      detail: `llm: ${provider.name}`,
      provider: provider.name,
    })
    logAgent({ kind: 'provider-response', provider: provider.name, toolCalls: result.toolCalls.length })

    if (result.toolCalls.length > 0) {
      if (toolCallsUsed + result.toolCalls.length > config.maxToolCalls) {
        trace.push({
          kind: 'limit',
          round,
          detail: `tool-calls: limit ${config.maxToolCalls} reached (requested ${result.toolCalls.length})`,
        })
        logAgent({ kind: 'limit-reached', limit: 'tool-calls' })
        // Preserve evidence already gathered and answer from it.
        break
      }

      // Multi-round protocol: OpenAI-compatible endpoints require the model's
      // tool calls to be echoed back as an assistant message BEFORE the tool
      // results — every tool result's tool_call_id must reference a preceding
      // assistant tool_calls entry. Without this the next LLM round is rejected
      // before the model can see any tool output.
      messages.push({ role: 'assistant', content: '', toolCalls: result.toolCalls })

      const executed = await executeToolCalls(result.toolCalls, {
        registry,
        toolContext,
        config,
        toolCache,
        trace,
        round,
        messages,
        search: deps.search,
        searchUsage,
        newsUsage,
        totalSearchUsage,
        sessionSources,
        sessionNews,
        evidenceCache,
        searchCacheHits,
        newsCacheHits,
      })
      gathered.push(...executed)
      toolCallsUsed += executed.length
      continue
    }

    // No tool calls — the model is answering.
    const parsed = parseJsonContent(result.content)

    // Phase 3P — for driver/catalyst questions, ensure fresh news evidence is
    // gathered before the model finalizes. If the model produced a final
    // response without calling searchNews/searchWeb, run searchNews
    // automatically and feed the results back for one more reasoning round.
    if (
      parsed === null &&
      result.toolCalls.length === 0 &&
      understanding.catalystRelevant &&
      !gathered.some((g) => g.result.metadata.tool === 'searchNews' || g.result.metadata.tool === 'searchWeb')
    ) {
      if (toolCallsUsed < config.maxToolCalls && round < config.maxReasoningRounds) {
        const autoSubject = understanding.primary?.subject.label ?? understanding.newsHint ?? input.text
        const autoNewsCall: LLMToolCall = {
          id: `auto-news-${Date.now().toString(36)}`,
          name: 'searchNews',
          arguments: { subject: autoSubject },
        }
        const autoExecuted = await executeToolCalls([autoNewsCall], {
          registry,
          toolContext,
          config,
          toolCache,
          trace,
          round,
          messages,
          search: deps.search,
          searchUsage,
          newsUsage,
          totalSearchUsage,
          sessionSources,
          sessionNews,
          evidenceCache,
          searchCacheHits,
          newsCacheHits,
        })
        gathered.push(...autoExecuted)
        toolCallsUsed += autoExecuted.length
        trace.push({
          kind: 'tool',
          round,
          tool: 'searchNews',
          ok: autoExecuted[0]?.result.ok ?? false,
          detail: `auto-enforced for driver question (${autoSubject})`,
        })
        continue
      }
    }

    if (parsed !== null) {
      const validation = validateStructuredResponse(parsed)
      if (validation.ok && validation.response) {
        trace.push({ kind: 'llm', round, detail: 'final-response-validated', provider: provider.name })
        logAgent({ kind: 'final-response', title: validation.response.title })
        // Phase 3N.2 — the deterministic hygiene pass over the validated
        // response: raw tool-name headings become analyst vocabulary, exact
        // duplicates are folded, empty sections are dropped. Facts and
        // structure are preserved — presentation only.
        const refined = refineResponse(attachSources(validation.response, sessionSources))
        // Phase 3O — the deterministic half of the quality gate (answer opens
        // on substance, no tool names/closers, no cross-turn repetition,
        // provenance survives). Observability only — issues are logged, never
        // fatal.
        if (deps.conversation) {
          const issues = auditResponse(refined, {
            priorSummaries: deps.conversation.state.recentAssistantSummaries
              .slice(-3)
              .map((s) => s.summary)
              .filter(Boolean),
            sourcesExpected: sessionSources.length > 0,
          })
          if (issues.length > 0) {
            logAgent({ kind: 'quality-gate', issues: issues.map((i) => i.id).join(',') })
          }
        }
        final = { response: refined, understanding, trace }
        break
      }
      if (validationFailures < config.maxValidationRetries) {
        validationFailures += 1
        trace.push({
          kind: 'error',
          round,
          detail: `validation: ${validation.errors.slice(0, 3).join('; ')}`,
        })
        messages.push({ role: 'user', content: `${VALIDATION_HINT} ${validation.errors.join(' ')}` })
        continue
      }
      trace.push({
        kind: 'limit',
        round,
        detail: `validation: max retries (${config.maxValidationRetries}) exceeded`,
      })
      logAgent({ kind: 'limit-reached', limit: 'validation' })
      break
    }

    // Content was not JSON.
    if (validationFailures < config.maxValidationRetries) {
      validationFailures += 1
      trace.push({ kind: 'error', round, detail: 'non-json content' })
      messages.push({
        role: 'user',
        content: `${VALIDATION_HINT} Expected JSON, got text. Respond with only the JSON object.`,
      })
      continue
    }
    trace.push({ kind: 'limit', round, detail: 'validation: non-json, max retries exceeded' })
    logAgent({ kind: 'limit-reached', limit: 'validation' })
    break
  }

  // Reached a limit or provider failure — synthesize from gathered evidence.
  if (!final) {
    if (trace.some((t) => t.kind === 'limit' || t.kind === 'error')) {
      trace.push({ kind: 'fallback', round, detail: 'synthesized-from-evidence' })
    }
    final = {
      response: synthesizeResponse({
        question: input.text,
        results: gathered.map((g) => g.result),
        mentions,
        // Phase 3D.1 — the resolved turn names the subject even when the
        // raw text only used a pronoun ("Why?", "What about it?").
        subject: turn?.interpretation.entities[0]?.displayName ?? mentions[0]?.displayName,
        // Phase 3D — the structured understanding names the real subject,
        // its asset class and its data coverage, so the synthesized response
        // reflects what the user actually asked about (never a silent NIFTY).
        subjectLabel: understanding.primary?.subject.label,
        assetClass: understanding.primary?.subject.assetClass,
        subjectCoverage: understanding.primary?.subject.coverage,
        sources: sessionSources,
        // Phase 3N.3 — driver questions must never be answered by price data
        // alone: the fallback synthesis leads with the established catalyst or
        // states plainly that none could be established.
catalystRelevant: understanding.catalystRelevant,
        // Phase 3N.5 — debate asks ("is oil bullish right now?") render the
        // bull/bear debate structure in the deterministic synthesis.
        debate: understanding.debate,
        // Phase 3O — the fallback continues the analytical thread: the
        // follow-up kind ("why" after a bullish Nifty read) and the previous
        // turn's thread shape the title/summary so the fallback adds to the
        // conversation instead of restarting it.
        followUp: understanding.followUp,
        thread: deps.conversation?.state.analyticalThread ?? undefined,
        now: toolContext.now,
      }),
      understanding,
      trace,
    }
  }

  // Phase 3N.4 — final hygiene runs BEFORE anything enters session memory:
  // the recap ("The last answer was X", stored summaries, evidence notes)
  // quotes what was recorded, so a hostile LLM title/summary must never be
  // recorded in the first place. The engine's own gate then re-cleans the
  // returned response (idempotent). Provenance is NOT preserved here — the
  // tool-name exemption belongs to the deterministic memory fallback only.
  if (final) {
    // Keep the internal session output rich. The engine's public generate()
    // boundary applies the question's depth policy before rendering.
    final.response = annotateSyntheticData(applyOutputHygiene(final.response), gathered.map((g) => g.result))
  }

  // Phase 3D.1 — record the completed turn in session memory.
  if (deps.conversation && turn) {
    deps.conversation.update(turn, {
      response: final.response,
      evidence: gathered.map((g) => ({ result: g.result, entity: g.entity })),
      sources: sessionSources,
      news: sessionNews,
      // Phase 3O — the question kind/timeframe anchor the analytical thread.
      thread: threadMetaOf(understanding),
      now: toolContext.now,
    })
    logAgent({ kind: 'conversation-updated', turn: deps.conversation.state.turnCount })
  }
  // Retrieval-cost optimization — dev observability: how many live searches
  // ran this request and how many duplicate requests were served from the
  // session evidence cache instead.
  logAgent({
    kind: 'search-session-summary',
    webSearches: searchUsage.used,
    newsSearches: newsUsage.used,
    webCacheHits: searchCacheHits.count,
    newsCacheHits: newsCacheHits.count,
  })
  return final
}

/** Attach the session's validated web evidence to a final response. */
function attachSources(response: AnalystResponse, sources: WebSearchResult[]): AnalystResponse {
  if (sources.length === 0) return response
  return { ...response, sources: dedupeResults(sources).results }
}

// --- Internals -------------------------------------------------------------

function buildUniverseNote(): string {
  return describeUniverse()
}

function appendHistory(messages: LLMMessage[], history: AnalystResponse[], maxTurns: number): void {
  const recent = history.slice(-maxTurns)
  if (recent.length === 0) return
  const lines = recent.map(
    (h, i) =>
      `${i + 1}. "${h.title}"${h.summary ? ` — ${h.summary}` : ''}${h.partial ? ' (partial)' : ''}`,
  )
  messages.push({ role: 'system', content: `Prior conversation turns:\n${lines.join('\n')}` })
}

function buildContextNote(
  understanding: Understanding,
  mentions: ReturnType<typeof findEntityMentions>,
  historyMentions: ReturnType<typeof findEntityMentions>,
): LLMMessage {
  const lines: string[] = []

  // Phase 3N — the depth this turn warrants (brief / standard / deep).
  const depthGuides: Record<Understanding['depth'], string> = {
    brief: 'brief — a direct, short answer; minimal structure',
    standard: 'standard — a short synthesis plus the key supporting points',
    deep: 'deep — structured depth; weigh evidence, surface conflicts and scenarios',
  }
  lines.push(`Answer depth: ${depthGuides[understanding.depth]}.`)

  // Phase 3O — how this turn continues the thread. The directive tells the
  // model HOW to answer a follow-up (expand/risks/drivers/deepen/both-cases/
  // reported-vs-confirmed/temporal-compare) instead of treating it as a
  // brand-new question, and guards against cross-turn repetition.
  const followUpDirective = FOLLOW_UP_DIRECTIVES[understanding.followUp]
  if (followUpDirective) {
    lines.push(`Follow-up (${understanding.followUp}): ${followUpDirective}`)
  }
  if (understanding.premise) {
    lines.push(`The user asserted a causal claim: "${understanding.premise}". Evaluate it against the evidence.`)
  }
  // Phase 3N.3 — driver/catalyst questions: price levels alone are not a
  // complete answer. The model is told to investigate current catalysts and
  // combine them with the deterministic data — and to say plainly when no
  // catalyst can be established instead of inventing one.
  if (understanding.catalystRelevant) {
    lines.push(
      'This is a driver/catalyst question (what is happening, why it is moving, what is driving it, whether it is bullish/bearish). Price levels alone are not a complete answer: investigate the current catalysts with searchNews or searchWeb and combine the retrieved evidence with the deterministic market data. If no reliable catalyst can be established, say so explicitly — never invent a driver.',
    )
  }
  if (understanding.continuation) {
    lines.push('Do not repeat your previous conclusion — this follow-up asks for more. Build on the thread: continue, expand or correct it.')
  }

  if (understanding.primary) {
    const { subject, matched } = understanding.primary
    const coverageNote =
      subject.coverage === 'web-only'
        ? ', no deterministic Finova data — web search only'
        : ''
    lines.push(
      `Subject: ${subject.label} (${subject.assetClass}${coverageNote}). The user said "${matched}".`,
    )
    if (understanding.secondary) {
      const relationship =
        understanding.intent === 'impact' || understanding.intent === 'compare'
          ? ' — address how it relates to the primary subject'
          : ''
      lines.push(
        `Secondary subject: ${understanding.secondary.subject.label} (${understanding.secondary.subject.assetClass})${relationship}.`,
      )
    }
    lines.push(subject.guidance)
    if (understanding.newsHint && (understanding.intent === 'news' || understanding.catalystRelevant)) {
      lines.push(
        `The user wants news or current drivers. Check the session context first — if it already lists fresh news for this subject, reuse it; otherwise search the web with a natural query, e.g. "${understanding.newsHint}".`,
      )
    }
  } else if (understanding.scope === 'broad') {
    lines.push(
      'Broad market question (no single subject). getMarketSnapshot covers Indian equities and global equity indices; for news on commodities, crypto or global events use searchWeb. Never substitute Indian equity data for other asset classes.',
    )
  } else {
    lines.push(
      'No known instrument was mentioned in this turn. If the question needs market data, ask the user which instrument they mean, or answer generally.',
    )
  }

  const seen = new Set<string>()
  const all = [...mentions, ...historyMentions]
    .filter((m) => !seen.has(m.id) && seen.add(m.id))
    .slice(0, 6)
  if (all.length > 0) {
    const list = all.map((m) => `${m.id} (${m.displayName})`).join(', ')
    lines.push(
      `Resolved instruments for this question (use these canonical ids when calling tools): ${list}.`,
    )
  }

  return { role: 'system', content: lines.join('\n') }
}

async function callWithRetry(
  provider: LLMProvider,
  opts: {
    system: string
    messages: LLMMessage[]
    tools: ReturnType<typeof buildProviderTools>
    config: AgentConfig
    trace: AgentTraceStep[]
    round: number
  },
): Promise<Awaited<ReturnType<LLMProvider['generate']>>> {
  const { config, trace, round } = opts
  let attempt = 0
  for (;;) {
    try {
      const signal = config.timeoutMs > 0 ? AbortSignal.timeout(config.timeoutMs) : undefined
      return await provider.generate({
        system: opts.system,
        messages: opts.messages,
        tools: opts.tools,
        temperature: config.temperature,
        signal,
      })
    } catch (thrown) {
      const err = thrown instanceof ProviderError ? thrown : new ProviderError('unavailable', String(thrown))
      attempt += 1
      trace.push({
        kind: 'error',
        round,
        detail: `provider-error (${err.kind}) attempt ${attempt}/${config.maxRetries + 1}`,
      })
      if (attempt > config.maxRetries || !err.retryable) {
        throw err
      }
      await delay(100 * attempt)
    }
  }
}

async function executeToolCalls(
  calls: LLMToolCall[],
  opts: {
    registry: AnalystToolRegistry
    toolContext: ToolContext
    config: AgentConfig
    toolCache: Map<string, ToolResult>
    trace: AgentTraceStep[]
    round: number
    messages: LLMMessage[]
    search?: SearchSessionDeps
    searchUsage: { used: number }
    newsUsage: { used: number }
    totalSearchUsage: { used: number }
    sessionSources: WebSearchResult[]
    sessionNews: NewsItem[]
    evidenceCache: SearchCache | null
    searchCacheHits: { count: number }
    newsCacheHits: { count: number }
  },
): Promise<GatheredEvidence[]> {
  const { registry, toolContext, config, toolCache, trace, round, messages, search, searchUsage, newsUsage, totalSearchUsage, sessionSources, sessionNews, evidenceCache, searchCacheHits, newsCacheHits } = opts
  const executed: GatheredEvidence[] = []

  for (const call of calls) {
    // Phase 3C.1 — searchWeb executes asynchronously through the session
    // transport; it is never run through the synchronous registry.
    if (call.name === 'searchWeb') {
      const result = await executeSearchWebCall(call, {
        toolContext,
        trace,
        round,
        messages,
        config,
        search: search ?? null,
        searchUsage,
        totalSearchUsage,
        sessionSources,
        evidenceCache,
        searchCacheHits,
      })
      executed.push({ result, entity: evidenceEntity(call.name, normalizeArgs(call.name, call.arguments)) })
      continue
    }

    // Phase 3N.1 — searchNews is the live-news path: same transport, its own
    // per-session budget, deterministic news processing (freshness tiers,
    // source tiers, story corroboration) on top of the same validated output.
    if (call.name === 'searchNews') {
      const result = await executeNewsCall(call, {
        toolContext,
        trace,
        round,
        messages,
        config,
        search: search ?? null,
        newsUsage,
        totalSearchUsage,
        sessionSources,
        sessionNews,
        evidenceCache,
        newsCacheHits,
      })
      executed.push({ result, entity: evidenceEntity(call.name, normalizeArgs(call.name, call.arguments)) })
      continue
    }

    const tool = registry.get(call.name)
    logAgent({ kind: 'tool-selected', tool: call.name })

    if (!tool) {
      const errResult: ToolResult = {
        ok: false,
        data: null,
        error: { code: 'UNKNOWN_TOOL', message: `Unknown tool '${call.name}'.` },
        metadata: {
          tool: call.name,
          timestamp: new Date(toolContext.now).toISOString(),
          source: 'market-data',
          dataMode: 'unavailable',
          available: false,
          warnings: [`Tool '${call.name}' is not in the registry.`],
        },
      }
      trace.push({ kind: 'tool', round, tool: call.name, ok: false, detail: 'unknown-tool' })
      logAgent({ kind: 'tool-failed', tool: call.name, message: 'unknown tool' })
      appendToolMessage(messages, call, errResult, config.maxToolResultChars)
      executed.push({ result: errResult })
      continue
    }

    const args = normalizeArgs(call.name, call.arguments)
    const cacheKey = config.cacheToolResults ? `${call.name}:${stableStringify(args)}` : `${call.name}:${call.id}`
    let result = toolCache.get(cacheKey)
    if (!result) {
      result = registry.execute(call.name, args, toolContext)
      if (config.cacheToolResults) toolCache.set(cacheKey, result)
    }

    trace.push({ kind: 'tool', round, tool: call.name, ok: result.ok, detail: `available=${result.metadata.available}` })
    if (result.ok) {
      logAgent({ kind: 'tool-completed', tool: call.name, ok: true })
    } else {
      logAgent({ kind: 'tool-failed', tool: call.name, message: result.error?.message ?? 'error' })
    }
    appendToolMessage(messages, call, result, config.maxToolResultChars)
    executed.push({ result, entity: evidenceEntity(call.name, args) })
  }

  return executed
}

// --- Phase 3C.1 — searchWeb execution ----------------------------------------

const SEARCH_NOT_CONFIGURED = 'Web search is not configured for this session. No live search was performed — fall back to available Finova evidence.'

/**
 * Execute ONE searchWeb call through the retrieval seam. Never fabricates:
 * every result is real transport output (or the session cache's copy of it),
 * defensively re-validated, deduplicated and bounded to the approved evidence
 * budget. Failures (budget exhausted, transport error, not configured) are
 * reported honestly with available=false.
 */
async function executeSearchWebCall(
  call: LLMToolCall,
  opts: {
    toolContext: ToolContext
    config: AgentConfig
    trace: AgentTraceStep[]
    round: number
    messages: LLMMessage[]
    search: SearchSessionDeps | null
    searchUsage: { used: number }
    totalSearchUsage: { used: number }
    sessionSources: WebSearchResult[]
    evidenceCache: SearchCache | null
    searchCacheHits: { count: number }
  },
): Promise<ToolResult> {
  const { toolContext, config, trace, round, messages, search, searchUsage, totalSearchUsage, sessionSources, evidenceCache, searchCacheHits } = opts
  const name = 'searchWeb'

  const args = normalizeArgs(name, call.arguments)

  if (!search) {
    const result = unavailableSearchResult(toolContext.now, [SEARCH_NOT_CONFIGURED])
    trace.push({ kind: 'tool', round, tool: name, ok: true, detail: 'available=false: not-configured' })
    logAgent({ kind: 'tool-failed', tool: name, message: 'searchWeb not configured' })
    appendToolMessage(messages, call, result, config.maxToolResultChars)
    return result
  }

  const query = parseSearchQuery(args)
  if (!query) {
    const result = invalidSearchInput(toolContext.now, args)
    trace.push({ kind: 'tool', round, tool: name, ok: false, detail: 'invalid-input' })
    logAgent({ kind: 'tool-failed', tool: name, message: result.error?.message ?? 'invalid input' })
    appendToolMessage(messages, call, result, config.maxToolResultChars)
    return result
  }
  logAgent({ kind: 'research-query', tool: name, query: query.query })

  const budget = search.maxSearches ?? 4
  if (totalSearchUsage.used >= budget) {
    const result = unavailableSearchResult(toolContext.now, [
      `Web search session limit reached (${budget} searches per session). No further live search was performed.`,
    ])
    trace.push({ kind: 'tool', round, tool: name, ok: true, detail: `available=false: session-limit (${budget})` })
    logAgent({ kind: 'tool-failed', tool: name, message: `search session limit (${budget}) reached` })
    appendToolMessage(messages, call, result, config.maxToolResultChars)
    return result
  }

  try {
    // Retrieval-cost optimization — cache-first, transport (Tavily) fallback.
    // A cache hit is served with NO transport call; the event stream logs the
    // hit/miss and which provider actually served a fetch.
    const { response } = await retrieveEvidence({
      transport: search.transport,
      query,
      tool: name,
      cache: evidenceCache ?? search?.cache,
      onEvent: (event) => {
        if (event.type === 'hit') {
          searchCacheHits.count += 1
          logAgent({ kind: 'retrieval-cache', tool: name, hit: true, key: event.key })
        } else if (event.type === 'miss') {
          logAgent({ kind: 'retrieval-cache', tool: name, hit: false, key: event.key })
        } else {
          logAgent({ kind: 'retrieval-fetch', tool: name, key: event.key, provider: event.provider })
        }
      },
    })

    if (response.cached !== true) {
      searchUsage.used += 1
      totalSearchUsage.used += 1
    }

    // Defensive re-validation of transport output — only real, well-formed
    // results become evidence.
    const validated = response.results.filter((r) => isValidWebSearchResult(r))
    const deduped = dedupeResults(validated)
    const bounded = deduped.results.slice(0, budget)
    const { results, truncated } = truncateEvidence(bounded)

    const warnings: string[] = []
    if (results.length === 0) warnings.push('The web search returned no usable results. Answer from available Finova evidence.')

    logAgent({
      kind: 'research-results',
      tool: name,
      items: results.length,
      truncated,
      headlines: results.slice(0, 3).map((r) => r.title),
    })

    const result = successSearchResult(toolContext.now, {
      query: response.query,
      results,
      totalResults: bounded.length,
      truncated,
      ...(response.cached === true ? { cached: true } : {}),
    }, warnings)
    for (const r of results) sessionSources.push(r)

    trace.push({
      kind: 'tool',
      round,
      tool: name,
      ok: true,
      detail: `available=true, results=${results.length}${truncated ? ', truncated' : ''}`,
    })
    logAgent({ kind: 'tool-completed', tool: name, ok: true })
    appendToolMessage(messages, call, result, config.maxToolResultChars)
    return result
  } catch (thrown) {
    const err = thrown instanceof SearchTransportError
      ? thrown
      : new SearchTransportError('provider-error', thrown instanceof Error ? thrown.message : 'Web search failed unexpectedly')
    const result = errorResult(
      name,
      'web-search',
      ToolError.dataUnavailable(`Web search failed: ${err.message}`, { code: err.code }),
      { available: false, now: toolContext.now },
    )
    trace.push({ kind: 'tool', round, tool: name, ok: false, detail: `transport-error: ${err.code}` })
    logAgent({ kind: 'tool-failed', tool: name, message: err.message })
    appendToolMessage(messages, call, result, config.maxToolResultChars)
    return result
  }
}

function parseSearchQuery(args: Record<string, unknown>): WebSearchQuery | null {
  const validation = validateWebSearchQuery(args)
  return validation.ok ? validation.query : null
}

// --- Phase 3N.1 — searchNews execution ---------------------------------------

const NEWS_NOT_CONFIGURED = 'Web search is not configured for this session. No live news search was performed — fall back to available Finova evidence.'

/**
 * Execute ONE searchNews call through the session transport. Same honesty
 * contract as searchWeb (real transport output, defensively re-validated,
 * never fabricated), plus the deterministic news processing layer: the
 * validated results are clustered into stories, freshness/source tiers are
 * computed from real data, and corroboration counts how many outlets report
 * each story. News has its own approved per-session budget.
 */
async function executeNewsCall(
  call: LLMToolCall,
  opts: {
    toolContext: ToolContext
    config: AgentConfig
    trace: AgentTraceStep[]
    round: number
    messages: LLMMessage[]
    search: SearchSessionDeps | null
    newsUsage: { used: number }
    totalSearchUsage: { used: number }
    sessionSources: WebSearchResult[]
    sessionNews: NewsItem[]
    evidenceCache: SearchCache | null
    newsCacheHits: { count: number }
  },
): Promise<ToolResult> {
  const { toolContext, config, trace, round, messages, search, newsUsage, totalSearchUsage, sessionSources, sessionNews, evidenceCache, newsCacheHits } = opts
  const name = 'searchNews'

  const args = normalizeArgs(name, call.arguments)

  if (!search) {
    const result = unavailableSearchResult(toolContext.now, [NEWS_NOT_CONFIGURED], name)
    trace.push({ kind: 'tool', round, tool: name, ok: true, detail: 'available=false: not-configured' })
    logAgent({ kind: 'tool-failed', tool: name, message: 'searchNews not configured' })
    appendToolMessage(messages, call, result, config.maxToolResultChars)
    return result
  }

  const budget = search.maxSearches ?? 4
  if (totalSearchUsage.used >= budget) {
    const result = unavailableSearchResult(toolContext.now, [
      `Live news session limit reached (${budget} news searches per session). No further live news search was performed.`,
    ])
    trace.push({ kind: 'tool', round, tool: name, ok: true, detail: `available=false: news-session-limit (${budget})` })
    logAgent({ kind: 'tool-failed', tool: name, message: `news session limit (${budget}) reached` })
    appendToolMessage(messages, call, result, config.maxToolResultChars)
    return result
  }

  const build = buildNewsQuery(args.subject, {
    region: typeof args.region === 'string' ? args.region : undefined,
    maxResults: typeof args.maxResults === 'number' ? args.maxResults : undefined,
    maxAgeDays: typeof args.maxAgeDays === 'number' ? args.maxAgeDays : undefined,
  })
  if (!build.ok) {
    const result = errorResult(
      name,
      'web-search',
      ToolError.invalidInput(`Invalid searchNews arguments: ${build.error}`),
      { available: false, now: toolContext.now },
    )
    trace.push({ kind: 'tool', round, tool: name, ok: false, detail: 'invalid-input' })
    logAgent({ kind: 'tool-failed', tool: name, message: result.error?.message ?? 'invalid input' })
    appendToolMessage(messages, call, result, config.maxToolResultChars)
    return result
  }
  logAgent({ kind: 'research-query', tool: name, subject: typeof args.subject === 'string' ? args.subject : undefined, query: build.query.query })

  try {
    // Retrieval-cost optimization — cache-first, transport (Tavily) fallback.
    // A cached response is re-processed against the CURRENT clock below, so
    // news freshness stays honest even when the raw results were cached.
    const { response } = await retrieveEvidence({
      transport: search.transport,
      query: build.query,
      tool: name,
      cache: evidenceCache ?? search?.cache,
      onEvent: (event) => {
        if (event.type === 'hit') {
          newsCacheHits.count += 1
          logAgent({ kind: 'retrieval-cache', tool: name, hit: true, key: event.key })
        } else if (event.type === 'miss') {
          logAgent({ kind: 'retrieval-cache', tool: name, hit: false, key: event.key })
        } else {
          logAgent({ kind: 'retrieval-fetch', tool: name, key: event.key, provider: event.provider })
        }
      },
    })

    if (response.cached !== true) {
      newsUsage.used += 1
      totalSearchUsage.used += 1
    }

    // Defensive re-validation — only real, well-formed results may proceed.
    const validated = response.results.filter((r) => isValidWebSearchResult(r))
    const deduped = dedupeResults(validated).results
    const processed = processNewsResults(deduped, {
      subject: build.query.query,
      region: build.region,
      maxItems: build.query.maxResults,
      maxAgeDays: build.maxAgeDays,
      now: toolContext.now,
    })

    const warnings: string[] = []
    if (processed.items.length === 0) {
      warnings.push(`No recent news coverage found for this subject. Answer from available Finova evidence.`)
    }

    logAgent({
      kind: 'research-results',
      tool: name,
      items: processed.items.length,
      truncated: processed.truncated,
      headlines: processed.items.slice(0, 3).map((i) => i.title),
    })

    const data: NewsEvidence & { cached?: boolean } = {
      ...processed,
      query: build.query,
      ...(response.cached === true ? { cached: true } : {}),
    }
    const result = successNewsResult(toolContext.now, data, warnings)
    for (const item of processed.items) {
      sessionSources.push(item)
      sessionNews.push(item)
    }

    trace.push({
      kind: 'tool',
      round,
      tool: name,
      ok: true,
      detail: `available=true, items=${processed.items.length}${processed.truncated ? ', truncated' : ''}`,
    })
    logAgent({ kind: 'tool-completed', tool: name, ok: true })
    appendToolMessage(messages, call, result, config.maxToolResultChars)
    return result
  } catch (thrown) {
    const err = thrown instanceof SearchTransportError
      ? thrown
      : new SearchTransportError('provider-error', thrown instanceof Error ? thrown.message : 'Web search failed unexpectedly')
    const result = errorResult(
      name,
      'web-search',
      ToolError.dataUnavailable(`Web search failed: ${err.message}`, { code: err.code }),
      { available: false, now: toolContext.now },
    )
    trace.push({ kind: 'tool', round, tool: name, ok: false, detail: `transport-error: ${err.code}` })
    logAgent({ kind: 'tool-failed', tool: name, message: err.message })
    appendToolMessage(messages, call, result, config.maxToolResultChars)
    return result
  }
}

/** The searchNews ToolResult shape — shared with the research fallback. */
export function successNewsResult(now: number, data: NewsEvidence, warnings: string[]): ToolResult {
  return {
    ok: true,
    data: data as never,
    error: null,
    metadata: {
      tool: 'searchNews',
      timestamp: new Date(now).toISOString(),
      source: 'web-search',
      dataMode: (data as NewsEvidence & { cached?: boolean }).cached === true ? 'cached-live' : 'live',
      available: true,
      warnings,
    },
  }
}

function unavailableSearchResult(now: number, warnings: string[], tool: string = 'searchWeb'): ToolResult {
  return {
    ok: true,
    data: null,
    error: null,
    metadata: {
      tool,
      timestamp: new Date(now).toISOString(),
      source: 'web-search',
      dataMode: 'unavailable',
      available: false,
      warnings,
    },
  }
}

function invalidSearchInput(now: number, args: Record<string, unknown>): ToolResult {
  return errorResult(
    'searchWeb',
    'web-search',
    ToolError.invalidInput(`Invalid searchWeb arguments: ${JSON.stringify(args).slice(0, 200)}`),
    { available: false, now },
  )
}

function successSearchResult(now: number, data: Record<string, unknown>, warnings: string[]): ToolResult {
  return {
    ok: true,
    data: data as never,
    error: null,
    metadata: {
      tool: 'searchWeb',
      timestamp: new Date(now).toISOString(),
      source: 'web-search',
      dataMode: (data.cached === true ? 'cached-live' : 'live'),
      available: true,
      warnings,
    },
  }
}

/** Normalize instrument args to canonical ids using entity resolution. */
function normalizeArgs(
  _name: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args }
  if (typeof out.instrument === 'string') {
    const resolved = resolveEntity(out.instrument)
    if (resolved) out.instrument = resolved.id
  }
  if (Array.isArray(out.instruments)) {
    out.instruments = out.instruments.map((i) => {
      if (typeof i === 'string') {
        const resolved = resolveEntity(i)
        return resolved ? resolved.id : i
      }
      return i
    })
  }
  return out
}

function appendToolMessage(
  messages: LLMMessage[],
  call: LLMToolCall,
  result: ToolResult,
  maxChars: number,
): void {
  const json = JSON.stringify(result)
  const truncated = json.length > maxChars ? `${json.slice(0, maxChars)}\n…[truncated]` : json
  messages.push({
    role: 'tool',
    name: call.name,
    toolCallId: call.id,
    content: truncated,
  })
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim()
  if (!trimmed) return null
  try {
    // Strip optional markdown fences the model might wrap JSON in.
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
    const candidate = fenced ? fenced[1] : trimmed
    return JSON.parse(candidate) as unknown
  } catch {
    return null
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}