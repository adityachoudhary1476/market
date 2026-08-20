// ---------------------------------------------------------------------------
// Phase 3O — Analyst Reasoning & Conversational Intelligence: analytical
// thread tests.
//
// The thread is the compact, bounded, deterministic anchor a follow-up
// resolves against ("what could kill it?" → the bullish Nifty thesis). These
// tests verify: capture from a completed turn (subject, question kind,
// timeframe, thesis, conclusion, supporting/opposing factors, comparison,
// news themes), rendering into the LLM payload, replacement per turn (single
// record), boundedness (no growth, capped factors/themes, truncated prose)
// and the no-fabrication rule (thesis only from real evidence signals).
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createConversationSession } from '../session'
import { makeResponse, makeToolResult, NOW } from './helpers'
import {
  captureAnalyticalThread,
  questionKindForIntent,
  thesisFromEvidence,
} from '../thread'
import type { ConversationState } from '../types'

const BULLISH_TA = {
  trend: { overall: { direction: 'bullish', strength: 5 } },
  price: { current: 24500, changePercent: 0.4 },
  momentum: { rsi: 58, bias: 'positive' },
}

const BEARISH_CONFLUENCE = { bias: 'bearish', score: { balance: -1.2, confidence: 0.7 } }

function newsItem(overrides: Record<string, unknown> = {}) {
  return {
    subject: 'gold',
    title: 'Gold steadies near record as yields ease',
    url: 'https://reuters.com/gold-record',
    snippet: 'Gold held near record highs.',
    source: 'reuters.com',
    publishedAt: new Date(NOW - 3600_000).toISOString(),
    provider: 'tavily' as const,
    freshness: 'today' as const,
    sourceTier: 'major' as const,
    corroboratedBy: 2,
    relevant: true,
    ...overrides,
  }
}

// --- Capture ----------------------------------------------------------------

test('T1 — the thread is captured from a completed turn, deterministically', () => {
  const session = createConversationSession({}, NOW)
  const r1 = session.resolve('Is Nifty bullish today?', NOW)
  session.update(r1, {
    response: makeResponse({
      intent: 'explain',
      title: 'NIFTY near-term bias',
      summary: 'Yes — the near-term bias is bullish, with breadth and financials supporting it.',
      confidence: 'Medium',
    }),
    evidence: [
      { result: makeToolResult({ data: BULLISH_TA }), entity: 'nifty-50' },
    ],
    sources: [],
    thread: { questionKind: 'directional', timeframe: 'today' },
    now: NOW,
  })

  const t = session.state.analyticalThread
  assert.ok(t, 'thread exists after the first turn')
  assert.equal(t?.subjectId, 'nifty-50')
  assert.equal(t?.subjectLabel, 'Nifty 50')
  assert.equal(t?.questionKind, 'directional')
  assert.equal(t?.timeframe, 'today')
  assert.equal(t?.thesis, 'bull', 'thesis comes from the real evidence signal')
  assert.ok(t?.conclusion.includes('near-term bias is bullish'), 'conclusion is the real response summary')
  assert.equal(t?.confidence, 'Medium')
  assert.ok(t?.supportingFactors.includes('technical picture'), 'supporting factor from the evidence group')
  assert.deepEqual(t?.opposingFactors ?? [], [], 'no opposing factors when evidence is unanimous')
  assert.equal(t?.lastUpdatedTurn, 1)
})

test('T2 — opposing evidence surfaces as honest conflicting factors, never averaged', () => {
  const session = createConversationSession({}, NOW)
  const r1 = session.resolve('What is the read on NIFTY?', NOW)
  session.update(r1, {
    response: makeResponse({ summary: 'Mixed signals on the day.' }),
    evidence: [
      { result: makeToolResult({ data: BULLISH_TA }), entity: 'nifty-50' },
      {
        result: makeToolResult({
          data: BEARISH_CONFLUENCE,
          metadata: { tool: 'getConfluence', timestamp: new Date(NOW).toISOString(), source: 'confluence-engine', available: true, warnings: [] },
        }),
        entity: 'nifty-50',
      },
    ],
    sources: [],
    thread: { questionKind: 'directional', timeframe: 'today' },
    now: NOW,
  })

  const t = session.state.analyticalThread
  assert.equal(t?.thesis, 'mixed', 'opposing evidence yields an honest mixed thesis')
  assert.equal(t?.supportingFactors.length, 1, 'only the directional side is supporting')
  assert.ok(t?.opposingFactors.length === 1, 'the conflict note is preserved')
  assert.ok(t?.opposingFactors[0].includes('split'), 'the note names the split honestly')
})

test('T3 — the thread is a single record replaced per turn (bounded by construction)', () => {
  const session = createConversationSession({}, NOW)
  for (let i = 1; i <= 10; i += 1) {
    const r = session.resolve(`Question ${i}`, NOW + i * 1000)
    session.update(r, {
      response: makeResponse({ title: `Answer ${i}`, summary: `Conclusion ${i}.` }),
      evidence: [{ result: makeToolResult({ data: BULLISH_TA }), entity: 'nifty-50' }],
      sources: [],
      thread: { questionKind: 'status', timeframe: 'today' },
      now: NOW + i * 1000,
    })
  }
  assert.ok(session.state.analyticalThread, 'thread exists after many turns')
  assert.equal(session.state.analyticalThread?.turn, 10, 'always the LATEST turn')
  assert.equal(session.state.analyticalThread?.conclusion, 'Conclusion 10.')
})

test('T4 — the thread stays bounded: factors capped, themes capped, prose truncated', () => {
  const session = createConversationSession({}, NOW)
  const r1 = session.resolve('How is gold doing?', NOW)
  const longSummary = 'Gold '.repeat(200)
  const manyThemes = Array.from({ length: 10 }, (_, i) => newsItem({ url: `https://r${i}.com/x`, title: `Story ${i}` }))
  const results = []
  for (let i = 0; i < 12; i += 1) {
    results.push(makeToolResult({ data: BULLISH_TA }))
  }
  session.update(r1, {
    response: makeResponse({ summary: longSummary }),
    evidence: results.map((result) => ({ result })),
    sources: [],
    news: manyThemes,
    thread: { questionKind: 'news', timeframe: 'today' },
    now: NOW,
  })
  const t = session.state.analyticalThread
  assert.ok(t, 'thread exists')
  assert.ok(t!.conclusion.length < longSummary.length, 'conclusion is truncated')
  assert.ok(t!.supportingFactors.length <= 4, 'supporting factors capped at 4')
  assert.ok(t!.newsThemes.length <= 3, 'news themes capped at 3')
})

test('T5 — a fresh session has no thread; capture is deterministic given inputs', () => {
  const session = createConversationSession({}, NOW)
  assert.equal(session.state.analyticalThread, null)

  const a = captureAnalyticalThread(
    session.state as ConversationState,
    { response: makeResponse({ summary: 'Read A.' }), evidence: [], sources: [], now: NOW },
    1,
  )
  const b = captureAnalyticalThread(
    session.state as ConversationState,
    { response: makeResponse({ summary: 'Read A.' }), evidence: [], sources: [], now: NOW },
    1,
  )
  assert.deepEqual(a, b, 'identical inputs produce an identical thread')
})

test('T6 — no evidence, no thesis: the thread never fabricates a direction', () => {
  const session = createConversationSession({}, NOW)
  const r1 = session.resolve('What is happening?', NOW)
  session.update(r1, {
    response: makeResponse({ summary: 'No deterministic evidence in this session.' }),
    evidence: [],
    sources: [],
    now: NOW,
  })
  const t = session.state.analyticalThread
  assert.equal(t?.thesis, null, 'no direction is invented')
  assert.deepEqual(t?.supportingFactors ?? [], [])
  assert.deepEqual(t?.newsThemes ?? [], [])
})

test('T7 — thesisFromEvidence maps only real signals, mixed never hides a split', () => {
  assert.equal(thesisFromEvidence([makeToolResult({ data: BULLISH_TA })]), 'bull')
  assert.equal(
    thesisFromEvidence([
      makeToolResult({ data: BULLISH_TA }),
      makeToolResult({ data: BEARISH_CONFLUENCE, metadata: { tool: 'getConfluence', timestamp: '2024-07-03T10:00:00.000Z', source: 'confluence-engine', available: true, warnings: [] } }),
    ]),
    'mixed',
  )
  assert.equal(thesisFromEvidence([makeToolResult({ data: { rsi: 50 } })]), null, 'no directional signal -> null')
  assert.equal(
    thesisFromEvidence([makeToolResult({ ok: false, data: null, error: { code: 'DATA_UNAVAILABLE', message: 'down' } })]),
    null,
    'unavailable evidence carries no direction',
  )
})

test('T8 — questionKindForIntent maps the coarse response intent (fallback)', () => {
  assert.equal(questionKindForIntent('explain'), 'explanatory')
  assert.equal(questionKindForIntent('compare'), 'comparison')
  assert.equal(questionKindForIntent('summary'), 'status')
  assert.equal(questionKindForIntent('weekly'), 'status')
  assert.equal(questionKindForIntent('next'), 'directional')
  assert.equal(questionKindForIntent('ask'), 'other')
})

// --- Context payload --------------------------------------------------------

test('T9 — the thread renders into the next turn payload as the continuity anchor', () => {
  const session = createConversationSession({}, NOW)
  const r1 = session.resolve('Is Nifty bullish today?', NOW)
  session.update(r1, {
    response: makeResponse({ summary: 'Yes — near-term bias is bullish.' }),
    evidence: [{ result: makeToolResult({ data: BULLISH_TA }), entity: 'nifty-50' }],
    sources: [],
    thread: { questionKind: 'directional', timeframe: 'today' },
    now: NOW,
  })
  const payload = session.resolve('What could kill it?', NOW + 1000).payload
  assert.ok(payload.includes('Analytical thread'), 'thread section present')
  assert.ok(payload.includes('directional · today on Nifty 50'), 'question kind + timeframe + subject')
  assert.ok(payload.includes('Last conclusion'), 'the anchor for the no-repeat rule')
  assert.ok(payload.includes('near-term bias is bullish'), 'the real conclusion is quoted')
  assert.ok(payload.includes('Thesis from the evidence: bull'), 'thesis is exposed honestly')
  assert.ok(payload.includes('Supporting: technical picture'), 'supporting factors are analyst vocabulary')
})

test('T10 — the thread section carries news themes and the active comparison when they exist', () => {
  const session = createConversationSession({}, NOW)
  const r1 = session.resolve('Compare Gold and Brent', NOW)
  session.update(r1, {
    response: makeResponse({ intent: 'compare', title: 'Gold vs Brent', summary: 'Comparison read.' }),
    evidence: [
      { result: makeToolResult({ data: BULLISH_TA, metadata: { tool: 'getTechnicalAnalysis', timestamp: new Date(NOW).toISOString(), source: 'technical-engine', available: true, warnings: [] } }), entity: 'gold' },
    ],
    sources: [],
    news: [newsItem()],
    thread: { questionKind: 'comparison', timeframe: 'today' },
    now: NOW,
  })
  const payload = session.resolve('Which one is stronger?', NOW + 1000).payload
  assert.ok(payload.includes('Active comparison:'), 'comparison rendered')
  assert.ok(payload.includes('News themes:'), 'news themes rendered')
  assert.ok(payload.includes('reuters.com: Gold steadies near record'), 'theme line is real, no URLs')
})

test('T11 — the thread payload stays inside the hard context cap', () => {
  const session = createConversationSession({ maxContextChars: 500 }, NOW)
  const r1 = session.resolve('Is Nifty bullish today?', NOW)
  session.update(r1, {
    response: makeResponse({ summary: 'A very long conclusion '.repeat(40) }),
    evidence: [{ result: makeToolResult({ data: BULLISH_TA }), entity: 'nifty-50' }],
    sources: [],
    thread: { questionKind: 'directional', timeframe: 'today' },
    now: NOW,
  })
  const payload = session.resolve('Why?', NOW + 1000).payload
  assert.ok(payload.length <= 500 + 64, `payload capped (${payload.length})`)
})