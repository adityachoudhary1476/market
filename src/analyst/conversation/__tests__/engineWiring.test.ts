import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAgentAnalystEngine, resetAgentConversation, suggestConversationFollowUps } from '../../agent/agentEngine'
import { createMockProvider, toolCall } from '../../agent/mockProvider'
import { createDefaultAnalystToolRegistry } from '../../tools/registry'
import { createDefaultToolContext } from '../../tools/context'
import { buildAnalystContext } from '../../buildContext'
import { createConversationSession } from '../session'
import { NOW } from './helpers'

const REGISTRY = createDefaultAnalystToolRegistry()
const TOOL_CTX = createDefaultToolContext(NOW)
const CONTEXT = buildAnalystContext()

function finalResponse(title: string) {
  return JSON.stringify({
    intent: 'explain',
    title,
    summary: 'Synthesized answer.',
    findings: [{ kind: 'fact', title: 'Read', detail: 'Evidence-based read.' }],
    confidence: 'Medium',
  })
}

test('engine records turns across generate() calls and reset clears them', async () => {
  const session = createConversationSession({}, NOW)
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] },
    { kind: 'final', content: finalResponse('A1') },
    { kind: 'final', content: finalResponse('A2') },
  ])
  const engine = createAgentAnalystEngine({
    provider,
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    conversation: session,
  })

  const r1 = await engine.generate({ text: 'Why is NIFTY weak?', context: CONTEXT, history: [] })
  assert.equal(r1.title, 'A1')
  assert.equal(session.state.turnCount, 1)
  assert.equal(session.state.activeTopic, 'nifty-50')

  const r2 = await engine.generate({ text: 'Is it still weak?', context: CONTEXT, history: [] })
  assert.equal(r2.title, 'A2')
  assert.equal(session.state.turnCount, 2)
  assert.equal(session.state.activeTopic, 'nifty-50')

  // "New analysis" semantics: reset clears everything.
  resetAgentConversation(engine)
  assert.equal(session.state.turnCount, 0)
  assert.equal(session.state.activeEntities.length, 0)

  // Suggestions derive from memory only when memory exists.
  const empty = suggestConversationFollowUps(engine)
  assert.deepEqual(empty, [])
})

test('engine records tool evidence per turn with entity attribution', async () => {
  const session = createConversationSession({}, NOW)
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] },
    { kind: 'final', content: finalResponse('Evidence turn') },
  ])
  const engine = createAgentAnalystEngine({
    provider,
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    conversation: session,
  })
  await engine.generate({ text: 'Why is NIFTY weak?', context: CONTEXT, history: [] })

  const evidence = session.state.recentToolEvidence
  assert.equal(evidence.length, 1)
  assert.equal(evidence[0].tool, 'getTechnicalAnalysis')
  assert.equal(evidence[0].entity, 'nifty-50')
  assert.equal(evidence[0].available, true)
})

test('fallback responses are still recorded into conversation memory', async () => {
  const session = createConversationSession({}, NOW)
  const provider = createMockProvider([{ kind: 'error', errorKind: 'unavailable' }])
const fallback = { generate: async () => JSON.parse(finalResponse('Fallback answer')) } as never
  const engine = createAgentAnalystEngine({
    provider,
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    fallback,
    conversation: session,
  })
  const response = await engine.generate({ text: 'Why is NIFTY weak?', context: CONTEXT, history: [] })
  assert.ok(String(response.title).includes('Fallback'))
  assert.equal(session.state.turnCount, 1, 'the fallback answer is remembered')
  assert.equal(session.state.lastResponseMetadata?.title, 'Fallback answer')
})

test('conversation:null disables conversation memory entirely', async () => {
  const provider = createMockProvider([
    { kind: 'final', content: finalResponse('No memory') },
  ])
  const engine = createAgentAnalystEngine({
    provider,
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    conversation: null,
  })
  await engine.generate({ text: 'Hi', context: CONTEXT, history: [] })
  assert.deepEqual(suggestConversationFollowUps(engine), [])
})
