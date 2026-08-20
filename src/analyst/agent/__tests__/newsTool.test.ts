// ---------------------------------------------------------------------------
// Phase 3N.1 — Live Intelligence: searchNews orchestration tests
//
// The agent-loop level of the news capability, mirroring the searchWeb test
// conventions:
//   - searchNews runs through the SAME session transport, with a deterministic
//     query built from the model's subject (the model never writes queries);
//   - its processed items become real evidence (attached to response sources
//     and conversation memory) with freshness/source tiers and corroboration;
//   - it has its own approved per-session budget (4) SEPARATE from searchWeb's;
//   - failures and empty results are reported honestly, never fabricated;
//   - untrusted transport shapes are filtered before they become evidence.
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentSession } from '../orchestrator'
import { createDefaultAnalystToolRegistry } from '../../tools/registry'
import { createDefaultToolContext } from '../../tools/context'
import { createMockProvider, createRuleMockProvider, toolCall } from '../mockProvider'
import { buildAnalystContext } from '../../buildContext'
import { createConversationSession } from '../../conversation/session'
import type { WebSearchResponse, WebSearchResult } from '../../websearch/types'
import { SearchTransportError } from '../../websearch/transport'

const NOW = 1_720_000_000_000
const HOUR = 3_600_000

function makeDeps(search?: (query: string) => Promise<WebSearchResponse>) {
  const registry = createDefaultAnalystToolRegistry()
  const toolContext = createDefaultToolContext(NOW)
  const searchDeps = search
    ? {
        transport: {
          search: async (q: { query: string }) => search(q.query),
        },
      }
    : undefined
  return {
    registry,
    toolContext,
    config: {},
    context: buildAnalystContext(),
    search: searchDeps,
  }
}

function result(url: string, title: string, publishedAt: string | null = null): WebSearchResult {
  return { title, url, snippet: 'Body text.', source: new URL(url).hostname, publishedAt, provider: 'tavily' }
}

function validJson(intent = 'explain', title = 'Test answer') {
  return JSON.stringify({
    intent,
    title,
    summary: 'A synthesized answer.',
    sections: [{ heading: 'Evidence', kind: 'fact', body: 'The tool said so.' }],
    findings: [{ kind: 'fact', title: 'Trend', detail: 'up' }],
    confidence: 'High',
  })
}

test('news: searchNews builds the query deterministically and attaches news evidence', async () => {
  const queries: string[] = []
  const deps = makeDeps(async (q) => {
    queries.push(q)
    return {
      query: q,
      provider: 'tavily',
      results: [
        result('https://reuters.com/a', 'RBI holds rates steady', new Date(NOW - 2 * HOUR).toISOString()),
        result('https://moneycontrol.com/b', 'RBI holds rates steady', new Date(NOW - 3 * HOUR).toISOString()),
      ],
      totalResults: 2,
      truncated: false,
    }
  })
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'RBI interest rate decision', region: 'in' })] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'What is happening with RBI rates?', context: deps.context }, { ...deps, provider })
  assert.deepEqual(queries, ['RBI interest rate decision India news'], 'the module, not the model, writes the query')
  assert.equal(output.response.title, 'Test answer')
  const trace = output.trace.find((t) => t.kind === 'tool' && t.tool === 'searchNews')
  assert.ok(trace)
  assert.equal(trace.ok, true)
  assert.equal(trace.detail, 'available=true, items=1', 'two articles clustered into one corroborated story')
  assert.ok(output.response.sources, 'news evidence attached to the response')
  assert.equal(output.response.sources!.length, 1)
  const item = output.response.sources![0] as WebSearchResult & { freshness?: string; corroboratedBy?: number }
  assert.equal(item.freshness, 'breaking')
  assert.equal(item.corroboratedBy, 2)
  assert.equal(item.source, 'reuters.com')
})

test('news: searchNews is only offered when the session has a transport', async () => {
  let seenTools: string[] = []
  const provider = createRuleMockProvider(({ request }) => {
    seenTools = (request.tools ?? []).map((t) => t.name)
    return { kind: 'final', content: validJson() }
  })
  await runAgentSession({ text: 'hi', context: makeDeps().context }, { ...makeDeps(), provider })
  assert.ok(!seenTools.includes('searchNews'), 'no transport -> no searchNews in the catalog')
  assert.ok(!seenTools.includes('searchWeb'), 'no transport -> no searchWeb in the catalog')

  const withSearch = makeDeps(async () => ({ query: 'q', provider: 'tavily', results: [], totalResults: 0, truncated: false }))
  const provider2 = createRuleMockProvider(({ request }) => {
    seenTools = (request.tools ?? []).map((t) => t.name)
    return { kind: 'final', content: validJson() }
  })
  await runAgentSession({ text: 'hi', context: withSearch.context }, { ...withSearch, provider: provider2 })
  assert.ok(seenTools.includes('searchNews'), 'transport present -> searchNews offered')
})

test('news: its own session budget (4) is enforced and reported honestly', async () => {
  let calls = 0
  const deps = makeDeps(async () => {
    calls += 1
    return { query: `q${calls}`, provider: 'tavily', results: [result(`https://reuters.com/${calls}`, `Story ${calls}`)], totalResults: 1, truncated: false }
  })
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'a' }, 'a')] },
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'b' }, 'b')] },
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'c' }, 'c')] },
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'd' }, 'd')] },
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'e' }, 'e')] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'news many times', context: deps.context }, { ...deps, provider })
  assert.equal(calls, 4, 'approved limit: at most 4 news searches per session')
  const limited = output.trace.find((t) => t.kind === 'tool' && t.tool === 'searchNews' && t.detail.includes('news-session-limit'))
  assert.ok(limited, 'the 5th news search is blocked, not executed')
  assert.equal(output.response.sources!.length, 4)
})

test('news: the news budget is separate from the web-search budget', async () => {
  let calls = 0
  const deps = makeDeps(async () => {
    calls += 1
    return { query: `q${calls}`, provider: 'tavily', results: [result(`https://reuters.com/${calls}`, `Story ${calls}`)], totalResults: 1, truncated: false }
  })
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'a' }, 'n1')] },
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'b' }, 'n2')] },
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'w1' }, 'w1')] },
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'w2' }, 'w2')] },
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'c' }, 'n3')] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'everything', context: deps.context }, { ...deps, provider })
  assert.equal(calls, 5, '4 news + 4 web budgets are independent')
  const newsCalls = output.trace.filter((t) => t.kind === 'tool' && t.tool === 'searchNews').length
  const webCalls = output.trace.filter((t) => t.kind === 'tool' && t.tool === 'searchWeb').length
  assert.equal(newsCalls, 3)
  assert.equal(webCalls, 2)
})

test('news: transport failures are honest errors, never fabricated headlines', async () => {
  const deps = makeDeps(async () => {
    throw new SearchTransportError('timeout', 'The search gateway timed out after 30000ms.')
  })
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'TCS' })] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'TCS news?', context: deps.context }, { ...deps, provider })
  const trace = output.trace.find((t) => t.kind === 'tool' && t.tool === 'searchNews')
  assert.ok(trace)
  assert.equal(trace.ok, false)
  assert.equal(trace.detail, 'transport-error: timeout')
  assert.ok(!output.response.sources, 'no evidence, no fabricated sources')
})

test('news: no results is reported honestly', async () => {
  const deps = makeDeps(async () => ({ query: 'q', provider: 'tavily', results: [], totalResults: 0, truncated: false }))
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'TCS' })] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'TCS news?', context: deps.context }, { ...deps, provider })
  const trace = output.trace.find((t) => t.kind === 'tool' && t.tool === 'searchNews')
  assert.equal(trace?.detail, 'available=true, items=0')
  assert.ok(!output.response.sources || output.response.sources.length === 0)
})

test('news: untrusted transport shapes are filtered before becoming evidence', async () => {
  const deps = makeDeps(async () => ({
    query: 'q',
    provider: 'tavily',
    results: [
      result('https://reuters.com/a', 'Real headline'),
      { title: 'Bad', url: 'javascript:alert(1)', snippet: 'x', source: '', publishedAt: null, provider: 'tavily' },
    ],
    totalResults: 2,
    truncated: false,
  }))
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'TCS' })] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'TCS news?', context: deps.context }, { ...deps, provider })
  assert.equal(output.response.sources!.length, 1)
  assert.equal(output.response.sources![0].url, 'https://reuters.com/a')
})

test('news: duplicate subjects within one request are deduplicated by the session cache', async () => {
  let calls = 0
  const deps = makeDeps(async (q) => {
    calls += 1
    return { query: q, provider: 'tavily', results: [result(`https://reuters.com/${calls}`, `Story ${calls}`)], totalResults: 1, truncated: false }
  })
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'RBI rates' }, 'n1')] },
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'RBI rates' }, 'n2')] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'rates twice', context: deps.context }, { ...deps, provider })
  assert.equal(calls, 1, 'the repeated subject is served from the session cache, not Tavily')
  assert.equal(output.response.sources!.length, 1, 'one real story, no duplication')
})

test('news: invalid searchNews arguments are rejected, not clamped', async () => {
  let calls = 0
  const deps = makeDeps(async () => {
    calls += 1
    return { query: 'q', provider: 'tavily', results: [], totalResults: 0, truncated: false }
  })
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: '', region: 'eu' })] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'news?', context: deps.context }, { ...deps, provider })
  const trace = output.trace.find((t) => t.kind === 'tool' && t.tool === 'searchNews')
  assert.equal(trace?.ok, false)
  assert.equal(trace?.detail, 'invalid-input')
  assert.equal(calls, 0, 'no transport call happened for invalid input')
})

test('news: news evidence lands in conversation memory with freshness signals', async () => {
  const deps = makeDeps(async () => ({
    query: 'TCS news',
    provider: 'tavily',
    results: [
      result('https://reuters.com/tcs', 'TCS announces Q3 results', new Date(NOW - 2 * HOUR).toISOString()),
      result('https://moneycontrol.com/tcs', 'TCS announces Q3 results', new Date(NOW - 3 * HOUR).toISOString()),
    ],
    totalResults: 2,
    truncated: false,
  }))
  const conversation = createConversationSession({}, NOW)
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'TCS' })] },
    { kind: 'final', content: validJson('explain', 'TCS results') },
  ])
  await runAgentSession({ text: 'What is happening with TCS?', context: deps.context }, { ...deps, provider, conversation })

  assert.equal(conversation.state.recentNews.length, 1, 'one corroborated story remembered')
  const news = conversation.state.recentNews[0]
  assert.equal(news.headline, 'TCS announces Q3 results')
  assert.equal(news.newsFreshness, 'breaking')
  assert.equal(news.corroborated, true)

  const next = conversation.resolve('What does that mean for the stock?', NOW)
  assert.ok(next.payload.includes('Recent news'), 'the context payload carries the news section')
  assert.ok(next.payload.includes('TCS announces Q3 results'), 'the headline is in the payload')
  assert.ok(next.payload.includes('multiple outlets'), 'corroboration is surfaced to the model')
})

test('news: the news tool result tells the model what it returned', async () => {
  const deps = makeDeps(async () => ({
    query: 'TCS news',
    provider: 'tavily',
    results: [result('https://reuters.com/tcs', 'TCS announces Q3 results')],
    totalResults: 1,
    truncated: false,
  }))
  const provider = createRuleMockProvider(({ request, callCount }) => {
    if (callCount === 1) return { kind: 'tool-calls', calls: [toolCall('searchNews', { subject: 'TCS' })] }
    const toolMsgs = request.messages.filter((m) => m.role === 'tool').map((m) => m.content).join(' ')
    assert.ok(toolMsgs.includes('searchNews'), 'the tool message names the news tool')
    assert.ok(toolMsgs.includes('freshness'), 'freshness signal is visible to the model')
    assert.ok(toolMsgs.includes('corroboratedBy'), 'corroboration is visible to the model')
    return { kind: 'final', content: validJson() }
  })
  await runAgentSession({ text: 'TCS news?', context: deps.context }, { ...deps, provider })
})