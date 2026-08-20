import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentSession } from '../orchestrator'
import { createDefaultAnalystToolRegistry } from '../../tools/registry'
import { createDefaultToolContext } from '../../tools/context'
import { createMockProvider, createRuleMockProvider, toolCall } from '../mockProvider'
import type { LLMMessage, AgentConfig } from '../types'
import { ProviderError } from '../types'
import type { ToolContext } from '../../tools/types'
import { buildAnalystContext } from '../../buildContext'

const NOW = 1_720_000_000_000

function makeDeps(overrides: { config?: Partial<AgentConfig>; messages?: () => LLMMessage[] } = {}) {
  const registry = createDefaultAnalystToolRegistry()
  const toolContext = createDefaultToolContext(NOW)
  return {
    registry,
    toolContext,
    config: { ...overrides.config },
    context: buildAnalystContext(),
  }
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

test('orchestrator answers directly when the model returns a valid response', async () => {
  const deps = makeDeps()
  const provider = createMockProvider([{ kind: 'final', content: validJson() }])
  const output = await runAgentSession({ text: 'Why is NIFTY weak?', context: deps.context }, { ...deps, provider })
  assert.equal(output.response.title, 'Test answer')
  assert.equal(output.response.intent, 'explain')
  assert.equal(output.trace.filter((t) => t.kind === 'tool').length, 0)
})

test('orchestrator executes a tool call and feeds the result back', async () => {
  const deps = makeDeps()
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'Analyze NIFTY', context: deps.context }, { ...deps, provider })
  assert.equal(output.response.title, 'Test answer')
  const tools = output.trace.filter((t) => t.kind === 'tool')
  assert.equal(tools.length, 1)
  assert.equal(tools[0].tool, 'getTechnicalAnalysis')
  assert.equal(tools[0].ok, true)
})

test('orchestrator supports multiple sequential tool calls across rounds', async () => {
  const deps = makeDeps()
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('getMarketSnapshot', {})] },
    { kind: 'tool-calls', calls: [toolCall('getMarketBreadth', {})] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'What is happening in the market?', context: deps.context }, { ...deps, provider })
  const tools = output.trace.filter((t) => t.kind === 'tool').map((t) => t.tool)
  assert.deepEqual(tools, ['getMarketSnapshot', 'getMarketBreadth'])
})

test('orchestrator executes multiple tool calls in a single round', async () => {
  const deps = makeDeps()
  const provider = createMockProvider([
    {
      kind: 'tool-calls',
      calls: [toolCall('getMarketSnapshot', {}, 'a'), toolCall('getMarketBreadth', {}, 'b')],
    },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'Market now', context: deps.context }, { ...deps, provider })
  assert.equal(output.trace.filter((t) => t.kind === 'tool').length, 2)
})

test('orchestrator stops gracefully when max tool calls is exceeded', async () => {
  const deps = makeDeps({
    config: { maxToolCalls: 2, maxReasoningRounds: 10 },
  })
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('getMarketSnapshot', {})] },
    { kind: 'tool-calls', calls: [toolCall('getMarketBreadth', {})] },
    { kind: 'tool-calls', calls: [toolCall('analyzeSectors', {})] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'Everything', context: deps.context }, { ...deps, provider })
  const limit = output.trace.find((t) => t.kind === 'limit' && t.detail.includes('tool-calls'))
  assert.ok(limit, 'expected a tool-call limit trace')
  assert.equal(output.trace.filter((t) => t.kind === 'tool').length, 2)
  // Falls back to synthesis with the evidence gathered.
  assert.ok(output.response.sections && output.response.sections.length > 0)
  assert.equal(output.response.partial, true)
})

test('orchestrator stops gracefully when max reasoning rounds is exceeded', async () => {
  const deps = makeDeps({ config: { maxReasoningRounds: 2 } })
  const provider = createRuleMockProvider(() => ({
    kind: 'tool-calls',
    calls: [toolCall('getMarketSnapshot', {})],
  }))
  const output = await runAgentSession({ text: 'Keep asking', context: deps.context }, { ...deps, provider })
  assert.ok(output.response.partial === true)
  // Loop must terminate.
  assert.ok(output.trace.length > 0)
})

test('orchestrator retries transient provider errors, then throws so the engine can fall back', async () => {
  const deps = makeDeps()
  const provider = createMockProvider([
    { kind: 'error', errorKind: 'timeout' },
    { kind: 'error', errorKind: 'timeout' },
    { kind: 'error', errorKind: 'timeout' },
  ])
  await assert.rejects(
    () => runAgentSession({ text: 'hi', context: deps.context }, { ...deps, provider }),
    (err: unknown) => err instanceof ProviderError && err.kind === 'timeout',
  )
})

test('orchestrator recovers when a transient failure is followed by success', async () => {
  const deps = makeDeps()
  const provider = createMockProvider([
    { kind: 'error', errorKind: 'unavailable' },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'hi', context: deps.context }, { ...deps, provider })
  assert.equal(output.response.title, 'Test answer')
})

test('orchestrator handles unknown tool calls honestly', async () => {
  const deps = makeDeps()
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('doesNotExist', {})] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'hi', context: deps.context }, { ...deps, provider })
  const toolTrace = output.trace.find((t) => t.kind === 'tool' && t.tool === 'doesNotExist')
  assert.ok(toolTrace, 'unknown tool recorded')
  assert.equal(toolTrace.ok, false)
  assert.equal(output.response.title, 'Test answer')
})

test('orchestrator validates tool arguments via the registry (bad instrument → error result)', async () => {
  const deps = makeDeps()
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'NONEXISTENT' })] },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'Analyze the mystery stock', context: deps.context }, { ...deps, provider })
  const toolTrace = output.trace.find((t) => t.kind === 'tool' && t.tool === 'getTechnicalAnalysis')
  assert.ok(toolTrace, 'tool recorded')
  assert.equal(toolTrace.ok, false, 'tool must fail honestly for an unknown instrument')
})

test('orchestrator normalizes alias instruments to canonical ids', async () => {
  const deps = makeDeps()
  let seenArgs: unknown
  const provider = createRuleMockProvider(({ callCount }) => {
    if (callCount === 1) {
      return { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'Nifty 50' })] }
    }
    return { kind: 'final', content: validJson() }
  })
  const registry = createDefaultAnalystToolRegistry()
  // Capture the executed args by wrapping execute.
  const baseExecute = registry.execute.bind(registry)
  registry.execute = ((name: string, input: unknown, ctx: ToolContext) => {
    seenArgs = input
    return baseExecute(name, input, ctx)
  }) as typeof registry.execute

  await runAgentSession({ text: 'Analyze Nifty 50', context: deps.context }, { ...deps, provider, registry })
  assert.deepEqual(seenArgs, { instrument: 'nifty-50' })
})

test('orchestrator caches identical tool calls within a session', async () => {
  const deps = makeDeps()
  let executions = 0
  const registry = createDefaultAnalystToolRegistry()
  const baseExecute = registry.execute.bind(registry)
  registry.execute = ((name: string, input: unknown, ctx: ToolContext) => {
    executions += 1
    return baseExecute(name, input, ctx)
  }) as typeof registry.execute

  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' }, 'a')] },
    { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' }, 'b')] },
    { kind: 'final', content: validJson() },
  ])
  await runAgentSession({ text: 'Analyze NIFTY twice', context: deps.context }, { ...deps, provider, registry })
  assert.equal(executions, 1, 'duplicate tool call should hit the cache')
})

test('orchestrator validates the final response and rejects invalid JSON', async () => {
  const deps = makeDeps()
  const provider = createMockProvider([
    { kind: 'final', content: 'this is not json' },
    { kind: 'final', content: validJson() },
  ])
  const output = await runAgentSession({ text: 'hi', context: deps.context }, { ...deps, provider })
  assert.equal(output.response.title, 'Test answer', 'recovers via validation retry')
  assert.ok(output.trace.some((t) => t.kind === 'error' && t.detail.includes('non-json')))
})

test('orchestrator falls back to synthesis when validation retries are exhausted', async () => {
  const deps = makeDeps()
  const provider = createMockProvider([
    { kind: 'invalid', content: 'garbage' },
    { kind: 'invalid', content: 'garbage again' },
    { kind: 'invalid', content: 'garbage thrice' },
  ])
  const output = await runAgentSession({ text: 'hi', context: deps.context }, { ...deps, provider })
  assert.equal(output.response.partial, true)
  assert.ok(output.response.sections && output.response.sections.length > 0)
})

test('orchestrator passes recent conversation history to the provider', async () => {
  const deps = makeDeps()
  let seenMessages: LLMMessage[] = []
  const provider = createRuleMockProvider(({ request }) => {
    seenMessages = request.messages
    return { kind: 'final', content: validJson() }
  })
  const history = [
    {
      id: 'h1',
      intent: 'explain' as const,
      title: 'NIFTY 50 technical read',
      generatedAt: new Date(NOW).toISOString(),
    },
  ]
  await runAgentSession(
    { text: 'What about momentum?', context: deps.context, history },
    { ...deps, provider },
  )
  const joined = seenMessages.map((m) => m.content).join(' ')
  assert.ok(joined.includes('NIFTY 50 technical read'), 'history is included')
  assert.ok(joined.includes('What about momentum?'), 'current question is included')
})

test('orchestrator injects resolved instrument context so pronouns resolve', async () => {
  const deps = makeDeps()
  let systemMessages = ''
  const provider = createRuleMockProvider(({ request }) => {
    systemMessages = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join(' ')
    return { kind: 'final', content: validJson() }
  })
  const history = [
    {
      id: 'h1',
      intent: 'explain' as const,
      title: 'NIFTY 50 technical read',
      generatedAt: new Date(NOW).toISOString(),
    },
  ]
  await runAgentSession(
    { text: 'What about momentum?', context: deps.context, history },
    { ...deps, provider },
  )
  assert.ok(systemMessages.includes('nifty-50'), 'history entity resolved into context')
})