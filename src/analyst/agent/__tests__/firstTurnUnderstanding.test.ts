// ---------------------------------------------------------------------------
// Phase 3D — first-turn subject understanding regression tests.
//
// Regression: "what's happening with oil rn" used to resolve to NO instrument
// in the LLM path (context note said "No known instrument was mentioned") and
// to a NIFTY market summary in the deterministic fallback. These tests lock
// the corrected behavior: the UNDERSTAND stage resolves the financial subject
// (asset class, intent, scope), the model context names it, and neither path
// substitutes Indian equity data for non-equity subjects.
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAgentAnalystEngine } from '../agentEngine'
import { createMockProvider, createRuleMockProvider, toolCall } from '../mockProvider'
import { createDefaultAnalystToolRegistry } from '../../tools/registry'
import { createDefaultToolContext } from '../../tools/context'
import { buildAnalystContext } from '../../buildContext'
import { createConversationSession } from '../../conversation/session'
import { runAgentSession } from '../orchestrator'
import { synthesizeResponse } from '../synthesis'
import { findEntityMentions } from '../entityResolution'
import { understandTurn } from '../understanding'
import { findFinancialSubjects } from '../subjects'

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

// --- UNDERSTAND stage: subject resolution (A–H) ------------------------------

test('A — "whats happening with oil rn" resolves to crude oil, commodity, status, not NIFTY', () => {
  const u = understandTurn("what's happening with oil rn")
  assert.equal(u.primary?.subject.id, 'brent')
  assert.equal(u.primary?.subject.assetClass, 'commodity')
  assert.equal(u.intent, 'current_market_status')
  assert.equal(u.timeframe, 'today')
  assert.equal(u.scope, 'specific')
  assert.equal(u.needsClarification, false)
  assert.deepEqual(u.assetClasses, ['commodity'])

  const mentions = findEntityMentions("what's happening with oil rn")
  assert.deepEqual(
    mentions.map((m) => m.id),
    ['brent'],
    'oil resolves as an entity — and only to the oil subject, never to nifty-50',
  )
})

test('B — "why is gold moving?" resolves to gold, commodity, explain', () => {
  const u = understandTurn('why is gold moving?')
  assert.equal(u.primary?.subject.id, 'gold')
  assert.equal(u.primary?.subject.assetClass, 'commodity')
  assert.equal(u.intent, 'explain_move')
})

test('C — "whats happening with bitcoin?" resolves to bitcoin, crypto, web-only', () => {
  const u = understandTurn('what is happening with bitcoin?')
  assert.equal(u.primary?.subject.id, 'bitcoin')
  assert.equal(u.primary?.subject.assetClass, 'crypto')
  assert.equal(u.primary?.subject.coverage, 'web-only')
})

test('D — "why are Indian banks up?" resolves to the Indian banking sector', () => {
  const u = understandTurn('why are Indian banks up?')
  assert.equal(u.primary?.subject.id, 'banks')
  assert.equal(u.primary?.subject.assetClass, 'sector')
  assert.equal(u.intent, 'explain_move')
  const mentions = findEntityMentions('why are Indian banks up?')
  assert.deepEqual(mentions.map((m) => m.id), ['banks'])
  assert.ok(!mentions.some((m) => m.id === 'nifty-50'))
})

test('E — "why is NIFTY up?" stays with the NIFTY 50 equity index', () => {
  const u = understandTurn('why is NIFTY up?')
  assert.equal(u.primary, null, 'nifty-50 is an instrument, not a financial subject')
  assert.ok(u.assetClasses.includes('index'))
  assert.equal(u.intent, 'explain_move')
  const mentions = findEntityMentions('why is NIFTY up?')
  assert.deepEqual(mentions.map((m) => m.id), ['nifty-50'])
  assert.equal(mentions[0].type, 'index')
})

test('F — "give me the latest news on crude oil" is a news intent with an oil search hint', () => {
  const u = understandTurn('give me the latest news on crude oil')
  assert.equal(u.primary?.subject.id, 'brent')
  assert.equal(u.intent, 'news')
  assert.ok(u.newsHint?.includes('crude oil'), `expected an oil hint, got ${u.newsHint}`)
  assert.equal(u.timeframe, 'today')
})

test('G — "whats happening with oil and how could it affect India?" has primary oil + secondary India', () => {
  const u = understandTurn("what's happening with oil and how could it affect India?")
  assert.equal(u.primary?.subject.id, 'brent')
  assert.equal(u.secondary?.subject.id, 'india')
  assert.equal(u.intent, 'impact')
})

test('H — "tell me anything interesting happening globally" is a broad/global intent', () => {
  const u = understandTurn('tell me anything interesting happening globally')
  assert.ok(
    u.primary?.subject.id === 'global' || u.scope === 'broad',
    `expected a global/broad resolution, got primary=${u.primary?.subject.id} scope=${u.scope}`,
  )
  assert.ok(u.newsHint, 'news intent gets a web-search hint')
})

test('clarification is only for genuine ambiguity, never for a named subject', () => {
  assert.equal(understandTurn('how is it doing?').needsClarification, true)
  assert.equal(understandTurn("what's happening with oil?").needsClarification, false)
  assert.equal(understandTurn('tell me about it').needsClarification, true)
  assert.equal(understandTurn('what is going on in the markets today?').scope, 'broad')
})

test('subject aliases are word-boundary safe and longest-first', () => {
  assert.equal(findFinancialSubjects('crude oil news')[0].subject.id, 'brent')
  assert.equal(findFinancialSubjects('oil stocks')[0].subject.id, 'energy')
  assert.equal(findFinancialSubjects('technology stocks')[0].subject.id, 'tech')
  assert.equal(findFinancialSubjects('globalization is interesting').length, 0)
  assert.deepEqual(
    findFinancialSubjects("compare oil and gold").map((m) => m.subject.id),
    ['brent', 'gold'],
    'subjects order as spoken',
  )
})

// --- LLM path: the model context names the real subject ----------------------

test('LLM path — oil first turn names Crude Oil in context, not "No known instrument"', async () => {
  const provider = createRuleMockProvider(({ callCount, request }) => {
    if (callCount === 1) {
      const prompt = fullPrompt(request)
      assert.ok(prompt.includes('Crude Oil (Brent)'), 'context note names the oil subject')
      assert.ok(prompt.includes('getMacroContext'), 'guidance points at the macro level tool')
      assert.ok(
        !prompt.includes('No known instrument was mentioned'),
        'regression: the old "no instrument" note must not fire for oil',
      )
      assert.ok(!prompt.includes('NIFTY 50'), 'the subject line never defaults to the Indian market')
      return { kind: 'tool-calls', calls: [toolCall('getMacroContext', { indicatorId: 'brent' })] }
    }
    return { kind: 'final', content: finalResponse('Crude oil — today') }
  })
  const output = await runAgentSession(
    { text: "what's happening with oil rn", context: CONTEXT, history: [] },
    { provider, registry: REGISTRY, toolContext: TOOL_CTX },
  )
  assert.equal(output.understanding?.primary?.subject.id, 'brent', 'output carries the structured understanding')
  assert.equal(output.understanding?.assetClasses[0], 'commodity')
})

test('LLM path — news question carries the web-search hint into context', async () => {
  const provider = createRuleMockProvider(({ callCount, request }) => {
    if (callCount === 1) {
      const prompt = fullPrompt(request)
      assert.ok(prompt.includes('Crude Oil (Brent)'))
      assert.ok(prompt.includes('crude oil price, supply, demand and geopolitics'), 'news hint present')
      assert.ok(prompt.includes('Search the web with a natural query'))
      return { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'crude oil latest news' })] }
    }
    return { kind: 'final', content: finalResponse('Oil news') }
  })
  const output = await runAgentSession(
    { text: 'give me the latest news on crude oil', context: CONTEXT, history: [] },
    { provider, registry: REGISTRY, toolContext: TOOL_CTX },
  )
  assert.equal(output.understanding?.intent, 'news')
})

test('LLM path — bitcoin first turn is told it has no deterministic Finova data', async () => {
  const provider = createRuleMockProvider(({ callCount, request }) => {
    if (callCount === 1) {
      const prompt = fullPrompt(request)
      assert.ok(prompt.includes('Bitcoin'))
      assert.ok(prompt.includes('web-only'), 'coverage is declared honestly')
      assert.ok(prompt.includes('searchWeb'), 'web search is the prescribed source')
      return { kind: 'tool-calls', calls: [toolCall('searchWeb', { query: 'bitcoin latest news' })] }
    }
    return { kind: 'final', content: finalResponse('Bitcoin news') }
  })
  await runAgentSession(
    { text: "what's happening with bitcoin?", context: CONTEXT, history: [] },
    { provider, registry: REGISTRY, toolContext: TOOL_CTX },
  )
})

// --- Conversation continuity across subjects ----------------------------------

test('conversation: oil -> why? -> and gold? -> compare that with oil', async () => {
  const session = createConversationSession({}, NOW)
  const provider = createRuleMockProvider(({ callCount, request }) => {
    const prompt = fullPrompt(request)
    if (callCount === 1) {
      assert.ok(prompt.includes('Crude Oil (Brent)'))
      return { kind: 'tool-calls', calls: [toolCall('getMacroContext', { indicatorId: 'brent' })] }
    }
    if (callCount === 2) return { kind: 'final', content: finalResponse('Turn 1') }
    if (callCount === 3) {
      assert.ok(prompt.includes('Active topic: brent'), 'follow-up "why?" resolves to the oil topic')
      return { kind: 'tool-calls', calls: [toolCall('getMacroContext', { indicatorId: 'brent' })] }
    }
    if (callCount === 4) return { kind: 'final', content: finalResponse('Turn 2') }
    if (callCount === 5) {
      assert.ok(prompt.includes('Active topic: gold'), '"and gold?" switches the topic to gold')
      return { kind: 'tool-calls', calls: [toolCall('getMacroContext', { indicatorId: 'gold' })] }
    }
    if (callCount === 6) return { kind: 'final', content: finalResponse('Turn 3') }
    if (callCount === 7) {
      assert.ok(prompt.includes('Active topic: gold'), '"compare that with oil" keeps gold active')
      assert.ok(prompt.includes('Resolved instruments'), 'the explicit oil mention is carried')
      return { kind: 'tool-calls', calls: [toolCall('getMacroContext', { indicatorId: 'brent' })] }
    }
    return { kind: 'final', content: finalResponse('Turn 4') }
  })
  const engine = createAgentAnalystEngine({
    provider,
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    conversation: session,
  })

  await engine.generate({ text: "what's happening with oil?", context: CONTEXT, history: [] })
  await engine.generate({ text: 'why?', context: CONTEXT, history: [] })
  await engine.generate({ text: 'and gold?', context: CONTEXT, history: [] })
  const r4 = await engine.generate({ text: 'compare that with oil', context: CONTEXT, history: [] })
  assert.equal(r4.title, 'Turn 4')
  assert.equal(session.state.activeTopic, 'brent', 'the explicitly mentioned oil becomes the active topic')
})

// --- Deterministic fallback: honest subject answers, never a NIFTY default ----

function failingEngine() {
  return createAgentAnalystEngine({
    provider: createMockProvider([{ kind: 'error', errorKind: 'unavailable' }]),
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    conversation: null,
  })
}

test('FALLBACK A — oil first turn answers from Brent macro data, NOT a NIFTY summary', async () => {
  const r = await failingEngine().generate({ text: "what's happening with oil rn", context: CONTEXT })
  assert.ok(/Crude Oil|Brent/i.test(r.title), `title names oil, got: ${r.title}`)
  assert.ok(!/nifty|market summary/i.test(r.title), 'title is NOT a NIFTY/market summary')
  const body = JSON.stringify(r)
  assert.ok(body.includes('Brent Crude: $76.84'), 'real Brent level from Finova macro data')
  assert.ok(!body.includes('Market regime'), 'no Indian market regime substitution')
})

test('FALLBACK B — "why is gold moving?" answers from the Gold macro level', async () => {
  const r = await failingEngine().generate({ text: 'why is gold moving?', context: CONTEXT })
  assert.ok(r.title.includes('Gold'), `title names gold, got: ${r.title}`)
  const body = JSON.stringify(r)
  assert.ok(body.includes('Gold (spot): $2,512'), 'real gold level')
  assert.ok(body.includes('+0.22%'))
  assert.ok(!/nifty/i.test(r.title))
})

test('FALLBACK C — bitcoin answers honestly that no Finova data source exists', async () => {
  const r = await failingEngine().generate({ text: "what's happening with bitcoin?", context: CONTEXT })
  assert.ok(r.title.includes('Bitcoin'), `title names bitcoin, got: ${r.title}`)
  assert.ok(r.title.includes('no Finova data source'), 'honest no-source title')
  const body = JSON.stringify(r)
  assert.ok(!/nifty/i.test(r.title), 'no NIFTY substitution')
  assert.ok(!/\$\d[\d,]*/.test(body) || body.includes('no deterministic'), 'no fabricated bitcoin prices')
  assert.ok(body.includes('What Finova does track'), 'coverage is listed honestly')
})

test('FALLBACK D — Indian banks answer from the Financials sector data', async () => {
  const r = await failingEngine().generate({ text: 'why are Indian banks up?', context: CONTEXT })
  assert.ok(r.title.includes('Indian banks'), `title names banks, got: ${r.title}`)
  assert.ok(JSON.stringify(r).includes('Financials sector'), 'sector data used')
})

test('FALLBACK E — equity questions still delegate to the deterministic engine', async () => {
  const r = await failingEngine().generate({ text: 'why is NIFTY up?', context: CONTEXT })
  assert.ok(
    !/What Finova's data shows|no Finova data source/.test(r.title),
    `equity question must delegate to the market engine, got: ${r.title}`,
  )
})

test('FALLBACK G — oil + India answers oil first, with related India indicators', async () => {
  const r = await failingEngine().generate({
    text: "what's happening with oil and how could it affect India?",
    context: CONTEXT,
  })
  assert.ok(/Crude Oil|Brent/.test(r.title), `primary subject is oil, got: ${r.title}`)
  const body = JSON.stringify(r)
  assert.ok(body.includes('Brent Crude: $76.84'))
  assert.ok(body.includes('USD / INR'), 'related India macro indicator present')
  assert.ok(body.includes('Energy sector'), 'related sector present')
  assert.ok(/Nifty 50|NIFTY 50/.test(body), 'related index level present')
})

test('FALLBACK compare — oil vs gold shows both real levels', async () => {
  const r = await failingEngine().generate({ text: 'compare oil and gold', context: CONTEXT })
  const body = JSON.stringify(r)
  assert.ok(body.includes('Brent Crude: $76.84'))
  assert.ok(body.includes('Gold (spot): $2,512'))
})

test('FALLBACK — a global/broad question answers from the global index data', async () => {
  const r = await failingEngine().generate({
    text: 'tell me anything interesting happening globally',
    context: CONTEXT,
  })
  assert.ok(/Global markets/.test(r.title), `title names global markets, got: ${r.title}`)
  assert.ok(JSON.stringify(r).includes('S&P 500'), 'global index data used')
  assert.ok(!/nifty/i.test(r.title), 'no NIFTY substitution for a global question')
})

// --- Honest synthesis for web-only subjects -----------------------------------

test('SYNTHESIS — a web-only subject gets a data-coverage note, never a market default', () => {
  const r = synthesizeResponse({
    question: "what's happening with bitcoin?",
    results: [],
    mentions: [],
    subjectLabel: 'Bitcoin',
    assetClass: 'crypto',
    subjectCoverage: 'web-only',
  })
  assert.ok(r.title.includes('Bitcoin'), `title reflects the subject, got: ${r.title}`)
  assert.ok(!/nifty/i.test(r.title))
  assert.ok(JSON.stringify(r.sections).includes('no deterministic data source for Bitcoin'))
})