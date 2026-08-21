// ---------------------------------------------------------------------------
// Phase 3A — Agent layer: deterministic evidence synthesis
// Phase 3N.2 — Conversational Response Intelligence: the same honest evidence
// synthesis, rendered like an analyst's answer instead of a dump of internal
// machinery:
//   - the summary OPENS with the answer (substance first), built only from
//     real tool output, never a meta-announcement about the session;
//   - tool function names never appear in headings, findings or prose
//     (responseIntelligence translates them to analyst vocabulary);
//   - evidence is consolidated: exact duplicates are folded, repeated
//     headings are disambiguated by instrument, conflicts between evidence
//     groups are surfaced honestly — never averaged away;
//   - sources are compressed to short citation lines and remain attached as
//     structured evidence for the UI (answer first, sources subordinate).
// When the LLM cannot produce a valid structured response (validation
// retries exhausted), the agent must still answer from the evidence already
// gathered. This module builds a valid AnalystResponse from the ToolResults
// collected during the session — deterministically, honestly, never inventing
// values the tools did not provide.
// ---------------------------------------------------------------------------

import type { AnalystResponse } from '../types'
import type { ToolResult } from '../tools/types'
import type { EntityMention } from './entityResolution'
import type { WebSearchResult, NewsItem } from '../websearch/types'
import type { AssetClass, SubjectCoverage } from './subjects'
import type { FollowUpKind } from './understanding'
import { isContinuation } from './understanding'
import type { AnalyticalThread } from '../conversation/types'
import { dedupeResults, truncateEvidence } from '../websearch/normalize'
import { logAgent } from './logger'
import {
  analyzeDriverEvidence,
  buildAnswerFirstSummary,
  buildDriverSummary,
  catalystEvidence,
  detectConflicts,
  detectDriverConflicts,
  detectTemporalInconsistency,
  directionalGroupOf,
  naturalHeadingForTool,
  sanitizeToolNames,
  themeLines,
} from './responseIntelligence'

export interface SynthesisInput {
  question: string
  results: ToolResult[]
  mentions: EntityMention[]
  /**
   * The resolved subject of this turn (e.g. the display name of the entity
   * the conversation resolved the question to). Falls back to mentions.
   */
  subject?: string
  /** Phase 3C.1 — validated web evidence gathered during the session. */
  sources?: WebSearchResult[]
  /**
   * Phase 3D — canonical label of the turn's subject ("Crude Oil (Brent)"),
   * its asset class and data coverage. The response title reflects the real
   * subject — never a silent default to the Indian market.
   */
  subjectLabel?: string
  assetClass?: AssetClass
  subjectCoverage?: SubjectCoverage
  /**
   * Phase 3O — how this turn continues the thread and the previous turn's
   * analytical thread. The fallback then CONTINUES the conversation ("the
   * follow-up on the Nifty read") instead of restarting it as a fresh
   * question.
   */
  followUp?: FollowUpKind
  thread?: AnalyticalThread
  /**
   * Phase 3N.3 — true for market-driver questions ("what is happening with X",
   * "why is X moving", "what is driving X", "is X bullish/bearish"). Price
   * data alone is never treated as a complete answer: the summary leads with
   * the established catalyst or states plainly that none could be established.
   */
  catalystRelevant?: boolean
  /**
   * Phase 3N.5 — true for bull/bear DEBATE asks ("is X bullish right now?",
   * "what's your read on X?", "bull case vs bear case"). The response is
   * rendered as a weighed debate: a calibrated verdict, a bull case, a bear
   * case, what is winning right now, and what would invalidate the view.
   */
  debate?: boolean
  /** Wall-clock now (for freshness/temporal-consistency notes). */
  now?: number
}

function fmt(n: number | null | undefined, digits = 2): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null
  return n.toFixed(digits)
}

interface SectionOut {
  heading: string
  kind: 'fact' | 'inference'
  body?: string
  bullets?: string[]
}

/** Instrument name from a result's data (for heading disambiguation). */
function instrumentOf(data: Record<string, unknown> | null): string | null {
  if (!data || typeof data !== 'object') return null
  return typeof data.instrument === 'string' ? data.instrument : null
}

/** Headings whose content varies per result and may legitimately repeat. */
const REPEATABLE_HEADINGS = new Set([
  'Trend & momentum',
  'Analyst read',
  'News',
  'Web evidence',
  'Macro context',
])

/**
 * Render ONE tool result as analyst sections. Tool function names are never
 * written into headings: the natural label replaces them, unavailable data is
 * reported honestly, and the else-branch never falls back to a raw tool-name
 * heading with an "Evidence captured" placeholder.
 */
function sectionFromResult(result: ToolResult): SectionOut[] {
  const tool = result.metadata.tool
  const data = result.data as Record<string, unknown> | null
  const out: SectionOut[] = []
  const natural = naturalHeadingForTool(tool)

  if (!result.ok || !result.metadata.available || data === null) {
    const reason = sanitizeToolNames(
      result.error?.message ?? result.metadata.warnings?.[0] ?? 'No data available.',
    )
    out.push({ heading: 'Data unavailable', kind: 'fact', body: reason })
    return out
  }

  if (tool === 'getTechnicalAnalysis' && data && typeof data === 'object') {
    const trend = data.trend as { overall?: { direction?: string; strength?: number } } | undefined
    const momentum = data.momentum as { rsi?: number | null; bias?: string } | undefined
    const price = data.price as { current?: number; changePercent?: number | null } | undefined
    const instr = instrumentOf(data) ?? 'the instrument'
    const direction = trend?.overall?.direction ?? null
    const rsi = fmt(momentum?.rsi)
    const change = fmt(price?.changePercent)

    const body =
      direction !== null
        ? `${instr} overall trend is ${direction}${trend?.overall?.strength !== undefined ? ` (strength ${fmt(trend.overall.strength, 1)})` : ''}${change ? `; the session is ${change}% on the day` : ''}.${rsi ? ` RSI is ${rsi}${momentum?.bias ? ` (${momentum.bias} momentum)` : ''}.` : ''}`
        : rsi
          ? `${instr} momentum reads ${rsi} on RSI${momentum?.bias ? ` (${momentum.bias})` : ''}.`
          : `${instr} technical readings are not available in this dataset.`
    out.push({ heading: 'Trend & momentum', kind: 'fact', body })
    out.push({
      heading: 'Analyst read',
      kind: 'inference',
      body: `The technical picture for ${instr} is primarily ${direction ?? 'mixed'}. Treat this as the engine's interpretation of the data available; it is not a recommendation.`,
    })
  } else if (tool === 'getMarketSnapshot' && data && typeof data === 'object') {
    const regime = typeof data.regime === 'string' ? data.regime : 'mixed'
    const indices = Array.isArray(data.indices) ? (data.indices as Array<{ symbol?: string; changePct?: number }>) : []
    const leader = indices.length > 0 ? indices[0] : undefined
    out.push({
      heading: 'Market regime',
      kind: 'fact',
      body: `The market regime is ${regime}.${leader && leader.symbol ? ` ${leader.symbol} leads at ${fmt(leader.changePct)}%.` : ''}`,
    })
  } else if (tool === 'getMarketBreadth' && data && typeof data === 'object') {
    const b = data as { advancing?: number; declining?: number; advPct?: number }
    const advPct = fmt(b.advPct, 1)
    out.push({
      heading: 'Breadth',
      kind: 'fact',
      body: `Advancers ${b.advancing ?? 'n/a'} vs decliners ${b.declining ?? 'n/a'}${advPct ? ` — ${advPct}% of the tape is advancing` : ''}.`,
    })
  } else if (tool === 'getConfluence' && data && typeof data === 'object') {
    const c = data as { bias?: string; score?: { balance?: number; confidence?: number } }
    out.push({
      heading: 'Confluence',
      kind: 'fact',
      body: `Overall technical bias is ${c.bias ?? 'mixed'}${c.score?.balance !== undefined ? ` (net balance ${fmt(c.score.balance, 2)})` : ''} across the evidence groups.`,
    })
  } else if (tool === 'getHistoricalValidation' && data && typeof data === 'object') {
    const h = data as { results?: Array<{ winRatePct?: number | null; sampleSize?: number; horizon?: string }> }
    const first = h.results?.[0]
    out.push({
      heading: 'Historical validation',
      kind: 'fact',
      body: `Similar historical setups ${first ? `had a ${first.winRatePct !== null && first.winRatePct !== undefined ? fmt(first.winRatePct, 1) + '%' : 'mixed'} outcome over ${first.horizon ?? 'the measured horizon'} (sample ${first.sampleSize ?? 'n/a'})` : 'could not be validated from the available history'}. Historical performance never guarantees future results.`,
    })
  } else if (tool === 'searchNews' && data && typeof data === 'object') {
    const news = data as { items?: NewsItem[] }
    const items = Array.isArray(news.items) ? news.items : []
    if (items.length === 0) {
      out.push({
        heading: 'News',
        kind: 'fact',
        body: 'No recent news coverage was found for this subject in the search window; the rest of the answer rests on the available Finova data.',
      })
    } else {
      out.push({ heading: 'News', kind: 'fact', bullets: themeLines(items, 3) })
    }
  } else if (tool === 'searchWeb' && data && typeof data === 'object') {
    const web = data as { results?: Array<{ title?: string; source?: string }> }
    const results = Array.isArray(web.results) ? web.results : []
    if (results.length === 0) {
      out.push({
        heading: 'Web evidence',
        kind: 'fact',
        body: 'The web search returned no usable results; the answer rests on the available Finova data.',
      })
    } else {
      out.push({
        heading: 'Web evidence',
        kind: 'fact',
        bullets: results.slice(0, 5).map((r) => `${r.title ?? 'Untitled'} — ${r.source ?? 'web source'}`),
      })
    }
  } else if (tool === 'getMacroContext' && data && typeof data === 'object') {
    const macro = data.macro as Array<{ label?: string; value?: string; changePct?: number; dataMode?: string }> | undefined
    if (Array.isArray(macro) && macro.length > 0) {
      const bullets = macro.map((m) => {
        const change =
          m.changePct !== undefined && m.changePct !== null
            ? ` (${m.changePct > 0 ? '+' : ''}${m.changePct.toFixed(2)}%)`
            : ''
        const mode = m.dataMode && m.dataMode !== 'synthetic-demo' ? ` [${m.dataMode}]` : ''
        return `${m.label ?? 'Indicator'}: ${m.value ?? 'n/a'}${change}${mode}`
      })
      out.push({
        heading: 'Macro context',
        kind: 'fact',
        bullets,
      })
    } else {
      out.push({
        heading: 'Macro context',
        kind: 'fact',
        body: 'No macro indicator data is available for this question.',
      })
    }
  } else {
    out.push({
      heading: natural ?? 'Evidence',
      kind: 'fact',
      body: 'Evidence for this question is summarized in the sections above.',
    })
  }

  return out
}

/**
 * Build the consolidated section list. Exact duplicates are folded, empty
 * sections are dropped, and when the SAME repeatable heading would appear
 * more than once with different content, each later occurrence is
 * disambiguated by its instrument so no fact is lost and nothing repeats
 * visually. Content is never merged blindly.
 */
function buildSections(results: ToolResult[]): SectionOut[] {
  const rendered = results.flatMap((result, index) =>
    sectionFromResult(result).map((section) => ({ section, resultIndex: index })),
  )

  const headingCounts = new Map<string, number>()
  for (const { section } of rendered) {
    if (!REPEATABLE_HEADINGS.has(section.heading)) continue
    headingCounts.set(section.heading, (headingCounts.get(section.heading) ?? 0) + 1)
  }

  const seen = new Set<string>()
  const sections: SectionOut[] = []
  for (const { section, resultIndex } of rendered) {
    const repeats = headingCounts.get(section.heading) ?? 0
    if (REPEATABLE_HEADINGS.has(section.heading) && repeats > 1 && seen.has(section.heading)) {
      const instrument = instrumentOf(results[resultIndex].data as Record<string, unknown> | null)
      sections.push(instrument ? { ...section, heading: `${section.heading} — ${instrument}` } : section)
    } else {
      if (REPEATABLE_HEADINGS.has(section.heading)) seen.add(section.heading)
      sections.push(section)
    }
  }

  const deduped = dedupeSections(sections)
  return dropEmpty(deduped)
}

function dedupeSections(sections: SectionOut[]): SectionOut[] {
  const out: SectionOut[] = []
  for (const section of sections) {
    const dupe = out.some(
      (existing) =>
        existing.heading === section.heading &&
        existing.kind === section.kind &&
        (existing.body ?? '') === (section.body ?? '') &&
        (existing.bullets ?? []).length === (section.bullets ?? []).length &&
        (existing.bullets ?? []).every((line, i) => line === (section.bullets ?? [])[i]),
    )
    if (!dupe) out.push(section)
  }
  return out
}

function dropEmpty(sections: SectionOut[]): SectionOut[] {
  return sections.filter((s) => (s.body ?? '').trim().length > 0 || (s.bullets ?? []).length > 0)
}

/** Build a valid, honest AnalystResponse from gathered evidence. */
export function synthesizeResponse(input: SynthesisInput): AnalystResponse {
  const { results, mentions, sources } = input
  const available = results.filter((r) => r.ok && r.metadata.available)
  const subject = input.subject ?? (mentions.length > 0 ? mentions[0].displayName : null)
  const warnings = [...new Set(results.flatMap((r) => r.metadata.warnings ?? []))]
  const label = input.subjectLabel ?? subject

  const sections: NonNullable<AnalystResponse['sections']> = buildSections(results)
  if (sections.length === 0) {
    sections.push({
      heading: 'Evidence',
      kind: 'inference',
      body: 'No deterministic tool produced evidence for this question with the available data.',
    })
  }

  // Phase 3N.4 — for driver questions the news is rendered as grouped,
  // per-item evidence (bearish vs bullish/price-supporting) instead of one
  // flat article list, the price read is named "Price action", and both
  // sides of a split stay visible in their own sections — never averaged.
  const driverGroups = input.catalystRelevant ? analyzeDriverEvidence(results) : null
  if (driverGroups) {
    const grouped: NonNullable<AnalystResponse['sections']> = []
    for (const section of sections) {
      if (section.heading === 'News' && (driverGroups.bear.length > 0 || driverGroups.bull.length > 0)) {
        if (driverGroups.bear.length > 0) {
          grouped.push({
            heading: 'Bearish evidence',
            kind: 'fact',
            bullets: driverGroups.bear.map((c) => `${c.source}: ${c.text}`),
          })
        }
        if (driverGroups.bull.length > 0) {
          grouped.push({
            heading: 'Bullish / price-supporting evidence',
            kind: 'fact',
            bullets: driverGroups.bull.map((c) => `${c.source}: ${c.text}`),
          })
        }
        continue
      }
      grouped.push(
        section.heading === 'Macro context' ? { ...section, heading: 'Price action' } : section,
      )
    }
    const priceActionIndex = grouped.findIndex((s) => s.heading === 'Price action')
    if (priceActionIndex > 0) {
      const [priceAction] = grouped.splice(priceActionIndex, 1)
      grouped.unshift(priceAction)
    }
    sections.length = 0
    sections.push(...grouped)
  }

  // Phase 3N.2 — genuine conflicts between evidence groups are surfaced
  // explicitly (what opposes the thesis), never averaged away.
  // Phase 3N.3 — for driver questions the retrieved catalysts are compared
  // against the measured price data as well: when the news points one way and
  // the price reads the other, that split is named too.
  const conflicts = detectConflicts(results)
  if (input.catalystRelevant) {
    conflicts.push(...detectDriverConflicts(results))
  }
  if (conflicts.length > 0) {
    sections.push({
      heading: 'Conflicting evidence',
      kind: 'inference',
      bullets: conflicts.map((c) => c.note),
    })
  }

  // Phase 3N.4 — when the reported catalysts and the measured price pull in
  // opposite directions, the answer explains WHY the two can diverge instead
  // of leaving the reader with a bare contradiction. Deterministic framing of
  // the split the evidence already shows — never an invented cause.
  if (input.catalystRelevant && detectDriverConflicts(results).length > 0) {
    const priceSign = results
      .map((r) => {
        const d = r.data as Record<string, unknown> | null
        if (!d || typeof d !== 'object') return null
        if (r.metadata.tool === 'getMacroContext') {
          const macro = d.macro as Array<{ changePct?: number }> | undefined
          const first = macro?.[0]
          if (first?.changePct === undefined || first.changePct === null) return null
          return first.changePct > 0 ? 'up' : first.changePct < 0 ? 'down' : null
        }
        return null
      })
      .find((s): s is 'up' | 'down' => s !== null)
    const uncovered =
      priceSign === 'up'
        ? 'No price-supporting catalyst is visible in the current headlines, so the rally has no confirmed driver in the news.'
        : priceSign === 'down'
          ? 'No bearish catalyst is visible in the current headlines, so the selloff has no confirmed driver in the news.'
          : null
    sections.push({
      heading: 'Why they can diverge',
      kind: 'inference',
      bullets: [
        'Headlines report the drivers under discussion (demand, supply, policy); the price reflects the level actually traded, including flows and positioning that may not be covered yet.',
        'Each signal stands on its own evidence: the news says what the stories report, the price says what the market is actually trading — neither is folded into the other.',
        ...(uncovered ? [uncovered] : []),
      ],
    })
  }

  // Phase 3O — a real temporal split between the market data and the news
  // feed is named, never hidden: these are not silently treated as one
  // current snapshot (§13, §23).
  if (input.now !== undefined) {
    const temporalNotes = detectTemporalInconsistency(results, input.now)
    if (temporalNotes.length > 0) {
      sections.push({
        heading: 'Timing of the evidence',
        kind: 'inference',
        bullets: temporalNotes,
      })
    }
  }

  // Phase 3C.1 — real web evidence: compressed citation lines in prose, full
  // sources attached as structured evidence for the UI (answer first, sources
  // subordinate). Sources already cited in the News/Web evidence sections are
  // NOT repeated in a second section — provenance stays complete without
  // duplicating facts; only sources not yet represented get a Sources section.
  const webEvidence = sources ? dedupeResults(sources).results : []
  const cited = webEvidence.length > 0 ? truncateEvidence(webEvidence).results : []
  if (cited.length > 0) {
    const alreadyShown = new Set<string>()
    for (const section of sections) {
      for (const line of section.bullets ?? []) alreadyShown.add(line)
    }
    const remaining = cited.filter((s) => ![...alreadyShown].some((line) => line.includes(s.title)))
    if (remaining.length > 0) {
      sections.push({
        heading: 'Sources',
        kind: 'fact',
        bullets: remaining.slice(0, 4).map((s) => `${s.title} — ${s.source}`),
      })
    }
  }

  // Phase 3D — honest data-coverage note when the subject has no Finova
  // deterministic source, so the synthesized answer never implies one exists.
  if (label && input.subjectCoverage === 'web-only') {
    sections.push({
      heading: 'Data coverage',
      kind: 'fact',
      body:
        webEvidence.length > 0
          ? `Finova has no deterministic data source for ${label} in this session; the evidence above comes from validated web search.`
          : `Finova has no deterministic data source for ${label} in this session, and no web evidence could be gathered.`,
    })
  }

  const findings = available.slice(0, 4).map((r) => {
    const natural = naturalHeadingForTool(r.metadata.tool) ?? 'Evidence'
    const detail = r.metadata.available
      ? r.metadata.warnings?.length
        ? sanitizeToolNames(r.metadata.warnings[0])
        : `Available evidence for this question (source: ${r.metadata.source}).`
      : 'Unavailable'
    return { kind: 'fact' as const, title: natural, detail }
  })

  const recommendations: string[] = []
  if (warnings.length > 0) recommendations.push(`Note: ${sanitizeToolNames(warnings[0])}`)
  if (conflicts.length > 0) recommendations.push('The evidence is split — weigh the conflicting signals rather than averaging them.')
  if (recommendations.length === 0) {
    const direction = available
      .map((r) => {
        const d = r.data as { trend?: { overall?: { direction?: string } } } | null
        return d?.trend?.overall?.direction ?? null
      })
      .find((d): d is string => d !== null)
    if (direction) recommendations.push(`Watch whether momentum confirms the ${direction} trend before drawing firm conclusions.`)
  }

  const followUps = followUpChips(input.followUp, label)

  // Phase 3O — thread continuity: when this turn continues the thread (a
  // "why?"/risks/drivers/opinion follow-up after the bullish Nifty read), the
  // fallback title and summary BUILD on the previous conclusion instead of
  // restarting as a fresh question — without ever faking a fresh tool run.
  const continuing = input.followUp !== undefined && input.thread != null && isContinuation(input.followUp)
  const threadConclusion = input.thread?.conclusion ?? null
  const continuedSummary =
    continuing &&
    available.length === 0 &&
    threadConclusion
      ? `Here's where ${label ?? 'the subject'} stands in this session: "${threadConclusion}". I don't have fresh tool output for this follow-up, so this continues from the evidence already gathered.`
      : null

  const driverSummary = Boolean(input.catalystRelevant)
  const headlineCount = results
    .filter((r) => r.metadata.tool === 'searchNews' && r.ok && r.metadata.available)
    .reduce((n, r) => n + ((r.data as { items?: unknown[] } | null)?.items?.length ?? 0), 0)
  logAgent({
    kind: 'synthesis',
    catalystRelevant: driverSummary,
    evidenceTools: [...new Set(results.map((r) => r.metadata.tool))],
    headlineCount,
    driverSummary,
  })

  const debateSummary = input.debate ? buildDebateSummary(label, results, driverSummary) : null

  return {
    id: `syn-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`,
    intent: 'ask',
    title: continuing
      ? label
        ? `Continuing the ${label} read`
        : 'Continuing the read'
      : label
        ? `${label} — what the available evidence shows`
        : 'What the available evidence shows',
    summary: continuedSummary ?? debateSummary ??
      (input.catalystRelevant
        ? buildDriverSummary({ label: label ?? undefined, results })
        : buildAnswerFirstSummary({ label: label ?? undefined, results })),
    sections,
    findings,
    ...(recommendations.length > 0 ? { recommendations } : {}),
    confidence: 'Low',
    followUps,
    partial: true,
    generatedAt: new Date().toISOString(),
    ...(cited.length > 0 ? { sources: cited } : {}),
  }
}

function buildDebateSummary(label: string | null, results: ToolResult[], driver: boolean): string {
  const name = label ?? 'The instrument'
  const read = results.map(directionalGroupOf).find((group): group is NonNullable<ReturnType<typeof directionalGroupOf>> => group !== null)
  const catalysts = catalystEvidence(results, 2)
  const verdict = read?.sign === 'bull' ? 'leaning bullish' : read?.sign === 'bear' ? 'leaning bearish' : 'mixed'
  const support = catalysts[0]?.text ?? (read ? `the ${read.label}` : 'the available market data')
  const risk = catalysts[1]?.text ?? 'the opposing evidence is not decisive'
  const suffix = driver && catalysts.length === 0 ? ' No reliable catalyst could be established from the available news.' : ''
  return `${name} is ${verdict} right now. The supporting case is ${support}; the main counterweight is ${risk}. The view would weaken if the opposing signal strengthens.${suffix}`
}

/**
 * Phase 3O — follow-up suggestion chips that follow the thread kind: after a
 * "why?" the natural next ask is the risk to the view, not another canned
 * "what's the technical outlook". Deterministic templates, bounded to two —
 * UI chips, never intent routing.
 */
function followUpChips(followUp: FollowUpKind | undefined, label: string | null): string[] {
  const generic = label
    ? [`What's the technical outlook for ${label}?`, `What are the key levels for ${label}?`]
    : ['What is driving the move?', 'How does this compare to the broader market?']
  const byKind: Record<string, string[]> = {
    why: ["What's the biggest risk to that view?", 'What would change the read?'],
    drivers: ['What are the risks to that move?', 'What changed since the last snapshot?'],
    risks: ['What would confirm the current read?', "What's actually driving it?"],
    opinion: ['What could invalidate that view?', "What's the evidence against it?"],
    deepen: ['What would change your mind?', 'How does this compare with the prior session?'],
    'bull-bear': ['Which side has the stronger evidence right now?'],
    'temporal-compare': ['What changed since the last snapshot?'],
    confirmed: ["What's the freshest development on this?"],
    expand: ["What's the biggest risk to that view?"],
    premise: ['What does the data actually show on that?'],
    'switch-subject': label ? [`What's the technical outlook for ${label}?`] : generic,
  }
  const chips = followUp && followUp in byKind ? byKind[followUp] : generic
  return chips.slice(0, 2)
}