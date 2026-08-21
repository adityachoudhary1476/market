// ---------------------------------------------------------------------------
// Phase 3N.4 — Conversation follow-up routing tests (BUG 2)
//
// Locks in the recap-vs-fresh-analysis contract for the engine-level fallback:
//   - an analytical/driver follow-up with an explicit subject ("Why is oil
//     moving again?", "Is oil bullish rn?") runs FRESH research — session
//     evidence is never reused as if it were current;
//   - an explicit recap request ("What did you say about oil above?") answers
//     purely from session memory — no fresh tools run;
//   - every user-facing fallback response is clean of internal markers
//     (tool names, turn identifiers, raw flags) — no exceptions.
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAgentAnalystEngine } from '../agentEngine'
import { createMockProvider } from '../mockProvider'
import { createDefaultAnalystToolRegistry } from '../../tools/registry'
import { createDefaultToolContext } from '../../tools/context'
import { buildAnalystContext } from '../../buildContext'
import { createConversationSession } from '../../conversation/session'
import { renderedResponseText } from '../responseIntelligence'
import { SUPPRESSED_TOOL_NAMES } from '../responseIntelligence'
import type { WebSearchQuery, WebSearchResponse, WebSearchResult, WebSearchTransport } from '../../websearch/types'

const NOW = 1_720_000_000_000
const REGISTRY = createDefaultAnalystToolRegistry()
const TOOL_CTX = createDefaultToolContext(NOW)
const CONTEXT = buildAnalystContext()

function newsItem(title: string, snippet: string): WebSearchResult {
  return {
    title,
    url: `https://www.reuters.com/article/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    snippet,
    source: 'reuters.com',
    publishedAt: new Date(NOW).toISOString(),
    provider: 'tavily',
  }
}

function transportFor(results: WebSearchResult[], calls: WebSearchQuery[]): WebSearchTransport {
  return {
    async search(query: WebSearchQuery): Promise<WebSearchResponse> {
      calls.push(query)
      return {
        query: query.query,
        provider: 'tavily',
        results,
        totalResults: results.length,
        truncated: false,
      }
    },
  }
}

const OIL_NEWS = [
  newsItem('Oil slides as demand fears mount', 'Oil prices slid as investors worried that weak global demand would outweigh supply cuts.'),
  newsItem('Crude edges higher on supply tightness', 'Crude oil edged up as supply tightness supported prices.'),
]

function failingEngine(transport: WebSearchTransport, session: ReturnType<typeof createConversationSession>) {
  return createAgentAnalystEngine({
    provider: createMockProvider([{ kind: 'error', errorKind: 'rate-limit' }]),
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    search: { transport },
    conversation: session,
  })
}

function internalMarkersIn(text: string): string[] {
  const markers: string[] = []
  if (/\bsvg\b/i.test(text)) markers.push('svg')
  if (/ConfidenceLow/.test(text)) markers.push('ConfidenceLow')
  if (/\bturn\s+\d+\b/i.test(text)) markers.push('turn identifier')
  if (/available\s*[=:]\s*(false|true)/i.test(text)) markers.push('available flag')
  if (/ok\s*[=:]\s*(true|false)/i.test(text)) markers.push('ok flag')
  for (const tool of SUPPRESSED_TOOL_NAMES) {
    if (new RegExp(`\\b${tool}\\b`).test(text)) markers.push(tool)
  }
  return markers
}

test('D12 — a same-subject driver follow-up runs fresh research again (session evidence is not reused as current)', async () => {
  const calls: WebSearchQuery[] = []
  const session = createConversationSession()
  const engine = failingEngine(transportFor(OIL_NEWS, calls), session)

  const first = await engine.generate({ text: 'Why is oil up if the news is bearish?', context: CONTEXT })
  assert.ok(first.summary?.includes("What's moving"), 'the first turn was researched')
  assert.equal(calls.length, 1)

  const follow = await engine.generate({ text: 'Why is oil moving again?', context: CONTEXT })
  assert.equal(calls.length, 2, 'the driver follow-up runs the research tools again')
  assert.ok(/oil|brent/i.test(follow.answer ?? follow.summary ?? ''), 'the follow-up gets a fresh conversational synthesis')
})

test('D13 — a same-subject bullish/bearish follow-up runs fresh research again', async () => {
  const calls: WebSearchQuery[] = []
  const session = createConversationSession()
  const engine = failingEngine(transportFor(OIL_NEWS, calls), session)

  await engine.generate({ text: 'Why is oil up if the news is bearish?', context: CONTEXT })
  assert.equal(calls.length, 1)

  const follow = await engine.generate({ text: 'Is oil bullish rn?', context: CONTEXT })
  assert.equal(calls.length, 2, 'the bullish/bearish follow-up runs the research tools again')
  assert.ok(/oil|brent/i.test(follow.answer ?? follow.summary ?? ''), 'the follow-up gets a fresh conversational synthesis')
})

test('D14 — an explicit recap request answers from session memory and runs NO tools', async () => {
  const calls: WebSearchQuery[] = []
  const session = createConversationSession()
  const engine = failingEngine(transportFor(OIL_NEWS, calls), session)

  await engine.generate({ text: 'Why is oil up if the news is bearish?', context: CONTEXT })
  assert.equal(calls.length, 1)

  const recap = await engine.generate({ text: 'What did you say about oil above?', context: CONTEXT })
  assert.equal(calls.length, 1, 'an explicit recap runs no research tools')
  assert.ok(recap.title?.includes('What we know so far'), recap.title)
  assert.ok(recap.answer?.startsWith('The short version is'), 'the recap answers concisely')
  assert.equal(recap.partial, true)
})

test('D15 — every fallback response is free of internal markers, including memory recaps', async () => {
  const calls: WebSearchQuery[] = []
  const session = createConversationSession()
  const engine = failingEngine(transportFor(OIL_NEWS, calls), session)

  const first = await engine.generate({ text: 'Why is oil up if the news is bearish?', context: CONTEXT })
  const recap = await engine.generate({ text: 'What did you say about oil above?', context: CONTEXT })
  const drivers = await engine.generate({ text: 'Why is oil moving again?', context: CONTEXT })

  for (const [label, r] of [
    ['research synthesis', first],
    ['memory recap', recap],
    ['fresh driver synthesis', drivers],
  ] as const) {
    const text = renderedResponseText(r)
    const markers = internalMarkersIn(text)
    assert.deepEqual(markers, [], `${label} must be clean of internal markers`)
  }
})