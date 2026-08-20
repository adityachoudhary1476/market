// ---------------------------------------------------------------------------
// Phase 3O — Analyst Reasoning & Conversational Intelligence: evidence
// freshness, cross-turn repetition and the deterministic quality gate.
//
// §13: a real temporal split between the market data and the news feed is
// named honestly, never silently merged into one "current" snapshot.
// §6: the analyst adds to — not restates — prior conclusions (bigram-overlap
// guard). §27: the quality gate verifies what code can (opening on substance,
// no tool names in prose, no canned closers, no repeated headings, no empty
// sections, provenance survives), reports issues, never rewrites.
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ToolResult } from '../../tools/types'
import { makeResponse, makeToolResult, NOW } from '../../conversation/__tests__/helpers'
import {
  auditResponse,
  detectRepetition,
  detectTemporalInconsistency,
  findCannedClosers,
  findMetaOpeners,
  overlapScore,
} from '../responseIntelligence'

function newsResult(publishedDaysAgo: number): ToolResult {
  return makeToolResult({
    data: {
      items: [
        {
          subject: 'gold',
          title: 'Gold steadies',
          url: 'https://reuters.com/gold',
          snippet: 'Gold steadied.',
          source: 'reuters.com',
          publishedAt: new Date(NOW - publishedDaysAgo * 86_400_000).toISOString(),
          provider: 'tavily',
          freshness: 'today',
          sourceTier: 'major',
          corroboratedBy: 2,
          relevant: true,
        },
      ],
    },
    metadata: { tool: 'searchNews', timestamp: new Date(NOW - publishedDaysAgo * 86_400_000).toISOString(), source: 'web-search', available: true, warnings: [] },
  })
}

// --- Temporal consistency (§13) ----------------------------------------------

test('Q1 — fresh market data + stale news is flagged as a timestamp mismatch, never merged', () => {
  const results = [
    makeToolResult({ metadata: { tool: 'getTechnicalAnalysis', timestamp: new Date(NOW - 60_000).toISOString(), source: 'technical-engine', available: true, warnings: [] } }),
    newsResult(3),
  ]
  const notes = detectTemporalInconsistency(results, NOW)
  assert.equal(notes.length, 1)
  assert.ok(notes[0].includes('timestamped differently'), 'the mismatch is named')
  assert.ok(notes[0].includes('one current snapshot'), 'no silent merging')
})

test('Q2 — stale market data + fresh news is flagged the other way', () => {
  const results = [
    makeToolResult({ metadata: { tool: 'getMarketSnapshot', timestamp: new Date(NOW - 2 * 86_400_000).toISOString(), source: 'market-data', available: true, warnings: [] } }),
    newsResult(0),
  ]
  const notes = detectTemporalInconsistency(results, NOW)
  assert.equal(notes.length, 1)
  assert.ok(notes[0].includes('may not describe the same market state'))
})

test('Q3 — no flag when both feeds are current, when only one feed exists, or on invalid timestamps', () => {
  assert.deepEqual(detectTemporalInconsistency([
    makeToolResult({ metadata: { tool: 'getTechnicalAnalysis', timestamp: new Date(NOW - 60_000).toISOString(), source: 'technical-engine', available: true, warnings: [] } }),
    newsResult(0),
  ], NOW), [])

  assert.deepEqual(detectTemporalInconsistency([makeToolResult({ metadata: { tool: 'getTechnicalAnalysis', timestamp: new Date(NOW - 60_000).toISOString(), source: 'technical-engine', available: true, warnings: [] } })], NOW), [])

  assert.deepEqual(detectTemporalInconsistency([
    makeToolResult({ metadata: { tool: 'getTechnicalAnalysis', timestamp: 'not-a-date', source: 'technical-engine', available: true, warnings: [] } }),
  ], NOW), [], 'invalid timestamps are skipped, never crash')

  assert.deepEqual(detectTemporalInconsistency([
    makeToolResult({ ok: false, data: null, error: { code: 'DATA_UNAVAILABLE', message: 'down' } }),
  ], NOW), [], 'unavailable evidence is skipped')
})

// --- Cross-turn repetition (§6) ----------------------------------------------

test('Q4 — overlapScore is symmetric and grounded on real shared language', () => {
  assert.equal(overlapScore('', 'anything'), 0)
  assert.equal(overlapScore('Nifty is up', 'Nifty is up today on banking gains'), 1 / 3, 'Jaccard over bigram sets')
  assert.equal(overlapScore('Nifty is up on banking gains', 'Gold is flat on dollar strength'), 0)
  const a = overlapScore('Nifty near-term bias is bullish', 'Nifty near-term bias is bullish')
  const b = overlapScore('Nifty near-term bias is bullish', 'Gold near-term bias is bearish')
  assert.ok(a > b)
})

test('Q5 — detectRepetition flags a restated conclusion above the threshold', () => {
  const summary = 'Nifty near-term bias is bullish on banking and breadth support.'
  const prior = 'Nifty near-term bias is bullish on banking and breadth support.'
  const rep = detectRepetition(summary, [prior])
  assert.ok(rep && rep.score >= 0.55)

  const rep2 = detectRepetition(summary, ['Gold is consolidating near record highs as yields ease.'])
  assert.equal(rep2, null)
})

// --- Canned closers & meta openers ------------------------------------------

test('Q6 — canned closers and machinery openers are detected verbatim', () => {
  assert.deepEqual(findCannedClosers('Answer. Is there anything else I can help with?'), ['is there anything else i can help'])
  assert.deepEqual(findCannedClosers('Would you like me to run it again?'), ['would you like me to'])
  assert.deepEqual(findCannedClosers('Answer. Do you have any other questions?'), ['do you have any other questions'])
  assert.deepEqual(findCannedClosers('Is there anything else I can help with? Feel free to ask.'), ['is there anything else i can help', 'feel free to ask'])
  assert.deepEqual(findMetaOpeners("Here's what I found on Nifty."), ["here's what i found"])
  assert.deepEqual(findMetaOpeners('Nifty is up 0.4% today.'), [])
})

// --- Quality gate (§27) ------------------------------------------------------

test('Q7 — a clean response passes the gate with no issues', () => {
  const response = makeResponse({
    summary: 'Nifty is up 0.4% — near-term bias is bullish on banking support.',
    title: 'Nifty 50 — what the available evidence shows',
    sections: [{ heading: 'Technical picture', kind: 'fact', body: 'Price sits above the 20-day EMA.', bullets: [] }],
    sources: [{ url: 'https://reuters.com/nifty', title: 'Nifty', snippet: 'Nifty outlook.', source: 'reuters.com', provider: 'tavily', publishedAt: new Date(NOW).toISOString() }],
  })
  assert.deepEqual(auditResponse(response, { priorSummaries: ['Gold is flat today.'], sourcesExpected: true }), [])
})

test('Q8 — the gate flags machinery openers, canned closers, tool names and missing provenance', () => {
  const response = makeResponse({
    summary: 'Here is technical analysis for today.',
    title: 'Analysis',
    sections: [{ heading: 'Technical picture', kind: 'fact', body: '', bullets: [] }],
  })
  const issues = auditResponse(response, { sourcesExpected: true })
  const ids = issues.map((i) => i.id).sort()
  assert.ok(ids.includes('meta-opener'))
  assert.ok(ids.includes('empty-section'))
  assert.ok(ids.includes('sources-missing'))
})

test('Q9 — the gate flags a summary that restates a prior conclusion', () => {
  const summary = 'Nifty near-term bias is bullish on banking and breadth support.'
  const issues = auditResponse(makeResponse({ summary }), { priorSummaries: [summary] })
  assert.ok(issues.some((i) => i.id === 'repetition'), `got ${issues.map((i) => i.id).join(',')}`)
})

test('Q10 — the gate flags tool names in prose but is silent on provenance paths', () => {
  const response = makeResponse({
    summary: 'The getConfluence output is mixed.',
    sections: [{ heading: 'Technical picture', kind: 'fact', body: 'src = getTechnicalAnalysis', bullets: [] }],
  })
  const issues = auditResponse(response)
  assert.ok(issues.some((i) => i.id === 'tool-name'), 'tool name in prose is flagged')
})

test('Q11 — the gate is non-destructive: it reports, it never rewrites', () => {
  const response = makeResponse({ summary: 'Here is the market snapshot.' })
  const before = JSON.stringify(response)
  auditResponse(response, { priorSummaries: [], sourcesExpected: false })
  assert.equal(JSON.stringify(response), before, 'the response object is untouched')
})