// ---------------------------------------------------------------------------
// Phase 3D — Agent layer: subject-aware deterministic fallback
//
// When the LLM path fails, the deterministic AnalystEngine re-classifies the
// raw text with no subject understanding, so a first-turn question like
// "what's happening with oil rn" dead-ends in a NIFTY market summary.
//
// This wrapper sits under the conversation wrapper and resolves the turn's
// FINANCIAL SUBJECT first:
//   - subjects with deterministic Finova data (Brent, Gold, USD/INR via macro;
//     S&P 500/Nasdaq/Dow/US markets via global indices; banks/tech/energy via
//     the sector table) get an honest data answer from that data — never from
//     NIFTY;
//   - subjects with no Finova data source (Bitcoin, crypto, silver) get an
//     honest "no deterministic data" answer — nothing is fabricated and no
//     Indian equity data is substituted;
//   - equity questions (indices, stocks) and subject-less questions delegate
//     to the deterministic engine exactly as before.
//
// It never invents values, tools or sources. The LLM remains the primary
// reasoner; this only prevents the wrong-market default.
// ---------------------------------------------------------------------------

import type { AnalystContext, AnalystResponse } from '../types'
import type { AnalystEngine } from '../engine'
import { localAnalystEngine } from '../engine'
import { understandTurn, type Understanding } from './understanding'
import type { FinancialSubject } from './subjects'
import { logAgent } from './logger'

export interface SubjectAwareFallbackOptions {
  /** Deterministic engine to delegate to (defaults to localAnalystEngine). */
  base?: AnalystEngine
}

export function createSubjectAwareFallback(options: SubjectAwareFallbackOptions = {}): AnalystEngine {
  const base = options.base ?? localAnalystEngine

  async function generate(input: {
    text: string
    context: AnalystContext
    history?: AnalystResponse[]
  }): Promise<AnalystResponse> {
    const understanding = understandTurn(input.text)
    const primary = understanding.primary

    // Equity subjects (indices/companies) and subject-less turns stay with
    // the deterministic engine exactly as before.
    if (!primary || primary.subject.assetClass === 'index' || primary.subject.assetClass === 'company') {
      return base.generate(input)
    }

    const handled = buildSubjectResponse(input.context, understanding)
    if (handled) return handled

    // Deterministic data existed but was missing from the context — honest
    // degradation rather than a wrong-market substitution.
    return noDataResponse(primary.subject)
  }

  return {
    generate,
    insights: (context: AnalystContext) => (typeof base.insights === 'function' ? base.insights(context) : []),
    suggest: (context: AnalystContext) => (typeof base.suggest === 'function' ? base.suggest(context) : []),
  }
}

// --- Response builders ------------------------------------------------------

const fmtPct = (n: number): string => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`

/** Deterministic evidence bullets for a subject, from the session context. */
function dataBulletsForSubject(context: AnalystContext, subject: FinancialSubject): string[] {
  const ref = subject.dataRef
  if (ref?.kind === 'macro') {
    const m = (context.macro ?? []).find((x) => x.id === ref.id)
    return m ? [`${m.label}: ${m.value} (${fmtPct(m.changePct)}) — Finova macro indicator`] : []
  }
  if (ref?.kind === 'global') {
    const g = (context.global ?? []).find((x) => x.id === ref.id)
    return g ? [`${g.name}: ${fmtPct(g.changePct)} — Finova global index data`] : []
  }
  if (ref?.kind === 'sector') {
    const s = (context.sectors ?? []).find((x) => x.id === ref.id)
    return s ? [`${s.name} sector: ${fmtPct(s.changePct)} — Finova sector data`] : []
  }
  if (ref?.kind === 'index') {
    const i = (context.indices ?? []).find((x) => x.id === ref.id)
    return i ? [`${i.name}: ${i.value} (${fmtPct(i.changePct)}) — Finova index data`] : []
  }
  if (subject.id === 'commodities') {
    const brent = (context.macro ?? []).find((x) => x.id === 'brent')
    const gold = (context.macro ?? []).find((x) => x.id === 'gold')
    const out: string[] = []
    if (brent) out.push(`${brent.label}: ${brent.value} (${fmtPct(brent.changePct)}) — Finova macro indicator`)
    if (gold) out.push(`${gold.label}: ${gold.value} (${fmtPct(gold.changePct)}) — Finova macro indicator`)
    return out
  }
  if (subject.id === 'global') {
    return (context.global ?? []).map(
      (g) => `${g.name}: ${fmtPct(g.changePct)} — Finova global index data`,
    )
  }
  return []
}

/** India-related context for impact questions ("how could it affect India?"). */
function relatedIndiaBullets(context: AnalystContext): string[] {
  const out: string[] = []
  const usdinr = context.macro.find((x) => x.id === 'usdinr')
  if (usdinr) out.push(`${usdinr.label}: ${usdinr.value} (${fmtPct(usdinr.changePct)}) — Finova macro indicator`)
  const energy = context.sectors.find((x) => x.id === 'energy')
  if (energy) out.push(`Energy sector: ${fmtPct(energy.changePct)} — Finova sector data`)
  const nifty = context.indices.find((x) => x.id === 'nifty-50')
  if (nifty) out.push(`${nifty.name}: ${nifty.value} (${fmtPct(nifty.changePct)}) — Finova index data`)
  return out
}

/** Build the subject-aware deterministic response, or null when no data exists. */
function buildSubjectResponse(
  context: AnalystContext,
  understanding: Understanding,
): AnalystResponse | null {
  const primary = understanding.primary
  if (!primary) return null

  const subject = primary.subject
  const bullets = dataBulletsForSubject(context, subject)

  // Related context for impact questions with a secondary subject (e.g. India).
  const related: string[] = []
  if (understanding.secondary?.subject.id === 'india') {
    related.push(...relatedIndiaBullets(context))
  }
  if (understanding.secondary && understanding.secondary.subject.id !== 'india') {
    related.push(...dataBulletsForSubject(context, understanding.secondary.subject))
  }

  const label = subject.label
  const combined = [...bullets, ...related]

  if (subject.coverage === 'web-only' || combined.length === 0) {
    logAgent({ kind: 'subject-fallback', subject: label, branch: 'no-data' })
    return noDataResponse(subject)
  }

  const summary = summaryFor(understanding, label, bullets.length > 0)
  const coverageNote = related.length > 0
    ? `Finova's deterministic data for ${label} and its relationship to India is limited to these levels; drivers and outlook need live data and news that this session does not have.`
    : `Finova's deterministic coverage for ${label} in this session is limited to these levels; there is no live price series or news feed here, so the drivers and outlook cannot be established from this session's data.`
  logAgent({ kind: 'subject-fallback', subject: label, branch: 'coverage-note' })

  return {
    id: `subj-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`,
    intent: 'ask',
    title: `${label} — what Finova's data shows`,
    summary,
    sections: [
      { heading: "What Finova's data shows", kind: 'fact', bullets: combined },
      { heading: 'Honest limits', kind: 'inference', body: coverageNote },
    ],
    findings: combined.slice(0, 4).map((b) => ({
      kind: 'fact',
      title: label,
      detail: b,
    })),
    recommendations: ['Ask again for the news and drivers behind this level.'],
    confidence: 'Low',
    followUps: ['What is driving crude oil prices?', 'How does oil affect Indian markets?', "What is Finova's data on Gold?"],
    partial: true,
    generatedAt: new Date().toISOString(),
  }
}

function summaryFor(
  understanding: Understanding,
  label: string,
  hasLevels: boolean,
): string {
  const level = hasLevels
    ? `Finova's deterministic data shows the current ${label} levels`
    : `Finova has no deterministic data source for ${label} in this session`
  switch (understanding.intent) {
    case 'explain_move':
      return `${level}. Explaining the move itself needs news and drivers beyond this dataset.`
    case 'forecast_outlook':
      return `${level}. A forecast would need live data and news this deterministic session does not have — no prediction is fabricated.`
    case 'news':
      return `You asked for news on ${label}. Finova has no news feed in this session; here is the deterministic level data. Real news and the drivers behind the level cannot be established from this session's data.`
    case 'impact':
      return `${level}, and the related India indicators available in Finova's data. The relationship itself needs news and analysis beyond these levels.`
    case 'compare':
      return `${level}. Finova's deterministic comparison is limited to these daily levels.`
    default:
      return `${level} in Finova's deterministic data.`
  }
}

/** Honest answer when a subject has no deterministic Finova data source. */
function noDataResponse(subject: FinancialSubject): AnalystResponse {
  const label = subject.label
  return {
    id: `nosrc-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`,
    intent: 'ask',
    title: `${label} — no Finova data source in this session`,
    summary: `Finova has no deterministic data source for ${label} (${subject.assetClass}) in this session, so I can't give you measured numbers without inventing them.`,
    sections: [
      {
        heading: 'What Finova does track',
        kind: 'fact',
        bullets: [
          'Indian equity indices, stocks, sectors and breadth.',
          'Macro indicators: Brent Crude, Gold, USD/INR, rates and India VIX.',
          'Global equity indices (S&P 500, Nasdaq, Dow, FTSE, DAX, Nikkei, Hang Seng, Shanghai).',
        ],
      },
      {
        heading: 'How to get this answered',
        kind: 'inference',
        bullets: [
          'Ask again when a live web search is available to retrieve real news and prices on this subject.',
          'Or ask about a tracked subject, e.g. NIFTY 50, TCS, Brent Crude or Gold.',
        ],
      },
    ],
    recommendations: ['Re-ask when live web search is available for news-driven coverage of this subject.'],
    confidence: 'Low',
    followUps: ["What is Finova's data on Brent Crude?", 'How is Gold doing?', 'What does Finova track?'],
    partial: true,
    generatedAt: new Date().toISOString(),
  }
}