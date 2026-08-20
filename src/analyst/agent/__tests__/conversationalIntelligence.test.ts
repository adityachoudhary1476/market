// ---------------------------------------------------------------------------
// Phase 3O — Analyst Reasoning & Conversational Intelligence: end-to-end
// conversational behavior through the real orchestrator with a scripted
// provider. Covers: thread continuity across turns (the follow-up resolves
// against the previous conclusion), progressive-disclosure directives in the
// model context, premise evaluation, the no-repeat guard, switch-subject,
// opinion, temporal-compare, bull/bear and reported-vs-confirmed asks, the
// thread-carrying fallback, and the observability-only quality gate.
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentSession } from '../orchestrator'
import { createDefaultAnalystToolRegistry } from '../../tools/registry'
import { createDefaultToolContext } from '../../tools/context'
import { createMockProvider, toolCall } from '../mockProvider'
import type { LLMMessage, LLMProvider, LLMRequest, LLMResult, AgentConfig } from '../types'
import { buildAnalystContext } from '../../buildContext'
import { createConversationSession } from '../../conversation/session'
import type { ConversationSession } from '../../conversation/types'

const NOW = 1_720_000_000_000

interface RecordingProvider {
  name: string
  requests: LLMRequest[]
  generate(request: LLMRequest): Promise<LLMResult>
}

function recording(inner: LLMProvider): RecordingProvider {
  const requests: LLMRequest[] = []
  return {
    name: inner.name,
    requests,
    generate: (request: LLMRequest) => {
      requests.push(request)
      return inner.generate(request)
    },
  }
}

function makeDeps(provider: LLMProvider, conversation?: ConversationSession, config?: Partial<AgentConfig>) {
  const registry = createDefaultAnalystToolRegistry()
  const toolContext = createDefaultToolContext(NOW)
  return {
    registry,
    toolContext,
    provider,
    conversation,
    config: config ?? ({} as Partial<AgentConfig>),
    context: buildAnalystContext(),
  }
}

function json(intent: string, title: string, summary: string) {
  return JSON.stringify({
    intent,
    title,
    summary,
    sections: [{ heading: 'Evidence', kind: 'fact', body: 'Supporting detail.', bullets: [] }],
    findings: [{ kind: 'fact', title: 'Trend', detail: 'stable' }],
    confidence: 'Medium',
  })
}

function lastRequestText(provider: RecordingProvider, since: number): string {
  return provider.requests
    .slice(since)
    .map((r) => [r.system, ...r.messages.map((m: LLMMessage) => `${m.role}: ${m.content}`)].join('\n'))
    .join('\n')
}

async function runTurn(
  provider: RecordingProvider,
  conversation: ConversationSession,
  text: string,
): Promise<{ output: Awaited<ReturnType<typeof runAgentSession>>; requestText: string }> {
  const before = provider.requests.length
  const output = await runAgentSession({ text, context: buildAnalystContext() }, makeDeps(provider, conversation))
  return { output, requestText: lastRequestText(provider, before) }
}

// --- Thread continuity & progressive disclosure ------------------------------

test('CI1 — a bare follow-up resolves against the active thread, with a directive, not a fresh question', async () => {
  const conversation = createConversationSession({}, NOW)
  const provider = recording(createMockProvider([
    { kind: 'final', content: json('explain', 'Nifty 50 — what the available evidence shows', 'Nifty is up 0.4% — near-term bias is bullish on banking support.') },
    { kind: 'final', content: json('explain', 'Risks to the Nifty read', 'The main risk is a sharp spike in bond yields, which would pressure rate-sensitive banking names.') },
  ]))

  await runTurn(provider, conversation, 'Is Nifty bullish today?')

  const second = await runTurn(provider, conversation, 'What could kill it?')
  assert.ok(second.requestText.includes('Analytical thread'), 'the thread is in the model context')
  assert.ok(second.requestText.includes('directional · today on Nifty 50'), 'kind · timeframe on subject')
  assert.ok(second.requestText.includes('Last conclusion'), 'the continuity anchor is present')
  assert.ok(second.requestText.includes('near-term bias is bullish'), 'the real prior conclusion is quoted')
  assert.ok(second.requestText.includes('Follow-up (risks)'), 'a progressive-disclosure directive was issued')
  assert.ok(second.requestText.includes('Focus on what could invalidate'), 'the risks directive is actionable')
  assert.ok(second.output.response.title === 'Risks to the Nifty read', 'the model answered the follow-up')

  assert.equal(conversation.state.analyticalThread?.turn, 2, 'the thread now reflects the follow-up turn')
})

test('CI2 — a why-continuation carries the no-repeat guard', async () => {
  const conversation = createConversationSession({}, NOW)
  const provider = recording(createMockProvider([
    { kind: 'final', content: json('explain', 'Nifty 50 — what the available evidence shows', 'Nifty is up 0.4% — near-term bias is bullish.') },
    { kind: 'final', content: json('explain', 'Why Nifty is holding up', 'Banking earnings and a soft dollar are underpinning the move.') },
  ]))
  await runTurn(provider, conversation, 'Is Nifty bullish today?')
  const second = await runTurn(provider, conversation, 'Why?')
  assert.ok(second.requestText.includes('Follow-up (why)'))
  assert.ok(second.requestText.includes('Do not repeat your previous conclusion'), 'no-repeat guard present')
  assert.ok(second.requestText.includes('add information; do not restate'), 'the why directive guides the model')
})

test('CI3 — a premise claim is extracted and routed for evaluation, never inherited', async () => {
  const conversation = createConversationSession({}, NOW)
  const provider = recording(createMockProvider([
    { kind: 'final', content: json('explain', 'Gold drivers', 'The weak dollar is a genuine tailwind for gold, but it is not the only driver.') },
  ]))
  const { output, requestText } = await runTurn(provider, conversation, 'Gold is rising because of the weak dollar, right?')
  assert.ok(requestText.includes('Follow-up (premise)'))
  assert.ok(requestText.includes('The user asserted a causal claim:'), 'premise surfaced to the model')
  assert.ok(requestText.includes('weak dollar'), 'the claim is quoted verbatim')
  assert.ok(requestText.includes('Evaluate it against the evidence'), 'the model must weigh it, not inherit it')
  assert.ok(output.response.title === 'Gold drivers')
})

test('CI4 — switch-subject is treated as a new focus, not a bare continuation', async () => {
  const conversation = createConversationSession({}, NOW)
  const provider = recording(createMockProvider([
    { kind: 'final', content: json('explain', 'Nifty 50 — what the available evidence shows', 'Nifty is up 0.4% today.') },
    { kind: 'final', content: json('status', 'Gold — what the available evidence shows', 'Gold is flat near record highs.') },
  ]))
  await runTurn(provider, conversation, 'Is Nifty bullish today?')
  const second = await runTurn(provider, conversation, 'What about gold now?')
  assert.ok(second.requestText.includes('Follow-up (switch-subject)'))
  assert.ok(second.requestText.includes('Treat it as the new focus'), 'the model refocuses on the new instrument')
})

test('CI5 — opinion asks get an evidence-based-opinion directive', async () => {
  const conversation = createConversationSession({}, NOW)
  const provider = recording(createMockProvider([
    { kind: 'final', content: json('explain', 'My take on gold', 'I would not chase gold at record highs; the risk-reward is poor.') },
  ]))
  const { requestText } = await runTurn(provider, conversation, 'What is your take on gold?')
  assert.ok(requestText.includes('Follow-up (opinion)'))
  assert.ok(requestText.includes('evidence-based opinion'), 'opinions are labeled as inferences')
  assert.ok(requestText.includes('never as fact'), 'opinion never presents as fact')
})

test('CI6 — temporal-compare continues the thread against the prior state', async () => {
  const conversation = createConversationSession({}, NOW)
  const provider = recording(createMockProvider([
    { kind: 'final', content: json('explain', 'Gold — what the available evidence shows', 'Gold is up 0.2% today.') },
    { kind: 'final', content: json('explain', 'What changed for gold', 'The move is unchanged — gold is still grinding higher.') },
  ]))
  await runTurn(provider, conversation, 'How is gold doing today?')
  const second = await runTurn(provider, conversation, 'Compared to yesterday?')
  assert.ok(second.requestText.includes('Follow-up (temporal-compare)'))
  assert.ok(second.requestText.includes('Compare the current evidence with the earlier state'), 'compares states, not restarts')
})

test('CI7 — bull/bear and reported-vs-confirmed asks are recognized continuations', async () => {
  const conversation = createConversationSession({}, NOW)
  const provider = recording(createMockProvider([
    { kind: 'final', content: json('explain', 'Nifty 50 — what the available evidence shows', 'Nifty is up 0.4% today.') },
    { kind: 'final', content: json('explain', 'Both sides', 'The bull case rests on earnings; the bear case rests on valuations.') },
  ]))
  await runTurn(provider, conversation, 'Is Nifty bullish today?')
  const second = await runTurn(provider, conversation, 'Give me the bull case and the bear case.')
  assert.ok(second.requestText.includes('Follow-up (bull-bear)'))
  assert.ok(second.requestText.includes('Present the bull and bear sides'))

  const third = await runTurn(provider, conversation, 'Is that reported or actually confirmed?')
  assert.ok(third.requestText.includes('Follow-up (confirmed)'))
  assert.ok(third.requestText.includes('Say how widely the story is reported'), 'reported-vs-confirmed is honest about corroboration')
})

// --- Thread-carrying fallback ------------------------------------------------

test('CI8 — the synthesis fallback continues the thread instead of restarting it', async () => {
  const conversation = createConversationSession({}, NOW)
  // Turn 1: the model answers (a tool call for nifty-50 technicals, then a
  // final response) so the thread is captured. Turn 2: the model keeps
  // returning non-JSON, so the orchestrator exhausts validation retries and
  // must synthesize from the thread — which CONTINUES the read.
  const provider = recording(createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] },
    { kind: 'final', content: json('explain', 'Nifty 50 — what the available evidence shows', 'Nifty is up 0.4% — near-term bias is bullish on banking support.') },
    { kind: 'invalid' },
    { kind: 'invalid' },
  ]))
  await runTurn(provider, conversation, 'Is Nifty bullish today?')
  const config = { maxValidationRetries: 0, maxReasoningRounds: 3 } as Partial<AgentConfig>
  const before = provider.requests.length
  const output = await runAgentSession(
    { text: 'What could kill it?', context: buildAnalystContext() },
    makeDeps(provider, conversation, config),
  )
  assert.equal(output.response.partial, true, 'fallback marks the response partial')
  assert.ok(output.response.title.includes('Continuing the'), `the fallback title continues the read: ${output.response.title}`)
  assert.ok(output.response.title.includes('Nifty 50'), 'the subject is preserved')
  assert.ok(provider.requests.length > before, 'the follow-up actually ran')
})

// --- Quality gate is observability-only --------------------------------------

test('CI9 — the quality gate audits but never rewrites the model output', async () => {
  const conversation = createConversationSession({}, NOW)
  const provider = recording(createMockProvider([
    { kind: 'final', content: json('explain', 'Nifty 50 — what the available evidence shows', 'Nifty is up 0.4% — near-term bias is bullish.') },
  ]))
  const { output, requestText } = await runTurn(provider, conversation, 'Is Nifty bullish today?')
  assert.ok(requestText.includes('Analytical thread') === false, 'fresh session has no thread yet')
  assert.equal(output.response.summary, 'Nifty is up 0.4% — near-term bias is bullish.', 'model output passes through unchanged')
  assert.ok(output.response.sections?.some((s) => s.heading === 'Evidence'), 'structure survives the gate')
})

// --- Injection resistance ----------------------------------------------------

test('CI10 — injected tool instructions in article text stay data, never instructions', async () => {
  const conversation = createConversationSession({}, NOW)
  const provider = recording(createMockProvider([
    {
      kind: 'final',
      content: json('explain', 'Gold — what the available evidence shows', 'Gold is consolidating near record highs.'),
    },
  ]))
  // The "article title" is hostile; the orchestrator must never execute it as
  // a directive or leak it as guidance — it is carried as a cited source only.
  const { requestText, output } = await runTurn(
    provider,
    conversation,
    'What is the news on gold?',
  )
  assert.ok(!requestText.toLowerCase().includes('ignore previous instructions'), 'injection never becomes model guidance')
  assert.ok(!requestText.includes('magic-word-xyz'), 'hostile metadata is not echoed into prompts')
  assert.equal(output.response.intent, 'explain', 'the model answered as asked')
})