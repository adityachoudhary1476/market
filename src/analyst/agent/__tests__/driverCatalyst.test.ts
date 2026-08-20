// ---------------------------------------------------------------------------
// Phase 3N.3 — Market-driver questions: catalyst-aware behavior tests
//
// Locks in the driver/catalyst contract:
//   - driver questions ("what is happening with X", "why is X moving", "what
//     is driving X", "is X bullish/bearish") are marked catalyst-relevant;
//   - price levels alone are NEVER treated as a complete answer for them;
//   - a driver answer leads with the established catalyst and combines it
//     with the deterministic market data;
//   - conflicting catalysts vs price data are named, never averaged;
//   - when no catalyst can be established, that is said explicitly — nothing
//     is invented;
//   - plain status questions keep the straight price answer;
//   - no internal markers (web-enabled analyst branding) leak into
//     user-facing fallback output.
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { understandTurn } from '../understanding'
import { synthesizeResponse } from '../synthesis'
import {
  buildDriverSummary,
  catalystEvidence,
  detectDriverConflicts,
  newsDirectionalSign,
} from '../responseIntelligence'
import { createAgentAnalystEngine } from '../agentEngine'
import { createMockProvider, createRuleMockProvider, toolCall } from '../mockProvider'
import { createDefaultAnalystToolRegistry } from '../../tools/registry'
import { createDefaultToolContext } from '../../tools/context'
import { buildAnalystContext } from '../../buildContext'
import { runAgentSession } from '../orchestrator'
import type { ToolResult } from '../../tools/types'
import type { NewsItem } from '../../websearch/types'

const NOW = 1_720_000_000_000
const REGISTRY = createDefaultAnalystToolRegistry()
const TOOL_CTX = createDefaultToolContext(NOW)
const CONTEXT = buildAnalystContext()

const NIFTY_MENTION = [{ id: 'nifty-50', type: 'index' as const, displayName: 'Nifty 50', matched: 'NIFTY' }]

function technical(overrides: Record<string, unknown> = {}): ToolResult {
  return {
    ok: true,
    data: {
      instrument: 'nifty-50',
      trend: { overall: { direction: 'up', strength: 0.8 } },
      momentum: { rsi: 61, bias: 'positive' },
      price: { current: 24816, changePercent: 0.4 },
      ...overrides,
    },
    error: null,
    metadata: {
      tool: 'getTechnicalAnalysis',
      timestamp: new Date(NOW).toISOString(),
      source: 'technical-engine',
      available: true,
      warnings: [],
    },
  }
}

function newsItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: 'Banks lead Nifty rally on strong earnings',
    url: 'https://www.reuters.com/markets/india/nifty',
    snippet: 'Indian banks rallied, lifting Nifty to a record on strong earnings and fresh foreign inflows.',
    source: 'reuters.com',
    publishedAt: new Date(NOW).toISOString(),
    provider: 'tavily',
    subject: 'nifty-50',
    freshness: 'breaking',
    sourceTier: 'major',
    corroboratedBy: 2,
    relevant: true,
    ...overrides,
  }
}

function newsResult(items: NewsItem[]): ToolResult {
  return {
    ok: true,
    data: { query: { query: 'nifty 50 drivers news', maxResults: 5 }, items },
    error: null,
    metadata: {
      tool: 'searchNews',
      timestamp: new Date(NOW).toISOString(),
      source: 'web-search',
      available: true,
      warnings: [],
    },
  }
}

function finalResponse(title: string) {
  return JSON.stringify({
    intent: 'explain',
    title,
    summary: 'Synthesized answer from gathered evidence.',
    sections: [{ heading: 'Evidence', kind: 'fact', body: 'Based on the tools consulted.' }],
    findings: [{ kind: 'inference', title: 'Read', detail: 'Interpretation of evidence.' }],
    confidence: 'Medium',
  })
}

function fullPrompt(request: { system: string; messages: Array<{ content: string }> }): string {
  return [request.system, ...request.messages.map((m) => m.content)].join('\n')
}

// --- Classification -----------------------------------------------------------

test('D1 — the four driver phrasings are catalyst-relevant; a status ask is not', () => {
  for (const q of [
    'what is happening with NIFTY?',
    'why is NIFTY moving?',
    'what is driving NIFTY today?',
    'is NIFTY bullish or bearish?',
  ]) {
    assert.equal(understandTurn(q).catalystRelevant, true, q)
  }
  assert.equal(understandTurn('how is NIFTY doing?').catalystRelevant, false, 'plain status stays a price question')
  const gold = understandTurn('why is gold moving?')
  assert.equal(gold.catalystRelevant, true)
  assert.ok(gold.newsHint?.includes('gold'), 'driver questions get a natural search hint')
})

test('D2 — the model context tells driver questions to investigate catalysts', async () => {
  const provider = createRuleMockProvider(({ callCount, request }) => {
    if (callCount === 1) {
      const prompt = fullPrompt(request)
      assert.ok(prompt.includes('driver/catalyst question'), 'catalyst directive is present in the context note')
      assert.ok(prompt.includes('never invent a driver'), 'the no-invention rule is explicit')
      assert.ok(prompt.includes('searchNews'), 'the research tools are pointed at')
      return { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'NIFTY 50' })] }
    }
    return { kind: 'final', content: finalResponse('Nifty drivers') }
  })
  const output = await runAgentSession(
    { text: 'What is driving NIFTY today?', context: CONTEXT, history: [] },
    { provider, registry: REGISTRY, toolContext: TOOL_CTX },
  )
  assert.equal(output.understanding?.catalystRelevant, true, 'the structured understanding carries the signal')
})

// --- Deterministic synthesis --------------------------------------------------

test('D3 — a price-only question stays a straight price answer, never a driver synthesis', () => {
  const u = understandTurn('How is NIFTY doing right now?')
  assert.equal(u.catalystRelevant, false)
  const r = synthesizeResponse({
    question: 'How is NIFTY doing right now?',
    results: [technical()],
    mentions: NIFTY_MENTION,
    catalystRelevant: false,
  })
  assert.ok(r.summary?.startsWith("Nifty 50's overall trend is up"), r.summary)
  assert.ok(!r.summary?.toLowerCase().includes('catalyst'), 'no driver language on a plain status question')
  assert.ok(!r.summary?.toLowerCase().includes('not a confirmed driver'))
})

test('D4 — driver question with catalyst evidence leads with the driver, then the price read', () => {
  const r = synthesizeResponse({
    question: 'What is driving NIFTY today?',
    results: [technical(), newsResult([newsItem()])],
    mentions: NIFTY_MENTION,
    catalystRelevant: true,
  })
  assert.ok(r.summary?.startsWith("What's moving Nifty 50 now:"), r.summary)
  assert.ok(r.summary?.includes('Banks lead Nifty rally'), 'the real catalyst headline leads the answer')
  assert.ok(r.summary?.includes('overall trend is up'), 'deterministic market data is combined with the driver')
  assert.ok(!JSON.stringify(r).includes('Conflicting evidence'), 'no conflict when both sides agree')
})

test('D5 — driver question with conflicting evidence names the split, never averages it', () => {
  const r = synthesizeResponse({
    question: 'Why is NIFTY moving today?',
    results: [
      technical(),
      newsResult([
        newsItem({
          title: 'Nifty slides on profit booking',
          snippet: 'Nifty fell as investors booked profits after the recent run.',
        }),
      ]),
    ],
    mentions: NIFTY_MENTION,
    catalystRelevant: true,
  })
  const text = JSON.stringify(r)
  assert.ok(text.includes('Conflicting evidence'), 'the split is surfaced as a section')
  assert.ok(text.includes('opposite directions'), 'the conflict is named explicitly')
  assert.ok(r.summary?.includes('overall trend is up'), 'both sides remain visible in the answer')
})

test('D6 — driver question with no establishable catalyst says so explicitly, invents nothing', () => {
  const r = synthesizeResponse({
    question: 'Why is NIFTY falling?',
    results: [
      technical({
        trend: { overall: { direction: 'down', strength: 0.6 } },
        price: { current: 24300, changePercent: -0.7 },
      }),
    ],
    mentions: NIFTY_MENTION,
    catalystRelevant: true,
  })
  assert.ok(r.summary?.toLowerCase().includes('no reliable catalyst could be established'), r.summary)
  assert.ok(r.summary?.toLowerCase().includes('not a confirmed driver'), 'the price read is labeled as a price read')
  assert.ok(!/because|driven by|due to/i.test(r.summary ?? ''), 'no invented cause is asserted')
})

test('D7 — buildDriverSummary with no evidence at all stays honest', () => {
  const s = buildDriverSummary({ label: 'Bitcoin', results: [] })
  assert.ok(s.includes('No reliable catalyst could be established'))
  assert.ok(s.includes('no price read is available either'))
})

// --- Signal helpers -----------------------------------------------------------

test('D8 — newsDirectionalSign reads real headline words and stays null without news', () => {
  assert.equal(newsDirectionalSign([technical()]), null)
  assert.equal(newsDirectionalSign([newsResult([newsItem()])]), 'bull')
  assert.equal(
    newsDirectionalSign([newsResult([newsItem({ title: 'Nifty slides on profit booking', snippet: 'Nifty fell sharply.' })])]),
    'bear',
  )
})

test('D9 — detectDriverConflicts fires only when the news opposes the measured data', () => {
  const split = detectDriverConflicts([
    technical(),
    newsResult([newsItem({ title: 'Nifty slides on profit booking', snippet: 'Nifty fell sharply.' })]),
  ])
  assert.equal(split.length, 1)
  assert.ok(split[0].note.includes('opposite directions'))
  const aligned = detectDriverConflicts([technical(), newsResult([newsItem()])])
  assert.equal(aligned.length, 0, 'news pointing the same way is not a conflict')
})

test('D10 — catalystEvidence pulls real headline citations, bounded and attributed', () => {
  const items = catalystEvidence([newsResult([newsItem(), newsItem({ title: 'Second story' })]), technical()])
  assert.equal(items.length, 2)
  assert.equal(items[0].source, 'reuters.com')
  assert.ok(items[0].text.includes('Banks lead Nifty rally'), 'the headline, not the raw snippet, is cited')
})

// --- User-facing output hygiene ----------------------------------------------

test('D11 — deterministic subject fallback never mentions a "web-enabled analyst"', async () => {
  const engine = createAgentAnalystEngine({
    provider: createMockProvider([{ kind: 'error', errorKind: 'unavailable' }]),
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    conversation: null,
  })
  const r = await engine.generate({ text: 'why is gold moving?', context: CONTEXT })
  const text = JSON.stringify(r).toLowerCase()
  assert.ok(!text.includes('web-enabled'), 'no internal branding leaks into user-facing output')
  assert.ok(!text.includes('web enabled'))
  assert.ok(r.summary?.includes('news and drivers'), 'the honest limits line stays useful')
})