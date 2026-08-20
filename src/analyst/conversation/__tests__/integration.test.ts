import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentSession } from '../../agent/orchestrator'
import { createDefaultAnalystToolRegistry } from '../../tools/registry'
import { createDefaultToolContext } from '../../tools/context'
import { createRuleMockProvider, toolCall } from '../../agent/mockProvider'
import { buildAnalystContext } from '../../buildContext'
import { createConversationSession } from '../session'

const NOW = 1_720_000_000_000
const REGISTRY = createDefaultAnalystToolRegistry()
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

interface CapturedRequest {
  messages: Array<{ role: string; content: string }>
  turn: number
}

/** Run one turn through the real orchestrator with a scripted model. */
async function turn(
  text: string,
  session: ReturnType<typeof createConversationSession>,
  script: (ctx: { callCount: number; request: CapturedRequest }) => unknown,
  now = NOW,
) {
  const captured: CapturedRequest[] = []
  const toolContext = createDefaultToolContext(now)
  const provider = createRuleMockProvider(({ request, callCount }) => {
    captured.push({ messages: request.messages as CapturedRequest['messages'], turn: callCount })
    return script({ callCount, request: captured[captured.length - 1] }) as never
  })
  const output = await runAgentSession(
    { text, context: CONTEXT, history: [] },
    { provider, registry: REGISTRY, toolContext, conversation: session },
  )
  return { output, captured }
}

function lastRequestPayload(captured: CapturedRequest[]): string {
  const last = captured[captured.length - 1]
  const system = last.messages.find((m) => m.role === 'system' && m.content.startsWith('CONVERSATION CONTEXT'))
  return system?.content ?? ''
}

// GOLDEN A — implicit reference continuity: turn 2 has no instrument name, yet
// the model receives the resolved entity and reuses the canonical id.
test('GOLDEN A — implicit reference resolves across turns and the tool uses the canonical id', async () => {
  const session = createConversationSession({}, NOW)

  const t1 = await turn('Why is NIFTY weak today?', session, ({ callCount }) => {
    if (callCount === 1) return { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] }
    return { kind: 'final', content: finalResponse('Why NIFTY is weak') }
  })
  assert.equal(t1.output.response.title, 'Why NIFTY is weak')

  const t2 = await turn('Is it still bullish?', session, ({ callCount }) => {
    if (callCount === 1) {
      return { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] }
    }
    return { kind: 'final', content: finalResponse('Trend read', { intent: 'explain' }) }
  }, NOW + 60_000)

  const payload = lastRequestPayload(t2.captured)
  assert.ok(payload.includes('nifty-50'), 'entity continuity reaches the model')
  assert.ok(payload.includes('it'), 'pronoun interpretation is explicit')
  assert.ok(payload.includes('high confidence'), 'resolution confidence is explicit')

  const tools = t2.output.trace.filter((t) => t.kind === 'tool').map((t) => t.tool)
  assert.ok(tools.includes('getTechnicalAnalysis'))
  assert.equal(session.state.activeTopic, 'nifty-50')
  assert.equal(session.state.turnCount, 2)
})

// GOLDEN B — comparison continuity: "which one" keeps the pair alive.
test('GOLDEN B — comparison continuity across turns', async () => {
  const session = createConversationSession({}, NOW)

  const t1 = await turn('Compare NIFTY 50 and Bank Nifty', session, ({ callCount }) => {
    if (callCount === 1) {
      return { kind: 'tool-calls', calls: [toolCall('compareInstruments', { instruments: ['nifty-50', 'bank-nifty'] })] }
    }
    return { kind: 'final', content: finalResponse('NIFTY vs Bank Nifty', { intent: 'compare' }) }
  })
  assert.equal(t1.output.response.intent, 'compare')

  const t2 = await turn('Which one is stronger today?', session, ({ callCount }) => {
    if (callCount === 1) {
      return { kind: 'tool-calls', calls: [toolCall('compareInstruments', { instruments: ['nifty-50', 'bank-nifty'] })] }
    }
    return { kind: 'final', content: finalResponse('Stronger today', { intent: 'compare' }) }
  }, NOW + 60_000)

  const payload = lastRequestPayload(t2.captured)
  assert.ok(payload.includes('Active comparison'), 'comparison memory reaches the model')
  assert.ok(payload.includes('Nifty 50') && payload.includes('Bank Nifty'), 'pair members are explicit')
  assert.ok(payload.includes('which one'), 'continuation reference is explicit')

  const tools = t2.output.trace.filter((t) => t.kind === 'tool').map((t) => t.tool)
  assert.ok(tools.includes('compareInstruments'))
  assert.equal(session.state.activeComparison?.entities.join(','), 'nifty-50,bank-nifty')
  assert.equal(session.state.activeComparison?.sourceTurn, 2)
})

// GOLDEN C — corrections: the model is told the focus changed and the next
// tool call targets the corrected instrument.
test('GOLDEN C — corrections switch the focus and reach the model', async () => {
  const session = createConversationSession({}, NOW)

  await turn('Analyze TCS', session, ({ callCount }) => {
    if (callCount === 1) return { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'TCS' })] }
    return { kind: 'final', content: finalResponse('TCS read') }
  })

  const t2 = await turn('Actually, I meant Infosys', session, ({ callCount }) => {
    if (callCount === 1) return { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'INFY' })] }
    return { kind: 'final', content: finalResponse('Infosys read') }
  }, NOW + 60_000)

  const payload = lastRequestPayload(t2.captured)
  assert.ok(payload.includes('from TCS to INFY'), 'correction mapping reaches the model')
  assert.ok(payload.includes('correction'), 'the correction is explicit')
  const tools = t2.output.trace.filter((t) => t.kind === 'tool').map((t) => t.tool)
  assert.ok(tools.includes('getTechnicalAnalysis'))
  assert.equal(session.state.activeTopic, 'INFY')
  assert.equal(session.state.corrections.length, 1)
  assert.equal(session.state.corrections[0].corrected, 'INFY')
})

// GOLDEN D — clarification: an under-specified request is surfaced as
// ambiguous; the model may answer partially (its choice, scripted here).
test('GOLDEN D — under-specified requests surface ambiguity, never a silent guess', async () => {
  const session = createConversationSession({}, NOW)

  const t1 = await turn('Compare these two stocks', session, () => {
    return {
      kind: 'final',
      content: finalResponse('Which instruments?', {
        summary: 'Which two instruments would you like me to compare?',
        partial: true,
        intent: 'compare',
      }),
    }
  })

  const payload = lastRequestPayload(t1.captured)
  assert.ok(payload.includes('Ambiguity'), 'ambiguity is surfaced to the model')
  assert.ok(payload.includes('unresolved'), 'the unresolved reference is explicit')
  assert.equal(t1.output.response.partial, true)
  assert.equal(session.state.turnCount, 1)
  // Nothing was invented: no active entities, no comparison recorded.
  assert.equal(session.state.activeEntities.length, 0)
  const afterT1 = session.state.activeComparison
  assert.equal(afterT1, null)

  // The user then names the pair — everything resolves cleanly.
  const t2 = await turn('TCS and Infosys', session, ({ callCount }) => {
    if (callCount === 1) {
      return { kind: 'tool-calls', calls: [toolCall('compareInstruments', { instruments: ['TCS', 'INFY'] })] }
    }
    return { kind: 'final', content: finalResponse('TCS vs Infosys', { intent: 'compare' }) }
  }, NOW + 60_000)

  const tools = t2.output.trace.filter((t) => t.kind === 'tool').map((t) => t.tool)
  assert.ok(tools.includes('compareInstruments'))
  // The pair is now active in memory (resolved, never guessed).
  const activeIds = session.state.activeEntities.map((e) => e.id)
  assert.ok(activeIds.includes('TCS') && activeIds.includes('INFY'))
  assert.equal(session.state.activeTopic, 'TCS')
})

// GOLDEN E — evidence reuse: previous tool evidence is in the payload, and
// the model can answer the follow-up WITHOUT rerunning tools.
test('GOLDEN E — prior tool evidence is reused instead of re-run', async () => {
  const session = createConversationSession({}, NOW)

  const t1 = await turn('Why did NIFTY fall today?', session, ({ callCount }) => {
    if (callCount === 1) return { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] }
    return { kind: 'final', content: finalResponse('Why NIFTY fell') }
  })
  assert.ok(t1.output.trace.some((t) => t.kind === 'tool'))

  const t2 = await turn('And what about momentum?', session, () => {
    // The model decides it already has the evidence — answers directly.
    return { kind: 'final', content: finalResponse('Momentum read') }
  }, NOW + 60_000)

  const payload = lastRequestPayload(t2.captured)
  assert.ok(payload.includes('Latest tool evidence'), 'prior evidence reaches the model')
  assert.ok(payload.includes('getTechnicalAnalysis'), 'the evidence is attributed to its tool')
  assert.ok(payload.includes('nifty-50'), 'the evidence is attributed to its entity')
  assert.ok(payload.includes('reuse before rerunning tools'), 'the model is told to reuse evidence')

  // Semantic outcome: the follow-up was answered without new tool calls.
  const tools = t2.output.trace.filter((t) => t.kind === 'tool').map((t) => t.tool)
  assert.equal(tools.length, 0, 'follow-up answered from session memory')
  assert.equal(t2.output.response.title, 'Momentum read')
  assert.equal(session.state.turnCount, 2)
})