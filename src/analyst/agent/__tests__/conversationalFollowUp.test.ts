// ---------------------------------------------------------------------------
// Phase 3A — conversational entity/context resolution regression tests.
//
// Covers the follow-up chain: "Why is NIFTY weak?" -> "Why?" / "What
// evidence supports that?" / "Which Finova tool showed that?" / "Actually,
// I meant TCS". Verifies that follow-up turns (a) resolve against session
// memory in the LLM path, (b) answer from recorded evidence with provenance
// in the deterministic fallback path, and (c) never fabricate tools or
// values in either path.
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAgentAnalystEngine } from '../agentEngine'
import { createConversationAwareFallback } from '../conversationFallback'
import { createMockProvider, createRuleMockProvider, toolCall } from '../mockProvider'
import { createDefaultAnalystToolRegistry } from '../../tools/registry'
import { createDefaultToolContext } from '../../tools/context'
import { buildAnalystContext } from '../../buildContext'
import { createConversationSession } from '../../conversation/session'
import type { AnalystEngine } from '../../engine'
import { validateStructuredResponse } from '../responseValidator'

const NOW = 1_720_000_000_000
const REGISTRY = createDefaultAnalystToolRegistry()
const TOOL_CTX = createDefaultToolContext(NOW)
const CONTEXT = buildAnalystContext()

function finalResponse(title: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    intent: 'explain',
    title,
    summary: 'Synthesized answer from gathered evidence.',
    sections: [{ heading: 'Evidence', kind: 'fact', body: 'Based on the tools consulted.' }],
    findings: [{ kind: 'inference', title: 'Read', detail: 'Interpretation of evidence.' }],
    confidence: 'Medium',
    ...overrides,
  })
}

function fullPrompt(request: { system: string; messages: Array<{ content: string }> }): string {
  return [request.system, ...request.messages.map((m) => m.content)].join('\n')
}

function evidenceToolResult() {
  return {
    ok: true,
    data: { rsi: 54.2 },
    error: null,
    metadata: {
      tool: 'getTechnicalAnalysis',
      timestamp: new Date(NOW).toISOString(),
      source: 'technical-engine' as const,
      available: true,
      warnings: [],
    },
  }
}

// --- LLM path: follow-ups resolve against session memory ---------------------

test('A — follow-up "Why?" carries the active topic into the LLM context', async () => {
  const session = createConversationSession({}, NOW)
  const provider = createRuleMockProvider(({ callCount, request }) => {
    if (callCount === 1) {
      return { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] }
    }
    if (callCount === 2) return { kind: 'final', content: finalResponse('Turn 1') }
    const prompt = fullPrompt(request)
    assert.ok(prompt.includes('Active topic: nifty-50'), 'turn 2 context names the active topic')
    return { kind: 'final', content: finalResponse('Follow-up answer') }
  })
  const engine = createAgentAnalystEngine({
    provider,
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    conversation: session,
  })

  await engine.generate({ text: 'Why is NIFTY weak?', context: CONTEXT, history: [] })
  const r2 = await engine.generate({ text: 'Why?', context: CONTEXT, history: [] })
  assert.equal(r2.title, 'Follow-up answer')
  assert.equal(session.state.activeTopic, 'nifty-50')
})

test('B — follow-up re-runs tools and attributes evidence to the resolved instrument', async () => {
  const session = createConversationSession({}, NOW)
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] },
    { kind: 'final', content: finalResponse('Turn 1') },
    { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] },
    { kind: 'final', content: finalResponse('Turn 2') },
  ])
  const engine = createAgentAnalystEngine({
    provider,
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    conversation: session,
  })

  await engine.generate({ text: 'Why is NIFTY weak?', context: CONTEXT })
  await engine.generate({ text: 'Is the trend still bullish?', context: CONTEXT })

  assert.equal(session.state.turnCount, 2)
  assert.equal(session.state.lastResponseMetadata?.title, 'Turn 2')
  const evidence = session.state.recentToolEvidence
  assert.equal(evidence.length, 2)
  assert.ok(evidence.every((e) => e.entity === 'nifty-50'), 'follow-up evidence is attributed to the resolved instrument')
})

test('C — "What evidence supports that?" sees the latest tool evidence in context', async () => {
  const session = createConversationSession({}, NOW)
  const provider = createRuleMockProvider(({ callCount, request }) => {
    if (callCount === 1) {
      return { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] }
    }
    if (callCount === 2) return { kind: 'final', content: finalResponse('Turn 1') }
    const prompt = fullPrompt(request)
    assert.ok(prompt.includes('Latest tool evidence'), 'tool evidence is injected for the follow-up')
    assert.ok(prompt.includes('getTechnicalAnalysis'), 'the exact tool is named in the evidence')
    return { kind: 'final', content: finalResponse('Evidence cited') }
  })
  const engine = createAgentAnalystEngine({
    provider,
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    conversation: session,
  })

  await engine.generate({ text: 'Why is NIFTY weak?', context: CONTEXT })
  const r2 = await engine.generate({ text: 'What evidence supports that?', context: CONTEXT })
  assert.equal(r2.title, 'Evidence cited')
})

test('G — "Actually, I meant TCS" corrects the topic and re-targets tools', async () => {
  const session = createConversationSession({}, NOW)
  const provider = createRuleMockProvider(({ callCount, request }) => {
    if (callCount === 1) {
      return { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] }
    }
    if (callCount === 2) return { kind: 'final', content: finalResponse('Turn 1') }
    if (callCount === 3) {
      const prompt = fullPrompt(request)
      assert.ok(
        prompt.includes('user corrected the focus from nifty-50 to TCS'),
        'the same-turn interpretation surfaces the correction to the model',
      )
      return { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'TCS' })] }
    }
    return { kind: 'final', content: finalResponse('Turn 2') }
  })
  const engine = createAgentAnalystEngine({
    provider,
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    conversation: session,
  })

  await engine.generate({ text: 'Why is NIFTY weak?', context: CONTEXT })
  await engine.generate({ text: 'Actually, I meant TCS', context: CONTEXT })

  assert.equal(session.state.activeTopic, 'TCS')
  const evidence = session.state.recentToolEvidence
  assert.equal(evidence[evidence.length - 1].entity, 'TCS', 'tools re-target the corrected instrument')
})

// --- Fallback path: session evidence answers with provenance, no fabrication --

test('D — fallback answers "which tool showed that" from session evidence', async () => {
  const session = createConversationSession({}, NOW)

  const good = createAgentAnalystEngine({
    provider: createMockProvider([
      { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] },
      { kind: 'final', content: finalResponse('NIFTY read') },
    ]),
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    conversation: session,
  })
  await good.generate({ text: 'Why is NIFTY weak?', context: CONTEXT })

  const failing = createAgentAnalystEngine({
    provider: createMockProvider([{ kind: 'error', errorKind: 'unavailable' }]),
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    conversation: session,
  })
  const r2 = await failing.generate({ text: 'Which Finova tool showed that?', context: CONTEXT })

  const text = JSON.stringify(r2)
  assert.ok(text.includes('getTechnicalAnalysis'), 'the exact tool is named from memory')
  assert.ok(text.includes('No Finova tool in this session supports'), 'honesty section present')
  assert.equal(r2.partial, true)
  assert.equal(r2.confidence, 'Low')
  const validation = validateStructuredResponse(r2)
  assert.equal(validation.ok, true, 'memory answer still validates as an AnalystResponse')
})

test('E — fallback memory answer never fabricates metrics or values', async () => {
  const session = createConversationSession({}, NOW)
  const r1 = session.resolve('Why is NIFTY weak?', NOW)
  session.update(r1, {
    response: JSON.parse(finalResponse('NIFTY read')),
    evidence: [{ result: evidenceToolResult(), entity: 'nifty-50' }],
    sources: [],
    now: NOW,
  })

  const baseCalls: string[] = []
  const base: AnalystEngine = {
    async generate(input) {
      baseCalls.push(input.text)
      throw new Error('base must not be called when session evidence exists')
    },
    insights: () => [],
    suggest: () => [],
  }
  const wrapper = createConversationAwareFallback({ session, base })
  const r2 = await wrapper.generate({ text: 'Does Finova data support the bullish read?', context: CONTEXT })

  assert.deepEqual(baseCalls, [], 'memory path answers without delegating')
  assert.equal(r2.metrics, undefined, 'no invented metrics')
  assert.equal(r2.partial, true)
  assert.ok(r2.summary?.includes('evidence already gathered'), 'summary labels the answer as session evidence')
  assert.ok(JSON.stringify(r2).includes('getTechnicalAnalysis'), 'provenance names the exact tool')
})

// --- Delegation: explicit mentions and no-context stay with the base engine --

test('F — conversation:null keeps the raw deterministic fallback behavior', async () => {
  const seen: string[] = []
  const fallback: AnalystEngine = {
    async generate(input) {
      seen.push(input.text)
      return JSON.parse(finalResponse('Delegate answer'))
    },
    insights: () => [],
    suggest: () => [],
  }
  const engine = createAgentAnalystEngine({
    provider: createMockProvider([{ kind: 'error', errorKind: 'unavailable' }]),
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    fallback,
    conversation: null,
  })
  const response = await engine.generate({ text: 'Why?', context: CONTEXT })
  assert.deepEqual(seen, ['Why?'], 'no conversation memory -> original text reaches the fallback')
  assert.equal(response.title, 'Delegate answer')
})

test('H1 — bare follow-up delegates the display name when no evidence exists', async () => {
  const session = createConversationSession({}, NOW)
  const r1 = session.resolve('Why is NIFTY weak?', NOW)
  session.update(r1, { response: JSON.parse(finalResponse('x')), evidence: [], sources: [], now: NOW })

  const seen: string[] = []
  const base: AnalystEngine = {
    async generate(input) {
      seen.push(input.text)
      return JSON.parse(finalResponse('Delegate answer'))
    },
    insights: () => [],
    suggest: () => [],
  }
  const wrapper = createConversationAwareFallback({ session, base })
  await wrapper.generate({ text: 'Why?', context: CONTEXT })
  assert.deepEqual(seen, ['Nifty 50'], 'the deterministic engine receives a routable display name')
})

test('H2 — explicit mention without evidence delegates the original text', async () => {
  const session = createConversationSession({}, NOW)
  const seen: string[] = []
  const base: AnalystEngine = {
    async generate(input) {
      seen.push(input.text)
      return JSON.parse(finalResponse('Delegate answer'))
    },
    insights: () => [],
    suggest: () => [],
  }
  const wrapper = createConversationAwareFallback({ session, base })
  await wrapper.generate({ text: 'Why is NIFTY weak?', context: CONTEXT })
  assert.deepEqual(seen, ['Why is NIFTY weak?'])
})

test('H3 — no instrument context delegates the original text', async () => {
  const session = createConversationSession({}, NOW)
  const seen: string[] = []
  const base: AnalystEngine = {
    async generate(input) {
      seen.push(input.text)
      return JSON.parse(finalResponse('Delegate answer'))
    },
    insights: () => [],
    suggest: () => [],
  }
  const wrapper = createConversationAwareFallback({ session, base })
  await wrapper.generate({ text: 'Compare sectors', context: CONTEXT })
  assert.deepEqual(seen, ['Compare sectors'])
})

test('H4 — insights and suggest delegate to the base engine', () => {
  const session = createConversationSession({}, NOW)
  const base: AnalystEngine = {
    async generate() {
      return JSON.parse(finalResponse('x'))
    },
    insights: () => [{ id: 'i1', category: 'positive', title: 't', detail: 'd', action: { label: 'a', kind: 'explore' } }],
    suggest: () => ['s1'],
  }
  const wrapper = createConversationAwareFallback({ session, base })
  assert.equal(wrapper.insights(CONTEXT).length, 1)
  assert.deepEqual(wrapper.suggest(CONTEXT), ['s1'])
})