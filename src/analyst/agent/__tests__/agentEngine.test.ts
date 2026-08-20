import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAgentAnalystEngine } from '../agentEngine'
import { createMockProvider, createRuleMockProvider, toolCall } from '../mockProvider'
import { createDefaultAnalystToolRegistry } from '../../tools/registry'
import { createDefaultToolContext } from '../../tools/context'
import { buildAnalystContext } from '../../buildContext'
import type { AnalystEngine } from '../../engine'
import { localAnalystEngine } from '../../engine'
import { validateStructuredResponse } from '../responseValidator'

const CONTEXT = buildAnalystContext()
const NOW = 1_720_000_000_000

function validJson(title = 'LLM answer') {
  return JSON.stringify({
    intent: 'explain',
    title,
    summary: 'Answer from the reasoning layer.',
    sections: [{ heading: 'Evidence', kind: 'fact', body: 'Tool evidence.' }],
    findings: [{ kind: 'fact', title: 'Trend', detail: 'up' }],
    confidence: 'High',
  })
}

test('agent engine returns a validated AnalystResponse via the LLM path', async () => {
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [{ id: 'c', name: 'getMarketSnapshot', arguments: {} }] },
    { kind: 'final', content: validJson('LLM answer') },
  ])
  const engine = createAgentAnalystEngine({
    provider,
    registry: createDefaultAnalystToolRegistry(),
    toolContext: createDefaultToolContext(NOW),
  })
  const response = await engine.generate({ text: 'What is happening?', context: CONTEXT })
  assert.equal(response.title, 'LLM answer')
  const validation = validateStructuredResponse(response)
  assert.equal(validation.ok, true)
})

test('agent engine falls back to the deterministic engine when the provider fails', async () => {
  const provider = createMockProvider([{ kind: 'error', errorKind: 'unavailable' }])
  const fallbackCalls: string[] = []
  const fallback: AnalystEngine = {
    async generate(input) {
      fallbackCalls.push(input.text)
      return localAnalystEngine.generate(input)
    },
    insights: localAnalystEngine.insights,
    suggest: localAnalystEngine.suggest,
  }
  const engine = createAgentAnalystEngine({
    provider,
    registry: createDefaultAnalystToolRegistry(),
    toolContext: createDefaultToolContext(NOW),
    fallback,
  })
  const response = await engine.generate({ text: 'Why is NIFTY weak?', context: CONTEXT })
  assert.deepEqual(fallbackCalls, ['Why is NIFTY weak?'])
  assert.equal(response.intent, 'explain', 'deterministic engine produced an explain response')
  const validation = validateStructuredResponse(response)
  assert.equal(validation.ok, true)
})

test('agent engine insights and suggest delegate to the deterministic engine', () => {
  const engine = createAgentAnalystEngine({
    provider: createMockProvider([{ kind: 'final', content: validJson() }]),
    registry: createDefaultAnalystToolRegistry(),
    toolContext: createDefaultToolContext(NOW),
  })
  const insights = engine.insights(CONTEXT)
  assert.ok(Array.isArray(insights))
  const suggestions = engine.suggest(CONTEXT)
  assert.ok(Array.isArray(suggestions) && suggestions.length > 0)
})

test('agent engine validates that provider failures never throw to the caller', async () => {
  const provider = {
    name: 'always-throws',
    async generate() {
      throw new Error('boom')
    },
  }
  const engine = createAgentAnalystEngine({
    provider,
    registry: createDefaultAnalystToolRegistry(),
    toolContext: createDefaultToolContext(NOW),
    fallback: localAnalystEngine,
  })
  const response = await engine.generate({ text: 'hi', context: CONTEXT })
  assert.ok(response.title.length > 0)
})

// --- Phase 3C.1 — engine search wiring ---------------------------------------

test('agent engine offers and executes searchWeb when a search transport is wired', async () => {
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'NIFTY news' })] },
    { kind: 'final', content: validJson('Engine web answer') },
  ])
  const engine = createAgentAnalystEngine({
    provider,
    registry: createDefaultAnalystToolRegistry(),
    toolContext: createDefaultToolContext(NOW),
    search: {
      transport: {
        async search() {
          return {
            query: 'NIFTY news',
            provider: 'tavily',
            results: [
              {
                title: 'Real headline',
                url: 'https://news.example.com/a',
                snippet: 'Body.',
                source: 'news.example.com',
                publishedAt: null,
                provider: 'tavily',
              },
            ],
            totalResults: 1,
            truncated: false,
          }
        },
      },
    },
  })
  const response = await engine.generate({ text: 'What is the news on NIFTY?', context: CONTEXT })
  assert.equal(response.title, 'Engine web answer')
  assert.equal(response.sources?.length, 1, 'real web evidence reaches the engine response')
  assert.equal(response.sources![0].url, 'https://news.example.com/a')
})

test('agent engine does not offer searchWeb when no search transport exists', async () => {
  const seenTools: string[] = []
  const provider = createRuleMockProvider(({ request }) => {
    seenTools.push(...(request.tools ?? []).map((t) => t.name))
    return { kind: 'final', content: validJson('No web') }
  })
  const engine = createAgentAnalystEngine({
    provider,
    registry: createDefaultAnalystToolRegistry(),
    toolContext: createDefaultToolContext(NOW),
    search: null,
  })
  const response = await engine.generate({ text: 'hi', context: CONTEXT })
  assert.equal(response.title, 'No web')
  assert.ok(!seenTools.includes('searchWeb'), 'no transport -> searchWeb is not offered')
  assert.ok(seenTools.includes('getMarketSnapshot'), 'the 12 Finova tools are still offered')
})