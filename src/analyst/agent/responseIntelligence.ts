// ---------------------------------------------------------------------------
// Phase 3N.2 — Conversational Response Intelligence: deterministic helpers
//
// The analyst's answers must read like an analyst's answer, not like a dump
// of internal machinery. Everything here is enforced in CODE, deterministically
// and honestly:
//   - tool-name suppression: the function names the agent uses to gather
//     evidence never surface in normal prose (unless the user explicitly asks
//     "which tools did you use?", in which case provenance is the answer);
//   - section hygiene: exact-duplicate sections are folded, repeated headings
//     are detected, empty sections are dropped — never merging content blindly;
//   - conflict detection: opposite directional signals across evidence groups
//     are surfaced as conflicts, never averaged away;
//   - answer compression: the summary opens with the answer (the substance),
//     then the evidence supports it — never a meta-announcement about tools;
//   - news themes: stories are rendered as short theme lines (outlet +
//     corroboration), never as article-list dumps.
//
// Honesty rules are unchanged and inherited: this module NEVER invents values,
// URLs, dates or figures — it only re-labels, re-orders and compresses real
// evidence. Provenance remains intact whenever the user asks for it.
// ---------------------------------------------------------------------------

import type { AnalystResponse } from '../types'
import type { ToolResult } from '../tools/types'
import type { NewsItem } from '../websearch/types'

// --- Tool-name suppression ---------------------------------------------------

/**
 * Tool names that must never appear in normal analyst prose. Provenance
 * (memory fallback, "which tool showed that") lives in its own path and is
 * deliberately exempt — there the tool name IS the answer.
 */
export const SUPPRESSED_TOOL_NAMES = [
  'searchNews',
  'searchWeb',
  'getMacroContext',
  'getTechnicalAnalysis',
  'getConfluence',
  'getMarketSnapshot',
  'getMarketBreadth',
  'getHistoricalValidation',
] as const

export type SuppressedToolName = (typeof SUPPRESSED_TOOL_NAMES)[number]

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g
const escape = (s: string): string => s.replace(ESCAPE_RE, '\\$&')

/** Word-boundary pattern matching any suppressed tool name. */
export const TOOL_NAME_PATTERN = new RegExp(`\\b(${SUPPRESSED_TOOL_NAMES.map(escape).join('|')})\\b`)

/** True when the text contains a suppressed tool name as a whole word. */
export function containsToolName(text: string): boolean {
  return TOOL_NAME_PATTERN.test(text)
}

/** The first suppressed tool name found in the text, or null. */
export function firstToolName(text: string): SuppressedToolName | null {
  const m = text.match(TOOL_NAME_PATTERN)
  return m ? (m[0] as SuppressedToolName) : null
}

/** Names of every suppressed tool that appears in the text (in catalog order). */
export function toolNamesInText(text: string): SuppressedToolName[] {
  const found: SuppressedToolName[] = []
  for (const name of SUPPRESSED_TOOL_NAMES) {
    if (new RegExp(`\\b${escape(name)}\\b`).test(text)) found.push(name)
  }
  return found
}

/**
 * Replace suppressed tool names in untrusted/verbose text (e.g. metadata
 * warnings) with their natural analyst labels. Non-matching tool names fall
 * back to "the data layer". Used so machinery never leaks into prose even
 * when the underlying evidence message contained it.
 */
export function sanitizeToolNames(text: string): string {
  return text.replace(TOOL_NAME_PATTERN, (match) => naturalHeadingForTool(match) ?? 'the data layer')
}

/**
 * The natural prose label a tool's evidence earns. This is the ONLY place
 * tool names are translated into analyst vocabulary; consumers call it
 * instead of ever writing a tool name into a heading or finding.
 */
export function naturalHeadingForTool(tool: string): string | null {
  switch (tool) {
    case 'getTechnicalAnalysis':
      return 'Technical picture'
    case 'getMarketSnapshot':
      return 'Market snapshot'
    case 'getMarketBreadth':
      return 'Breadth'
    case 'getConfluence':
      return 'Confluence'
    case 'getHistoricalValidation':
      return 'Historical validation'
    case 'getMacroContext':
      return 'Macro context'
    case 'searchNews':
      return 'News'
    case 'searchWeb':
      return 'Web evidence'
    default:
      return null
  }
}

/**
 * Render a tool result into a bounded NATURAL sentence for conversation
 * memory. Raw tool JSON is never stored or shown to the user — the note is
 * what the recap ("What did you say about X?") quotes. Unknown shapes fall
 * back to a neutral count statement, never a JSON dump.
 */
export function naturalToolNote(tool: string, data: unknown): string {
  if (data === null || data === undefined) return 'no data produced'
  const heading = naturalHeadingForTool(tool) ?? 'data'

  const asRecord = (v: unknown): Record<string, unknown> | null =>
    typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  const asArray = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null)

  const pickString = (v: unknown): string | null => {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
    return null
  }

  const quoteList = (items: unknown[], max: number): string | null => {
    const titles = items.map((it) => pickString(asRecord(it)?.title)).filter((t): t is string => t !== null)
    if (titles.length === 0) return null
    const shown = titles.slice(0, max)
    const more = titles.length > max ? `, and ${titles.length - max} more` : ''
    return `"${shown.join('", "')}"${more}`
  }

  const instrumentList = (items: unknown[], max: number): string | null => {
    const rendered: string[] = []
    for (const it of items.slice(0, max)) {
      const rec = asRecord(it)
      if (!rec) continue
      const label = pickString(rec.label) ?? pickString(rec.name)
      const value = pickString(rec.value)
      const pct = typeof rec.changePct === 'number' ? rec.changePct : null
      if (label && value) rendered.push(pct !== null ? `${label}: ${value} (${pct >= 0 ? '+' : ''}${pct}%)` : `${label}: ${value}`)
    }
    if (rendered.length === 0) return null
    return rendered.join('; ')
  }

  const array = asArray(data)
  if (array !== null) {
    const quoted = quoteList(array, 3)
    if (quoted) return `${heading}: ${quoted}`
    const instruments = instrumentList(array, 3)
    if (instruments) return `${heading}: ${instruments}`
    return `${heading}: ${array.length} ${array.length === 1 ? 'result' : 'results'}`
  }

  const record = asRecord(data)
  if (!record) return `${heading}: returned data`

  if (Array.isArray(record.items)) {
    const quoted = quoteList(record.items, 3)
    if (quoted) return `${heading}: ${quoted}`
  }
  if (Array.isArray(record.results)) {
    const quoted = quoteList(record.results, 3)
    if (quoted) return `${heading}: ${quoted}`
  }
  if (Array.isArray(record.macro)) {
    const instruments = instrumentList(record.macro, 3)
    if (instruments) return `${heading}: ${instruments}`
  }
  if (Array.isArray(record.instruments)) {
    const instruments = instrumentList(record.instruments, 3)
    if (instruments) return `${heading}: ${instruments}`
  }
  if (Array.isArray(record.indices)) {
    const instruments = instrumentList(record.indices, 3)
    if (instruments) return `${heading}: ${instruments}`
  }

  const trend = asRecord(record.trend)
  const overall = trend ? asRecord(trend.overall) : null
  const price = asRecord(record.price)
  if (overall && pickString(overall.direction)) {
    const direction = pickString(overall.direction) ?? 'mixed'
    const strength = typeof overall.strength === 'number' ? `, strength ${overall.strength}` : ''
    const current = price && pickString(price.current)
    const pct = price && typeof price.changePercent === 'number' ? price.changePercent : null
    const priceNote = current !== null && current !== undefined
      ? ` at ${current}${pct !== null ? ` (${pct >= 0 ? '+' : ''}${pct}%)` : ''}`
      : ''
    return `${heading}: ${direction} trend${strength}${priceNote}`
  }

  const signals = asArray(record.signals)
  if (signals !== null) return `${heading}: ${signals.length} ${signals.length === 1 ? 'signal' : 'signals'}`
  const patterns = asArray(record.patterns)
  if (patterns !== null) return `${heading}: ${patterns.length} ${patterns.length === 1 ? 'pattern' : 'patterns'}`
  const divergences = asArray(record.divergences)
  if (divergences !== null) return `${heading}: ${divergences.length} ${divergences.length === 1 ? 'divergence' : 'divergences'}`
  const breakouts = asArray(record.breakouts)
  if (breakouts !== null) return `${heading}: ${breakouts.length} ${breakouts.length === 1 ? 'breakout' : 'breakouts'}`
  const comparisons = asArray(record.comparison)
  if (comparisons !== null) return `${heading}: ${comparisons.length} ${comparisons.length === 1 ? 'comparison' : 'comparisons'}`

  const summary = pickString(record.summary) ?? pickString(record.conclusion)
  if (summary) return `${heading}: ${summary}`

  const keys = Object.keys(record).filter((k) => /^[a-z][a-zA-Z0-9]{0,24}$/.test(k) && !/^(generatedAt|query|region|truncated|totalItems|relevantFiltered|provider)$/.test(k))
  return `${heading}: ${keys.length} ${keys.length === 1 ? 'field' : 'fields'}`
}

// --- Section hygiene ---------------------------------------------------------

export interface SectionLike {
  heading: string
  kind?: string
  body?: string
  bullets?: string[]
}

/** True when two sections carry the same heading, kind and identical content. */
export function isExactDuplicateSection(a: SectionLike, b: SectionLike): boolean {
  if (a.heading !== b.heading || a.kind !== b.kind) return false
  if ((a.body ?? '') !== (b.body ?? '')) return false
  const ab = a.bullets ?? []
  const bb = b.bullets ?? []
  if (ab.length !== bb.length) return false
  return ab.every((line, i) => line === bb[i])
}

/**
 * Fold exact-duplicate sections into the first occurrence. First wins; the
 * duplicate is dropped. Content is NEVER merged blindly — only byte-identical
 * sections are considered duplicates, so no fact is ever lost.
 */
export function dedupeSections<T extends SectionLike>(sections: T[]): T[] {
  const out: T[] = []
  for (const section of sections) {
    const dupe = out.some((existing) => isExactDuplicateSection(existing, section))
    if (!dupe) out.push(section)
  }
  return out
}

/** True when two or more sections share a heading (visual repetition signal). */
export function hasRepeatedHeadings(sections: SectionLike[]): boolean {
  const seen = new Set<string>()
  for (const section of sections) {
    if (seen.has(section.heading)) return true
    seen.add(section.heading)
  }
  return false
}

/** Drop sections that carry no content at all (no body and no bullets). */
export function dropEmptySections<T extends SectionLike>(sections: T[]): T[] {
  return sections.filter((s) => (s.body ?? '').trim().length > 0 || (s.bullets ?? []).length > 0)
}

/** True when the same caveat sentence is repeated across texts (repetition). */
export function repeatedCaveats(texts: string[]): string[] {
  const counts = new Map<string, number>()
  for (const text of texts) {
    const key = text.replace(/\s+/g, ' ').trim().toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([key]) => key)
}

// --- Conflict detection ------------------------------------------------------

type DirectionSign = 'bull' | 'bear' | 'mixed' | null

const BULL_WORDS = ['bullish', 'up', 'positive', 'strong', 'risk-on']
const BEAR_WORDS = ['bearish', 'down', 'negative', 'weak', 'risk-off']
const MIXED_WORDS = ['mixed', 'neutral', 'flat', 'sideways', 'range']

/** Map a directional string from tool evidence to a sign. Never invents. */
export function directionalSign(value: unknown): DirectionSign {
  if (typeof value !== 'string') return null
  const v = value.toLowerCase()
  if (BULL_WORDS.includes(v)) return 'bull'
  if (BEAR_WORDS.includes(v)) return 'bear'
  if (MIXED_WORDS.includes(v)) return 'mixed'
  return null
}

export interface EvidenceConflict {
  /** The evidence groups that oppose each other, in analyst vocabulary. */
  between: string
  /** Human-readable, honest statement of the split. */
  note: string
}

interface DirectionalGroup {
  label: string
  sign: DirectionSign
}

/**
 * Pull one directional signal out of an available tool result, labeled with
 * analyst vocabulary (never the tool's function name). Returns null when the
 * result carries no directional signal.
 */
export function directionalGroupOf(result: ToolResult): DirectionalGroup | null {
  if (!result.ok || !result.metadata.available) return null
  const data = result.data as Record<string, unknown> | null
  if (!data || typeof data !== 'object') return null

  const tool = result.metadata.tool
  if (tool === 'getTechnicalAnalysis') {
    const trend = data.trend as { overall?: { direction?: string } } | undefined
    const sign = directionalSign(trend?.overall?.direction)
    if (sign) return { label: 'technical picture', sign }
  } else if (tool === 'getConfluence') {
    const c = data as { bias?: string }
    const sign = directionalSign(c.bias)
    if (sign) return { label: 'confluence', sign }
  } else if (tool === 'getMarketSnapshot') {
    const regime = typeof data.regime === 'string' ? data.regime : undefined
    const sign = directionalSign(regime)
    if (sign) return { label: 'market regime', sign }
  } else if (tool === 'getMarketBreadth') {
    const b = data as { advPct?: number }
    const sign = b.advPct !== undefined ? (b.advPct >= 50 ? 'bull' : 'bear') : null
    if (sign) return { label: 'breadth', sign }
  } else if (tool === 'getMacroContext') {
    const macro = data.macro as Array<{ changePct?: number }> | undefined
    if (Array.isArray(macro) && macro.length > 0) {
      const first = macro[0]
      const sign =
        first.changePct === undefined || first.changePct === null
          ? null
          : first.changePct > 0
            ? 'bull'
            : first.changePct < 0
              ? 'bear'
              : 'mixed'
      if (sign) return { label: 'macro', sign }
    }
  }
  return null
}

/**
 * Detect genuine conflicts between directional evidence groups. Opposite
 * signs (bull vs bear) surface as conflicts; 'mixed' signals never count as
 * either side and are never averaged away. Deterministic and honest — this
 * only names splits that really exist in the evidence.
 */
export function detectConflicts(results: ToolResult[]): EvidenceConflict[] {
  const groups = results
    .map(directionalGroupOf)
    .filter((g): g is DirectionalGroup => g !== null && g.sign !== null)

  const conflicts: EvidenceConflict[] = []
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const a = groups[i]
      const b = groups[j]
      if (a.sign === 'bull' && b.sign === 'bear') {
        conflicts.push({
          between: `${a.label} and ${b.label}`,
          note: `the ${a.label} reads bullish while the ${b.label} reads bearish — the evidence is split, not unanimous.`,
        })
      } else if (a.sign === 'bear' && b.sign === 'bull') {
        conflicts.push({
          between: `${a.label} and ${b.label}`,
          note: `the ${a.label} reads bearish while the ${b.label} reads bullish — the evidence is split, not unanimous.`,
        })
      }
    }
  }
  return conflicts
}

// --- News themes -------------------------------------------------------------

export interface NewsTheme {
  headline: string
  outlet: string
  corroboratedBy: number
  freshness: string
}

/**
 * Compress real news items into short theme lines. Every field comes from
 * the real, validated item (headline, hostname, corroboration, freshness
 * tier) — nothing is invented. This is the deterministic counterpart of the
 * prompt's "synthesize stories into themes, never dump articles".
 */
export function newsThemes(items: NewsItem[], limit = 3): NewsTheme[] {
  return items.slice(0, limit).map((item) => ({
    headline: item.title,
    outlet: item.source,
    corroboratedBy: item.corroboratedBy ?? 1,
    freshness: item.freshness,
  }))
}

/** One prose line per theme: outlet + headline + corroboration, no URLs. */
export function themeLines(items: NewsItem[], limit = 3): string[] {
  return newsThemes(items, limit).map((t) => {
    const corroborated = t.corroboratedBy >= 2 ? ` — reported by ${t.corroboratedBy} outlets` : ''
    return `${t.outlet}: ${t.headline}${corroborated}`
  })
}

// --- Answer compression ------------------------------------------------------

export interface AnswerSummaryInput {
  label?: string
  results: ToolResult[]
}

function syntheticDataCaveat(results: ToolResult[]): string {
  return results.some((r) => r.ok && r.metadata.available && r.metadata.dataMode === 'synthetic-demo')
    ? ' This is Finova demo data, not a live market quote.'
    : ''
}

/**
 * The deterministic price/level read sentence ("Nifty 50's overall trend is
 * bullish (strength 74.0), trading at 24816 (+0.25% on the day), based on the
 * available market data"), or null when no numeric evidence exists. Built ONLY
 * from real tool output.
 */
function deterministicRead(input: AnswerSummaryInput): string | null {
  const label = input.label?.trim() ? input.label.trim() : null
  const available = input.results.filter((r) => r.ok && r.metadata.available)
  const named = label ? `${label}'s` : "The"

  for (const result of available) {
    const data = result.data as Record<string, unknown> | null
    if (!data || typeof data !== 'object') continue

    if (result.metadata.tool === 'getTechnicalAnalysis') {
      const trend = data.trend as { overall?: { direction?: string; strength?: number } } | undefined
      const price = data.price as { current?: number; changePercent?: number | null } | undefined
      const direction = trend?.overall?.direction
      if (direction) {
        const strength =
          trend.overall?.strength !== undefined && Number.isFinite(trend.overall.strength)
            ? ` (strength ${trend.overall.strength.toFixed(1)})`
            : ''
        const level =
          price?.current !== undefined && Number.isFinite(price.current)
            ? price.changePercent !== undefined && price.changePercent !== null
              ? `, trading at ${price.current} (${price.changePercent > 0 ? '+' : ''}${price.changePercent.toFixed(2)}% on the day)`
              : `, trading at ${price.current}`
            : ''
        return `${named} overall trend is ${direction}${strength}${level}, based on the available market data.`
      }
      const bias = (data.momentum as { bias?: string } | undefined)?.bias
      if (bias) return `${label ?? 'The instrument'} is currently showing a ${bias} bias, based on the available market data.`
    }

    if (result.metadata.tool === 'getMacroContext') {
      const macro = data.macro as Array<{ label?: string; value?: string; changePct?: number }> | undefined
      if (Array.isArray(macro) && macro.length > 0) {
        const first = macro[0]
        if (first.value !== undefined) {
          const change =
            first.changePct !== undefined && first.changePct !== null
              ? `, ${first.changePct > 0 ? '+' : ''}${first.changePct.toFixed(2)}% on the day`
              : ''
          return `${first.label ?? label ?? 'The indicator'} is at ${first.value}${change}, based on the available market data.`
        }
      }
    }

    if (result.metadata.tool === 'getMarketSnapshot') {
      const regime = typeof data.regime === 'string' ? data.regime : undefined
      if (regime) return `${label ?? 'The market'} is in a ${regime} regime, based on the available market data.`
    }
  }

  return null
}

/**
 * The answer-first opening line: the substance up front, then (honestly)
 * "based on the available market data". Built ONLY from real tool output —
 * when no numeric evidence exists it stays qualitative and honest, exactly
 * like a colleague would: a direction from the evidence, never a guess.
 */
export function buildAnswerFirstSummary(input: AnswerSummaryInput): string {
  const read = deterministicRead(input)
  if (read) return `${read}${syntheticDataCaveat(input.results)}`
  const label = input.label?.trim() ? input.label.trim() : null
  return label
    ? `${label} — here's what the available market data shows.`
    : 'Here is what the available market data shows.'
}

// --- Phase 3N.3 — catalyst synthesis (market-driver questions) ----------------

export interface CatalystEvidence {
  /** A real statement from a validated news/web item (snippet or title). */
  text: string
  /** The outlet or web source that reported it. */
  source: string
}

/**
 * Real catalyst statements pulled from retrieved news/web evidence. Every
 * string is a citation of a validated item's HEADLINE (outlet + story title) —
 * the same news-theme pattern the News section uses. Snippets are deliberately
 * NOT quoted: retrieved text is untrusted data, and a headline citation cannot
 * amplify an injected instruction the way a verbatim snippet could. Bounded to
 * the first few so the summary stays a summary.
 */
export function catalystEvidence(results: ToolResult[], limit = 3): CatalystEvidence[] {
  const out: CatalystEvidence[] = []
  for (const r of results) {
    if (!r.ok || !r.metadata.available) continue
    const data = r.data as Record<string, unknown> | null
    if (!data || typeof data !== 'object') continue
    if (r.metadata.tool === 'searchNews') {
      const items = data.items as NewsItem[] | undefined
      for (const it of items ?? []) {
        const headline = (it.title ?? '').trim()
        if (headline) out.push({ text: headline.slice(0, 140), source: it.source })
      }
    } else if (r.metadata.tool === 'searchWeb') {
      const web = data.results as Array<{ title?: string; source?: string }> | undefined
      for (const it of web ?? []) {
        const headline = (it.title ?? '').trim()
        if (headline) out.push({ text: headline.slice(0, 140), source: it.source ?? 'web source' })
      }
    }
    if (out.length >= limit) break
  }
  return out
}

/**
 * Per-side catalyst evidence for one driver question: every retrieved story is
 * classified (title+snippet word counts) into bearish or bullish/price-
 * supporting evidence. Both sides are kept SEPARATE — never averaged, never
 * merged — so the synthesis can name the split honestly. Neutral items are
 * not included in either side. Bounded to the first few per side.
 */
export interface DriverEvidenceAnalysis {
  bear: CatalystEvidence[]
  bull: CatalystEvidence[]
}

export function analyzeDriverEvidence(results: ToolResult[], limit = 3): DriverEvidenceAnalysis {
  const bear: CatalystEvidence[] = []
  const bull: CatalystEvidence[] = []
  for (const r of results) {
    if (!r.ok || !r.metadata.available) continue
    const data = r.data as Record<string, unknown> | null
    if (!data || typeof data !== 'object') continue
    let items: Array<{ title?: string; snippet?: string; source?: string }> = []
    if (r.metadata.tool === 'searchNews') {
      items = (data.items as Array<{ title?: string; snippet?: string; source?: string }> | undefined) ?? []
    } else if (r.metadata.tool === 'searchWeb') {
      items = (data.results as Array<{ title?: string; snippet?: string; source?: string }> | undefined) ?? []
    }
    for (const it of items) {
      const direction = classifyNewsItem(it)
      const headline = (it.title ?? '').trim().slice(0, 140)
      if (!headline) continue
      const citation: CatalystEvidence = { text: headline, source: it.source ?? 'web source' }
      if (direction === 'bear' && bear.length < limit) bear.push(citation)
      else if (direction === 'bull' && bull.length < limit) bull.push(citation)
      if (bear.length >= limit && bull.length >= limit) return { bear, bull }
    }
  }
  return { bear, bull }
}

/**
 * Driver-aware answer opening. A driver question ("what is happening with X",
 * "why is X moving", "what is driving X", "is X bullish/bearish") is NEVER
 * answered by price levels alone: when the news/web evidence establishes a
 * catalyst, the summary leads with it and then gives the measured levels;
 * when none can be established, that is said explicitly — a driver is never
 * invented. When the reported catalysts and the measured price pull in
 * OPPOSITE directions, the summary names the split, explains why the two can
 * diverge, and closes with an honest verdict — the signals are kept separate,
 * never averaged.
 */
export function buildDriverSummary(input: AnswerSummaryInput): string {
  const label = input.label?.trim() ? input.label.trim() : null
  const named = label ?? 'the instrument'
  const catalysts = catalystEvidence(input.results)
  const read = deterministicRead(input)
  const conflicts = detectDriverConflicts(input.results)

  if (catalysts.length > 0) {
    const lead = `What's moving ${named} now: ${catalysts[0].text} (${catalysts[0].source}).`
    if (conflicts.length > 0) {
      const analysis = analyzeDriverEvidence(input.results)
      const priceSign = input.results
        .map(directionalGroupOf)
        .filter((g): g is DirectionalGroup => g !== null && g.sign !== null)[0]?.sign
      const priceDir = priceSign === 'bull' ? 'up' : 'down'
      const newsDir = newsDirectionalSign(input.results) === 'bear' ? 'lower' : 'higher'
      const bearish = analysis.bear.length
      const supportive = analysis.bull.length
      const supported =
        priceSign === 'bull'
          ? 'no price-supporting catalyst is visible in the current headlines'
          : 'no bearish catalyst is visible in the current headlines'
      const readLine = read ? `${read} — ` : ''
      const splitLine =
        `${readLine}the reported stories point ${newsDir} (${bearish} bearish, ${supportive} price-supporting), ` +
        `so the headline narrative and the price action are pulling in opposite directions. ` +
        `That can happen when headlines report the drivers under discussion while the price also reflects ` +
        `flows and positioning not yet covered by the news — ${supported}. ` +
        `Verdict: the measured move is ${priceDir} while the reported catalysts point ${newsDir}; ` +
        `the signals are kept separate, never averaged — driver confidence is Low until the news turns ` +
        `or a confirmed catalyst appears.`
      return `${lead} ${splitLine}`
    }
    return read ? `${lead} ${read}${syntheticDataCaveat(input.results)}` : lead
  }
  if (read) {
    return `No reliable catalyst could be established for ${named} from the available news or web evidence. ${read} — that is a price read from the market data, not a confirmed driver.${syntheticDataCaveat(input.results)}`
  }
  return `No reliable catalyst could be established for ${named} from the available news or web evidence, and no price read is available either.`
}

/** Add a plain-language provenance caveat when deterministic demo data was used. */
export function annotateSyntheticData(response: AnalystResponse, results: ToolResult[]): AnalystResponse {
  const hasSynthetic = results.some((r) => r.ok && r.metadata.available && r.metadata.dataMode === 'synthetic-demo')
  if (!hasSynthetic) return response
  const caveat = 'This uses Finova demo data, not a live market quote.'
  const add = (text: string | undefined): string | undefined => {
    if (!text || /demo data|live market quote/i.test(text)) return text
    return `${text} ${caveat}`
  }
  return { ...response, ...(add(response.answer) ? { answer: add(response.answer) } : {}), ...(add(response.summary) ? { summary: add(response.summary) } : {}) }
}

// --- Phase 3N.3 — catalyst-vs-price conflict detection ------------------------

const NEWS_BULL_WORDS = ['rally', 'rallies', 'rallied', 'surge', 'surges', 'surged', 'gains', 'gained', 'climbs', 'climbed', 'advances', 'advanced', 'higher', 'bullish', 'buying', 'inflows', 'soars', 'soared', 'jumps', 'jumped', 'rebound', 'rebounds', 'rebounded', 'rose', 'rises', 'rising', 'strength', 'strong']
const NEWS_BEAR_WORDS = ['slide', 'slides', 'slipped', 'fall', 'falls', 'fell', 'fallen', 'declines', 'declined', 'drops', 'dropped', 'losses', 'lower', 'bearish', 'selling', 'outflows', 'profit booking', 'tumbles', 'tumbled', 'plunge', 'plunges', 'plunged', 'weakened', 'weak', 'weaker', 'selloff', 'sell-off']

const NEWS_BULL_RE = new RegExp(`\\b(?:${NEWS_BULL_WORDS.map(escape).join('|')})\\b`, 'gi')
const NEWS_BEAR_RE = new RegExp(`\\b(?:${NEWS_BEAR_WORDS.map(escape).join('|')})\\b`, 'gi')

/**
 * The directional sign one news item reports (bull or bear), counted over its
 * real title+snippet words. Snippet text is used ONLY for this deterministic
 * word count — it is never quoted into output (untrusted data). Neutral when
 * the item carries no clear direction.
 */
export function classifyNewsItem(item: { title?: string; snippet?: string }): 'bull' | 'bear' | 'neutral' {
  const text = `${item.title ?? ''} ${item.snippet ?? ''}`.toLowerCase()
  const bull = text.match(NEWS_BULL_RE)?.length ?? 0
  const bear = text.match(NEWS_BEAR_RE)?.length ?? 0
  if (bull === bear) return 'neutral'
  return bull > bear ? 'bull' : 'bear'
}

/**
 * The directional sign the retrieved news actually reports (bull or bear),
 * from the real title+snippet words of the first news items. Deterministic and
 * honest — it only counts what the headlines say. Null when the news carries
 * no clear direction.
 */
export function newsDirectionalSign(results: ToolResult[]): DirectionSign {
  for (const r of results) {
    if (!r.ok || !r.metadata.available || r.metadata.tool !== 'searchNews') continue
    const data = r.data as { items?: NewsItem[] } | null
    for (const it of data?.items ?? []) {
      const text = `${it.title} ${it.snippet ?? ''}`.toLowerCase()
      let bull = 0
      let bear = 0
      for (const w of NEWS_BULL_WORDS) if (text.includes(w)) bull += 1
      for (const w of NEWS_BEAR_WORDS) if (text.includes(w)) bear += 1
      if (bull !== bear) return bull > bear ? 'bull' : 'bear'
    }
  }
  return null
}

/**
 * Driver-question conflict: when the news reports catalysts pointing one way
 * while the measured market data reads the other, the split is surfaced —
 * never averaged into a single neutral claim, never hidden.
 */
export function detectDriverConflicts(results: ToolResult[]): EvidenceConflict[] {
  const news = newsDirectionalSign(results)
  if (!news) return []
  const price = results
    .map(directionalGroupOf)
    .filter((g): g is DirectionalGroup => g !== null && g.sign !== null)[0]?.sign
  if (!price || price === 'mixed' || price === news) return []
  return [
    {
      between: 'news and the measured data',
      note: `the news points ${news === 'bull' ? 'higher' : 'lower'} while the measured data reads ${price === 'bull' ? 'higher' : 'lower'} — the reported catalysts and the price data are pulling in opposite directions.`,
    },
  ]
}

// --- Response refinement -----------------------------------------------------

export interface RefineOptions {
  /** Section headings that exactly match a suppressed tool name. */
  renameToolHeadings?: boolean
  /** Fold byte-identical duplicate sections. */
  dedupe?: boolean
  /** Drop sections with no content. */
  dropEmpty?: boolean
}

const DEFAULT_REFINE: Required<RefineOptions> = {
  renameToolHeadings: true,
  dedupe: true,
  dropEmpty: true,
}

/**
 * Deterministic, non-destructive hygiene pass over a FINAL AnalystResponse
 * (LLM path or deterministic synthesis): raw tool names never survive in
 * headings, exact duplicates are folded, empty sections are dropped. Facts
 * and structure are preserved — only presentation is corrected. Applied
 * AFTER validation, so it can never weaken the structured-output contract.
 */
export function refineResponse(response: AnalystResponse, options: RefineOptions = {}): AnalystResponse {
  const opts: Required<RefineOptions> = { ...DEFAULT_REFINE, ...options }
  if (!response.sections) return response

  let sections = response.sections

  if (opts.renameToolHeadings) {
    sections = sections.map((section) => {
      const natural = naturalHeadingForTool(section.heading.trim())
      return natural ? { ...section, heading: natural } : section
    })
  }
  if (opts.dropEmpty) sections = dropEmptySections(sections)
  if (opts.dedupe) sections = dedupeSections(sections)

  const original = response.sections
  const changed =
    sections.length !== original.length ||
    sections.some((s, i) => !isSameSection(s, original[i]))
  if (!changed) return response
  return { ...response, sections }
}

function isSameSection(
  a: NonNullable<AnalystResponse['sections']>[number],
  b: NonNullable<AnalystResponse['sections']>[number],
): boolean {
  if (a.heading !== b.heading || a.kind !== b.kind || (a.body ?? '') !== (b.body ?? '')) return false
  const ab = a.bullets ?? []
  const bb = b.bullets ?? []
  return ab.length === bb.length && ab.every((line, i) => line === bb[i])
}

// --- Phase 3O — temporal consistency (§13, §23) ------------------------------

/**
 * Detect a real temporal mismatch between the market evidence and the news
 * feed. Only fires when BOTH sides exist and their ages genuinely diverge
 * (fresh market data paired with multi-day-old news, or the reverse). The
 * note is honest and deterministic — it never fabricates timestamps, it only
 * reports the gap the real data already shows. Never hides a temporal split.
 */
export function detectTemporalInconsistency(results: ToolResult[], now: number): string[] {
  const MARKET_FRESH_MS = 15 * 60_000
  const NEWS_DAY_MS = 24 * 60 * 60_000
  const notes: string[] = []
  const marketAges: number[] = []
  const newsAges: Array<{ age: number; date: string }> = []

  for (const r of results) {
    if (!r.ok || !r.metadata.available) continue
    if (r.metadata.tool === 'searchNews') {
      const items = (r.data as { items?: NewsItem[] } | null)?.items
      for (const item of items ?? []) {
        if (item.publishedAt) {
          const t = Date.parse(item.publishedAt)
          if (Number.isFinite(t)) {
            const age = Math.max(0, now - t)
            newsAges.push({ age, date: item.publishedAt.slice(0, 10) })
          }
        }
      }
    } else if (typeof r.metadata.timestamp === 'string') {
      const t = Date.parse(r.metadata.timestamp)
      if (Number.isFinite(t)) marketAges.push(Math.max(0, now - t))
    }
  }

  if (marketAges.length > 0 && newsAges.length > 0) {
    const marketFresh = marketAges.every((a) => a <= MARKET_FRESH_MS)
    const newsStale = newsAges.some((n) => n.age > NEWS_DAY_MS)
    const marketStale = marketAges.every((a) => a > MARKET_FRESH_MS)
    const newsFresh = newsAges.some((n) => n.age <= NEWS_DAY_MS)

    if (marketFresh && newsStale) {
      const oldest = newsAges.filter((n) => n.age > NEWS_DAY_MS).sort((a, b) => b.age - a.age)[0]
      notes.push(
        `The price data and the news feed are timestamped differently — the news is dated ${oldest.date}, while the market data is current. I'd be careful about treating them as one current snapshot.`,
      )
    } else if (marketStale && newsFresh) {
      notes.push(
        'The market data in this session is not current while the news is — the numbers and the news may not describe the same market state.',
      )
    }
  }

  return notes.slice(0, 2)
}

// --- Phase 3O — cross-turn repetition (§6) -----------------------------------

const WORD_RE = /[a-z0-9']+/g

function tokenBigrams(text: string): Set<string> {
  const words = text.toLowerCase().match(WORD_RE) ?? []
  const meaningful = words.filter((w) => w.length > 1)
  const out = new Set<string>()
  for (let i = 0; i < meaningful.length - 1; i += 1) out.add(`${meaningful[i]} ${meaningful[i + 1]}`)
  return out
}

/** Bigram-overlap score in [0,1] between two texts (0 = nothing shared). */
export function overlapScore(a: string, b: string): number {
  const A = tokenBigrams(a)
  const B = tokenBigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let common = 0
  for (const t of A) if (B.has(t)) common += 1
  const union = A.size + B.size - common
  return union === 0 ? 0 : common / union
}

const REPETITION_THRESHOLD = 0.55

/**
 * Detect whether a summary restates a prior conclusion instead of adding to
 * it. Returns the most similar prior summary and its overlap score when it
 * clears the threshold — the signal the no-repeat guard and the audit gate
 * use. Deterministic; short summaries with nothing shared score 0.
 */
export function detectRepetition(summary: string, priorSummaries: string[]): { prior: string; score: number } | null {
  let best: { prior: string; score: number } | null = null
  for (const prior of priorSummaries) {
    const score = overlapScore(summary, prior)
    if (score >= REPETITION_THRESHOLD && (best === null || score > best.score)) {
      best = { prior, score }
    }
  }
  return best
}

// --- Phase 3O — quality gate (§27) -------------------------------------------

/** Canned closing phrases the analyst must never use (answered, then stop). */
export const CANNED_CLOSERS = [
  'would you like me to',
  'is there anything else i can help',
  'let me know if you have any further questions',
  'please let me know if you have any',
  'do you have any other questions',
  'feel free to ask',
  'happy to help',
  'is there anything else',
] as const

/** Meta/machinery openers that announce the reasoning machinery, not the answer. */
export const META_OPENERS = [
  'here is the market snapshot',
  'here is technical analysis',
  'here is confluence',
  'here are tool results',
  'here are the recommendations',
  "here's what i found",
  'based on the available evidence gathered in this session',
  'here is a deterministic read',
  'according to the conversation context',
  'tool results indicate',
  'the analyst tool returned',
  'evidence captured',
  'in conclusion',
  'in summary',
] as const

/** Canned closers found verbatim (lowercased) anywhere in the text. */
export function findCannedClosers(text: string): string[] {
  const lower = text.toLowerCase().replace(/\s+/g, ' ')
  const matched = CANNED_CLOSERS.filter((c) => lower.includes(c))
  // Drop closers that are substrings of a longer matched closer — one answer
  // with "is there anything else I can help with?" reports one closer, not two.
  return matched.filter((m, i) => !matched.some((other, j) => j !== i && other.includes(m)))
}

/** Meta/machinery openers found in the summary (the answer's opening line). */
export function findMetaOpeners(summary: string): string[] {
  const lower = summary.toLowerCase().replace(/\s+/g, ' ')
  return META_OPENERS.filter((m) => lower.includes(m))
}

export type QualityIssueId =
  | 'no-summary'
  | 'meta-opener'
  | 'canned-closer'
  | 'tool-name'
  | 'repeated-heading'
  | 'empty-section'
  | 'repetition'
  | 'sources-missing'

export interface QualityIssue {
  id: QualityIssueId
  note: string
}

export interface AuditOptions {
  /** Prior summaries to check the response against for cross-turn repetition. */
  priorSummaries?: string[]
  /** True when validated web evidence existed this session (sources expected). */
  sourcesExpected?: boolean
}

/**
 * The deterministic half of the §27 response quality gate. The LLM does the
 * semantic checks (answered the actual question, used the strongest evidence,
 * distinguished fact from inference); this gate enforces what code can
 * verify: the answer opens on substance, never on machinery; tool names,
 * canned closers, repeated headings and empty sections are absent; the
 * response adds to — not restates — prior conclusions; provenance survives.
 * Pure and non-destructive: it reports issues, it does not rewrite (the
 * rewrite/refine pass lives in refineResponse and the synthesis path).
 */
export function auditResponse(response: AnalystResponse, options: AuditOptions = {}): QualityIssue[] {
  const issues: QualityIssue[] = []
  const summary = response.summary ?? ''
  const sectionText = (response.sections ?? []).map((s) => s.body ?? '').concat(
    (response.sections ?? []).flatMap((s) => s.bullets ?? []),
  ).join(' ')
  const allText = [summary, response.title ?? '', sectionText].join(' ')

  if (!summary.trim()) issues.push({ id: 'no-summary', note: 'The answer has no summary — there is no opening answer.' })

  for (const m of findMetaOpeners(summary)) {
    issues.push({ id: 'meta-opener', note: `The summary opens on machinery, not the answer: "${m}".` })
  }

  for (const c of findCannedClosers(allText)) {
    issues.push({ id: 'canned-closer', note: `A canned closer appeared: "${c}". Answer, then stop.` })
  }

  for (const t of toolNamesInText(allText)) {
    issues.push({ id: 'tool-name', note: `A tool name surfaced in prose: "${t}".` })
  }

  if (response.sections && hasRepeatedHeadings(response.sections)) {
    issues.push({ id: 'repeated-heading', note: 'Two or more sections share a heading — consolidate or disambiguate.' })
  }

  if (response.sections) {
    for (const s of response.sections) {
      if (!(s.body ?? '').trim() && (s.bullets ?? []).length === 0) {
        issues.push({ id: 'empty-section', note: `Section "${s.heading}" has no content.` })
      }
    }
  }

  if (options.priorSummaries && options.priorSummaries.length > 0 && summary) {
    const rep = detectRepetition(summary, options.priorSummaries)
    if (rep) {
      issues.push({ id: 'repetition', note: `The summary restates a prior conclusion (${Math.round(rep.score * 100)}% overlap). Add information instead.` })
    }
  }

  if (options.sourcesExpected && !(response.sources?.length) && !(response.sections ?? []).some((s) => ['News', 'Web evidence', 'Sources'].includes(s.heading))) {
    issues.push({ id: 'sources-missing', note: 'Web evidence existed this session but is not attached or cited.' })
  }

  return issues
}

// --- Phase 3N.4 — final output hygiene (internal markers never reach the UI) ---

/**
 * Internal/debug markers that must never appear in user-facing output, no
 * matter which path produced it (LLM echo, fallback templates, raw evidence
 * fragments). Each pattern is stripped from every rendered text field.
 */
const INTERNAL_MARKER_PATTERNS: RegExp[] = [
  // Icon/label concatenations a weak model can echo ("svgFact",
  // "svgInference", "svgRecommendations", "svgSources", bare "svg").
  /\bsvg(Fact|Inference|Recommendation|Recommendations|Sources)?\b/gi,
  // "ConfidenceLow" — the confidence value glued to its label.
  /\bConfidence(High|Medium|Low)\b/g,
  // Raw availability/ok flags from evidence records.
  /\bavailable\s*[=:]\s*false\b/gi,
  /\bavailable\s*[=:]\s*true\b/gi,
  /\bok\s*[=:]\s*true\b/gi,
  /\bok\s*[=:]\s*false\b/gi,
  // Truncation markers and raw JSON field fragments.
  /\[truncated\]|…\[truncated\]/g,
  /"(?:metadata|data|query|error|warnings|results|items|macro|indices|breadth)"\s*:/g,
]

// Turn identifiers ("(turn 3)") are provenance-sensitive: the analyst is
// allowed to name the exact turn when the user asks which tool showed a
// claim, so the hygiene gate strips them only outside provenance asks.
const TURN_MARKER_PATTERN = /\(turn\s+\d+\)/gi

/** One pattern replacement for a matched internal marker. */
function replaceInternalMarker(match: string): string {
  const conf = /^Confidence(High|Medium|Low)$/.exec(match)
  if (conf) return `Confidence: ${conf[1]}`
  const avail = /^available\s*[=:]\s*(false|true)$/i.exec(match)
  if (avail) return avail[1] === 'false' ? 'unavailable' : 'available'
  const ok = /^ok\s*[=:]\s*(true|false)$/i.exec(match)
  if (ok) return ok[1] === 'true' ? 'confirmed' : ''
  return ''
}

/**
 * True when the user's question explicitly demands provenance — "which tool
 * showed that?", "does Finova's data support this?". The analyst contract
 * says provenance is the answer in that case: the exact tool name (and turn)
 * must be named, never hidden.
 */
export function isProvenanceAsk(text: string): boolean {
  return (
    /which (?:finova )?tool|what tool|which of the tools|did you run|did you use|does (?:finova |the )?data support|how did you (?:arrive|get|determine)|where did (?:that|this|the) (?:number|figure|claim|read|call) come|name the tool/i.test(
      text,
    )
  )
}

export interface HygieneOptions {
  /**
   * True when the question explicitly asked for provenance ("which tool
   * showed that?") — the exact tool names and turn identifiers are the
   * answer, so they are preserved rather than scrubbed.
   */
  preserveProvenance?: boolean
  /** Deterministic presentation policy derived from the current question. */
  depth?: 'brief' | 'standard' | 'deep'
}

/**
 * Scrub one user-facing text field of every internal/debug marker: SVG/label
 * concatenations, "ConfidenceLow", "(turn N)" identifiers, raw JSON fragments
 * and suppressed tool names. Deterministic and non-destructive — real content
 * passes through unchanged; only machinery is removed. Provenance asks
 * (preserveProvenance) keep tool names and turn identifiers intact.
 */
export function sanitizeUserFacingText(text: string, options: HygieneOptions = {}): string {
  let out = text
  for (const pattern of INTERNAL_MARKER_PATTERNS) {
    out = out.replace(pattern, (match) => replaceInternalMarker(match) || '')
  }
  if (!options.preserveProvenance) {
    out = out.replace(TURN_MARKER_PATTERN, 'earlier in this conversation')
    out = sanitizeToolNames(out)
  }
  return out.replace(/\s{2,}/g, ' ').trim()
}

/**
 * The final hygiene gate over a COMPLETE user-facing response. Applied at the
 * engine choke point so EVERY path (validated LLM output, deterministic
 * synthesis, memory recap, subject/research fallbacks) reaches the UI clean:
 * no svg-prefixed or Confidence-level markers, no turn identifiers, no raw
 * JSON evidence, no tool names, no debug terminology. Facts and structure are
 * preserved — only presentation text is scrubbed.
 */
export function applyOutputHygiene(response: AnalystResponse, options: HygieneOptions = {}): AnalystResponse {
  const sanitize = (text: string): string => sanitizeUserFacingText(text, options)
  const depth = options.depth ?? 'deep'
  const answer = sanitize(response.answer ?? response.summary ?? response.sections?.[0]?.body ?? response.sections?.[0]?.bullets?.[0] ?? response.title)
  const rawSupporting = response.supportingPoints && response.supportingPoints.length > 0
    ? response.supportingPoints
    : (response.sections ?? []).flatMap((s) => [s.body, ...(s.bullets ?? [])].filter((v): v is string => Boolean(v)))
  const supportingPoints = rawSupporting.map(sanitize).filter(Boolean).slice(0, depth === 'brief' ? 2 : depth === 'standard' ? 3 : 5)
  const followUp = response.followUp ?? response.followUps?.[0]

  const out: AnalystResponse = {
    ...response,
    title: sanitize(response.title),
    answer,
    summary: answer,
    ...(supportingPoints.length > 0 ? { supportingPoints } : {}),
    ...(followUp ? { followUp: sanitize(followUp) } : {}),
    ...(response.summary ? { summary: sanitize(response.summary) } : {}),
    ...(response.sections
      ? {
          sections: response.sections.map((s) => {
            const heading = sanitize(s.heading)
            return {
              ...s,
              heading: heading || 'Evidence',
              ...(s.body ? { body: sanitize(s.body) } : {}),
              ...(s.bullets ? { bullets: s.bullets.map(sanitize) } : {}),
            }
          }),
        }
      : {}),
    ...(response.findings
      ? {
          findings: response.findings.map((f) => ({
            ...f,
            title: sanitize(f.title),
            detail: sanitize(f.detail),
            ...(f.metric ? { metric: sanitize(f.metric) } : {}),
          })),
        }
      : {}),
    ...(response.recommendations
      ? { recommendations: response.recommendations.map(sanitize) }
      : {}),
    ...(response.actions
      ? { actions: response.actions.map((a) => ({ ...a, label: sanitize(a.label) })) }
      : {}),
    ...(response.followUps ? { followUps: response.followUps.map(sanitize) } : {}),
    ...(response.plan
      ? {
          plan: response.plan.map((p) => ({
            ...p,
            time: sanitize(p.time),
            title: sanitize(p.title),
            ...(p.detail ? { detail: sanitize(p.detail) } : {}),
          })),
        }
      : {}),
    ...(response.chart
      ? {
          chart: {
            ...response.chart,
            title: sanitize(response.chart.title),
            points: response.chart.points.map((p) => ({ ...p, label: sanitize(p.label) })),
          },
        }
      : {}),
    ...(response.table
      ? {
          table: {
            headers: response.table.headers.map(sanitize),
            rows: response.table.rows.map((row) => row.map((cell) => (typeof cell === 'string' ? sanitize(cell) : cell))),
            ...(response.table.caption ? { caption: sanitize(response.table.caption) } : {}),
          },
        }
      : {}),
    ...(response.sources
      ? {
          sources: response.sources.slice(0, depth === 'brief' ? 3 : depth === 'standard' ? 5 : 8).map((s) => ({
            ...s,
            ...(s.title ? { title: sanitize(s.title) } : {}),
            ...(s.snippet ? { snippet: sanitize(s.snippet) } : {}),
          })),
        }
      : {}),
  }
  if (depth === 'brief') {
    delete out.metrics
    delete out.sections
    delete out.findings
    delete out.recommendations
    delete out.actions
    delete out.chart
    delete out.plan
    delete out.table
    out.followUps = out.followUps?.slice(0, 1)
    return out
  }
  if (depth === 'standard' && !options.preserveProvenance) {
    delete out.sections
    delete out.findings
    delete out.recommendations
    delete out.actions
    delete out.chart
    delete out.plan
    delete out.table
    out.followUps = out.followUps?.slice(0, 1)
  }
  return out
}

/**
 * The complete user-visible text of a response (the text the card renders),
 * joined for assertion purposes. Every string the UI can display is included —
 * titles, summaries, headings, bodies, bullets, findings, chips and sources.
 */
export function renderedResponseText(response: AnalystResponse): string {
  return [
    response.title ?? '',
    response.answer ?? '',
    ...(response.supportingPoints ?? []),
    response.followUp ?? '',
    response.summary ?? '',
    ...(response.sections ?? []).flatMap((s) => [s.heading, s.body ?? '', ...(s.bullets ?? [])]),
    ...(response.findings ?? []).flatMap((f) => [f.title, f.detail, f.metric ?? '']),
    ...(response.recommendations ?? []),
    ...(response.actions ?? []).map((a) => a.label),
    ...(response.followUps ?? []),
    ...(response.plan ?? []).flatMap((p) => [p.time, p.title, p.detail ?? '']),
    ...(response.chart ? [response.chart.title, ...response.chart.points.map((p) => p.label)] : []),
    ...(response.table
      ? [
          ...response.table.headers,
          ...response.table.rows.flatMap((row) => row.map(String)),
          response.table.caption ?? '',
        ]
      : []),
    ...(response.sources ?? []).flatMap((s) => [s.title, s.snippet ?? '']),
  ]
    .filter(Boolean)
    .join('\n')
}