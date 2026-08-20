import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentSession } from '../orchestrator'
import { createDefaultAnalystToolRegistry } from '../../tools/registry'
import { createDefaultToolContext } from '../../tools/context'
import { createMockProvider, createRuleMockProvider, toolCall } from '../mockProvider'
import { buildAnalystContext } from '../../buildContext'
import type { WebSearchResponse, WebSearchResult } from '../../websearch/types'
import { SearchTransportError } from '../../websearch/transport'

const NOW = 1_720_000_000_000

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

function result(url: string, title = 'Headline'): WebSearchResult {
  return { title, url, snippet: 'Body text.', source: new URL(url).hostname, publishedAt: null, provider: 'tavily' }
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

test('webSearch: searchWeb is executed through the transport and sources are attached', async () => {
  const searches: string[] = []
  const deps = makeDeps(async (q) => {
    searches.push(q)
    return {
      query: q,
      provider: 'tavily',
      results: [result('https://news.example.com/a'), result('https://news.example.com/b')],
      totalResults: 2,
      truncated: false,
    }
  })
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'NIFTY news' })] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'What is the news on NIFTY?', context: deps.context }, { ...deps, provider })
  assert.deepEqual(searches, ['NIFTY news'])
  assert.equal(output.response.title, 'Test answer')
  const toolTrace = output.trace.find((t) => t.kind === 'tool' && t.tool === 'searchWeb')
  assert.ok(toolTrace)
  assert.equal(toolTrace.ok, true)
  assert.equal(toolTrace.detail, 'available=true, results=2')
  assert.ok(output.response.sources, 'validated sources attached to the final response')
  assert.equal(output.response.sources!.length, 2)
  assert.equal(output.response.sources![0].url, 'https://news.example.com/a')
})

test('webSearch: searchWeb is only offered when the session has a transport', async () => {
  let seenTools: string[] = []
  const deps = makeDeps()
  const provider = createRuleMockProvider(({ request }) => {
    seenTools = (request.tools ?? []).map((t) => t.name)
    return { kind: 'final', content: validJson() }
  })
  await runAgentSession({ text: 'hi', context: deps.context }, { ...deps, provider })
  assert.ok(!seenTools.includes('searchWeb'), 'no transport -> no searchWeb in the catalog')
  assert.ok(seenTools.includes('getMarketSnapshot'), 'the 12 Finova tools are still offered')

  const withSearch = makeDeps(async () => ({ query: 'q', provider: 'tavily', results: [], totalResults: 0, truncated: false }))
  const provider2 = createRuleMockProvider(({ request }) => {
    seenTools = (request.tools ?? []).map((t) => t.name)
    return { kind: 'final', content: validJson() }
  })
  await runAgentSession({ text: 'hi', context: deps.context }, { ...withSearch, provider: provider2 })
  assert.ok(seenTools.includes('searchWeb'), 'transport present -> searchWeb offered')
})

test('webSearch: session budget (4) is enforced and reported honestly', async () => {
  let calls = 0
  const deps = makeDeps(async (q) => {
    calls += 1
    return { query: q, provider: 'tavily', results: [result(`https://news.example.com/${calls}`)], totalResults: 1, truncated: false }
  })
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'q1' }, 'a')] },
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'q2' }, 'b')] },
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'q3' }, 'c')] },
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'q4' }, 'd')] },
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'q5' }, 'e')] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'search many times', context: deps.context }, { ...deps, provider })
  assert.equal(calls, 4, 'approved limit: at most 4 web searches per session')
  const limited = output.trace.find((t) => t.kind === 'tool' && t.tool === 'searchWeb' && t.detail.includes('session-limit'))
  assert.ok(limited, 'the 5th search is blocked, not executed')
  assert.equal(output.response.sources!.length, 4)
})

test('webSearch: transport failures are honest errors the model can recover from', async () => {
  const deps = makeDeps(async () => {
    throw new SearchTransportError('timeout', 'The search gateway timed out after 30000ms.')
  })
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'q' })] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'news?', context: deps.context }, { ...deps, provider })
  const toolTrace = output.trace.find((t) => t.kind === 'tool' && t.tool === 'searchWeb')
  assert.ok(toolTrace)
  assert.equal(toolTrace.ok, false)
  assert.equal(toolTrace.detail, 'transport-error: timeout')
  assert.ok(!output.response.sources, 'no evidence, no fabricated sources')
  assert.equal(output.response.title, 'Test answer', 'LLM continued after the honest failure')
})

test('webSearch: no results is reported honestly, never fabricated', async () => {
  const deps = makeDeps(async () => ({ query: 'q', provider: 'tavily', results: [], totalResults: 0, truncated: false }))
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'q' })] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'news?', context: deps.context }, { ...deps, provider })
  const toolTrace = output.trace.find((t) => t.kind === 'tool' && t.tool === 'searchWeb')
  assert.equal(toolTrace?.detail, 'available=true, results=0')
  assert.ok(!output.response.sources || output.response.sources.length === 0)
})

test('webSearch: untrusted transport shapes are filtered before becoming evidence', async () => {
  const deps = makeDeps(async () => ({
    query: 'q',
    provider: 'tavily',
    results: [
      result('https://news.example.com/a'),
      { title: 'Bad', url: 'javascript:alert(1)', snippet: 'x', source: '', publishedAt: null, provider: 'tavily' },
    ],
    totalResults: 2,
    truncated: false,
  }))
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'q' })] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'news?', context: deps.context }, { ...deps, provider })
  assert.equal(output.response.sources!.length, 1)
  assert.equal(output.response.sources![0].url, 'https://news.example.com/a')
})

test('webSearch: synthesized fallback responses include the validated sources', async () => {
  const deps = makeDeps(async () => ({
    query: 'q',
    provider: 'tavily',
    results: [result('https://news.example.com/a', 'Real headline')],
    totalResults: 1,
    truncated: false,
  }))
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'q' })] },
    { kind: 'invalid', content: 'garbage' },
    { kind: 'invalid', content: 'garbage again' },
  ])
  const output = await runAgentSession({ text: 'news?', context: deps.context }, { ...deps, provider })
  assert.equal(output.response.partial, true)
  assert.ok(output.response.sources, 'synthesized response carries the real sources')
  assert.equal(output.response.sources![0].url, 'https://news.example.com/a')
  const webSection = output.response.sections?.find((s) => s.heading === 'Web evidence')
  assert.ok(webSection, 'synthesis surfaces the web evidence section')
  assert.ok(webSection!.bullets?.some((b) => b.includes('Real headline')), 'compressed citation, no URL dump in prose')
  assert.ok(!JSON.stringify(webSection).includes('searchWeb'), 'no raw tool name in the evidence section')
})

test('webSearch: searchWeb counts toward the authoritative 12 tool-call budget', async () => {
  const deps = makeDeps(async () => ({ query: 'q', provider: 'tavily', results: [result('https://news.example.com/x')], totalResults: 1, truncated: false }))
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'q' })] },
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'q2' })] },
    { kind: 'tool-calls', calls: [toolCall('getMarketSnapshot', {})] },
    { kind: 'final', content: validJson() },
  ])
  const tight = makeDeps(async () => ({ query: 'q', provider: 'tavily', results: [], totalResults: 0, truncated: false }))
  const output = await runAgentSession(
    { text: 'everything', context: deps.context },
    { ...tight, provider, config: { maxToolCalls: 2 } },
  )
  const limit = output.trace.find((t) => t.kind === 'limit' && t.detail.includes('tool-calls'))
  assert.ok(limit, 'tool-call limit stays authoritative for searchWeb')
  assert.equal(output.trace.filter((t) => t.kind === 'tool').length, 2)
})

test('webSearch: duplicate queries within one request are deduplicated by the session cache', async () => {
  let calls = 0
  const deps = makeDeps(async (q) => {
    calls += 1
    return { query: q, provider: 'tavily', results: [result(`https://news.example.com/${calls}`)], totalResults: 1, truncated: false }
  })
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'NIFTY news' }, 'a')] },
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'nifty news' }, 'b')] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'news twice', context: deps.context }, { ...deps, provider })
  assert.equal(calls, 1, 'the second equivalent search is served from the session cache, not Tavily')
  assert.equal(output.response.sources!.length, 1, 'one real source, no duplication')
})

test('webSearch: a session cache hit surfaces the cached flag to the model honestly', async () => {
  const deps = makeDeps(async () => ({ query: 'q', provider: 'tavily', results: [result('https://news.example.com/x')], totalResults: 1, truncated: false }))
  const provider = createRuleMockProvider(({ request, callCount }) => {
    if (callCount === 1) return { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'NIFTY news' }, 'a')] }
    if (callCount === 2) return { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'nifty news' }, 'b')] }
    const toolMsgs = request.messages.filter((m) => m.role === 'tool').map((m) => m.content).join(' ')
    assert.ok(toolMsgs.includes('"cached":true'), 'the session cache hit is reported to the model')
    return { kind: 'final', content: validJson() }
  })
  await runAgentSession({ text: 'news twice', context: deps.context }, { ...deps, provider })
})

// --- Golden agent scenarios (Phase 3C.1) -----------------------------------
// The agent is intentionally dynamic: these tests validate evidence coverage
// and response quality, NOT exact tool-call sequences.

test('GOLDEN 1 — Finova-only question: no web search needed, valid response, no external sources', async () => {
  const deps = makeDeps(async () => ({ query: 'q', provider: 'tavily', results: [], totalResults: 0, truncated: false }))
  const provider = createRuleMockProvider(({ request }) => {
    const tools = (request.tools ?? []).map((t) => t.name)
    assert.ok(tools.includes('searchWeb'), 'searchWeb is offered because a transport exists')
    return { kind: 'final', content: validJson('explain', 'NIFTY 50 regime') }
  })
  const output = await runAgentSession(
    { text: 'Describe the current NIFTY 50 market regime.', context: deps.context },
    { ...deps, provider },
  )
  assert.equal(output.response.title, 'NIFTY 50 regime')
  const searchTrace = output.trace.filter((t) => t.kind === 'tool' && t.tool === 'searchWeb')
  assert.equal(searchTrace.length, 0, 'the model answered from Finova evidence alone')
  assert.ok(!output.response.sources || output.response.sources.length === 0, 'no external sources in a Finova-only answer')
})

test('GOLDEN 2 — market question needing external context: web evidence used, sources preserved', async () => {
  const deps = makeDeps(async () => ({
    query: 'RBI interest rate decision',
    provider: 'tavily',
    results: [
      result('https://news.example.com/rbi', 'RBI announces rate decision'),
      result('https://news.example.com/fpi', 'FPI flows update'),
    ],
    totalResults: 2,
    truncated: false,
  }))
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'RBI interest rate decision' })] },
    { kind: 'final', content: validJson('explain', 'What the RBI decision means') },
  ])
  const output = await runAgentSession(
    { text: 'What did the RBI decide at the latest meeting?', context: deps.context },
    { ...deps, provider },
  )
  assert.equal(output.response.title, 'What the RBI decision means')
  assert.ok(output.response.sources, 'web evidence is attached to the response')
  assert.equal(output.response.sources!.length, 2)
  assert.equal(output.response.sources![0].url, 'https://news.example.com/rbi')
  assert.equal(output.response.sources![1].source, 'news.example.com')
})

test('GOLDEN 3 — company question: multiple justified searches combine with Finova evidence', async () => {
  let calls = 0
  const deps = makeDeps(async () => {
    calls += 1
    return {
      query: `TCS search ${calls}`,
      provider: 'tavily',
      results: [result(`https://news.example.com/tcs-${calls}`, `TCS news ${calls}`)],
      totalResults: 1,
      truncated: false,
    }
  })
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'TCS Q3 results' }, 's1')] },
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'TCS analyst views' }, 's2')] },
    { kind: 'tool-calls', calls: [toolCall('getMarketSnapshot', {})] },
    { kind: 'final', content: validJson('explain', 'TCS across news and the market') },
  ])
  const output = await runAgentSession(
    { text: 'What is happening with TCS right now?', context: deps.context },
    { ...deps, provider },
  )
  assert.equal(calls, 2, 'both justified searches were executed')
  const tools = output.trace.filter((t) => t.kind === 'tool').map((t) => t.tool)
  assert.equal(tools.filter((t) => t === 'searchWeb').length, 2, 'multiple searches occur when justified')
  assert.ok(tools.includes('getMarketSnapshot'), 'Finova market evidence is still combined with web evidence')
  assert.equal(output.response.sources!.length, 2, 'every search contributed real, preserved sources')
})

test('GOLDEN 4 — conflicting web sources: disagreement is represented honestly, never resolved silently', async () => {
  const deps = makeDeps(async () => ({
    query: 'TCS results debate',
    provider: 'tavily',
    results: [
      result('https://bull.example.com/story', 'Analyst raises target on strong results'),
      result('https://bear.example.com/story', 'Warning signs cited in the same report'),
    ],
    totalResults: 2,
    truncated: false,
  }))
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'TCS quarterly results debate' })] },
    {
      kind: 'final',
      content: JSON.stringify({
        intent: 'explain',
        title: 'Mixed read on TCS',
        summary:
          'Web sources disagree: one flags strong results, another flags warning signs. The disagreement is reported without picking a winner.',
        sections: [
          { heading: 'What the bullish source says', kind: 'fact', body: 'An analyst raised the target on strong results.' },
          { heading: 'What the bearish source says', kind: 'fact', body: 'Warning signs were cited in the same report.' },
        ],
        findings: [{ kind: 'fact', title: 'Disagreement', detail: 'The two sources draw opposite conclusions from the same report.' }],
        confidence: 'Low',
      }),
    },
  ])
  const output = await runAgentSession(
    { text: 'Is TCS doing well right now?', context: deps.context },
    { ...deps, provider },
  )
  const text = JSON.stringify(output.response).toLowerCase()
  assert.ok(text.includes('bullish') && text.includes('bearish'), 'both sides of the disagreement are represented')
  assert.ok(output.response.summary?.includes('disagree'), 'the disagreement is named, not hidden')
  assert.ok(text.includes('without picking a winner'), 'no silent resolution is claimed')
  assert.equal(output.response.confidence, 'Low', 'conflicting evidence is not overstated')
  assert.equal(output.response.sources!.length, 2, 'both conflicting sources are preserved as evidence')
})

test('GOLDEN 5 — provider unavailable: honest Finova-based answer, no fabricated sources or web claims', async () => {
  const deps = makeDeps(async () => {
    throw new SearchTransportError('provider-not-configured', 'Web search is not configured on the server.')
  })
  const provider = createRuleMockProvider(({ request, callCount }) => {
    if (callCount === 1) return { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'NIFTY news' })] }
    if (callCount === 2) {
      const toolMsgs = request.messages.filter((m) => m.role === 'tool').map((m) => m.content).join(' ')
      assert.ok(toolMsgs.includes('not configured'), 'the model was told the web search failed, honestly')
      return { kind: 'tool-calls', calls: [toolCall('getMarketSnapshot', {})] }
    }
    return { kind: 'final', content: validJson('explain', 'NIFTY from Finova evidence only') }
  })
  const output = await runAgentSession(
    { text: 'What is moving NIFTY today?', context: deps.context },
    { ...deps, provider },
  )
  const searchTrace = output.trace.find((t) => t.kind === 'tool' && t.tool === 'searchWeb')
  assert.ok(searchTrace, 'the web attempt happened')
  assert.equal(searchTrace!.ok, false, 'the web failure is reported honestly')
  assert.equal(searchTrace!.detail, 'transport-error: provider-not-configured')
  assert.ok(output.trace.some((t) => t.kind === 'tool' && t.tool === 'getMarketSnapshot'), 'the agent fell back to Finova evidence')
  assert.ok(!output.response.sources || output.response.sources.length === 0, 'no fabricated sources')
  assert.equal(output.response.title, 'NIFTY from Finova evidence only')
})