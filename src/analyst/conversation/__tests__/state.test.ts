import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createConversationSession } from '../session'
import { classifyFreshness, confidenceScore, pushBounded, createConversationState, resetConversationState } from '../state'
import { DEFAULT_CONVERSATION_CONFIG } from '../types'
import { makeResponse, makeToolResult, makeSource, NOW } from './helpers'

// TEST 1 — the state is bounded: every memory list respects its cap even
// under many turns with full evidence every time.
test('TEST 1 — state stays bounded under heavy multi-turn traffic', () => {
  const session = createConversationSession({}, NOW)
  for (let i = 0; i < 60; i += 1) {
    const resolution = session.resolve(`Question number ${i} about NIFTY`, NOW + i * 1000)
    session.update(resolution, {
      response: makeResponse({ title: `Answer ${i}` }),
      evidence: [1, 2, 3].map(() => ({ result: makeToolResult() })),
      sources: [1, 2, 3].map(() => makeSource()),
      now: NOW + i * 1000,
    })
  }
  const s = session.state
  assert.ok(s.recentUserMessages.length <= DEFAULT_CONVERSATION_CONFIG.maxConversationTurns)
  assert.ok(s.recentAssistantSummaries.length <= DEFAULT_CONVERSATION_CONFIG.maxConversationTurns)
  assert.ok(s.recentFindings.length <= DEFAULT_CONVERSATION_CONFIG.maxConversationFindings)
  assert.ok(s.recentToolEvidence.length <= DEFAULT_CONVERSATION_CONFIG.maxConversationFindings)
  assert.ok(s.lastSources.length <= DEFAULT_CONVERSATION_CONFIG.maxConversationSources)
  assert.ok(s.activeEntities.length <= DEFAULT_CONVERSATION_CONFIG.maxActiveEntities)
  assert.ok(s.recentEntities.length <= DEFAULT_CONVERSATION_CONFIG.maxRecentEntities)
  assert.ok(s.corrections.length <= DEFAULT_CONVERSATION_CONFIG.maxCorrections)
})

// TEST 2 — determinism: the same turns with the same injected clock produce
// byte-identical state, and payloads are identical across sessions.
test('TEST 2 — session is deterministic with an injected clock', () => {
  const a = createConversationSession({}, NOW)
  const b = createConversationSession({}, NOW)
  const texts = ['Why is NIFTY weak?', 'Is the trend still bullish?', 'Compare it with Bank Nifty']
  for (let i = 0; i < texts.length; i += 1) {
    for (const session of [a, b]) {
      const resolution = session.resolve(texts[i], NOW + i * 1000)
      session.update(resolution, {
        response: makeResponse({ title: `A${i}` }),
        evidence: [],
        sources: [],
        now: NOW + i * 1000,
      })
    }
  }
  assert.deepEqual(a.state, b.state)
  assert.equal(a.state.conversationId, b.state.conversationId)
  assert.equal(a.state.turnCount, 3)
  assert.equal(a.state.conversationId, `conv-${NOW.toString(36)}`)
})

// TEST 3 — reset clears ALL memory: a fresh session inherits nothing.
test('TEST 3 — reset clears all session memory', () => {
  const session = createConversationSession({}, NOW)
  const r1 = session.resolve('Why is NIFTY weak?', NOW)
  session.update(r1, {
    response: makeResponse(),
    evidence: [{ result: makeToolResult(), entity: 'nifty-50' }],
    sources: [makeSource()],
    now: NOW,
  })
  session.reset()

  const s = session.state
  assert.equal(s.turnCount, 0)
  assert.equal(s.activeTopic, null)
  assert.equal(s.activeQuestion, null)
  assert.equal(s.activeEntities.length, 0)
  assert.equal(s.recentEntities.length, 0)
  assert.equal(s.activeComparison, null)
  assert.equal(s.recentUserMessages.length, 0)
  assert.equal(s.recentAssistantSummaries.length, 0)
  assert.equal(s.recentToolEvidence.length, 0)
  assert.equal(s.recentFindings.length, 0)
  assert.equal(s.lastSources.length, 0)
  assert.equal(s.corrections.length, 0)
  assert.equal(s.temporalContext, null)
  assert.equal(s.lastResponseMetadata, null)
  assert.equal(s.unresolvedReferences.length, 0)
})

test('TEST 3b — reset allows a clean new conversation (no entity bleed)', () => {
  const session = createConversationSession({}, NOW)
  const r1 = session.resolve('Why is TCS weak?', NOW)
  session.update(r1, { response: makeResponse(), evidence: [], sources: [], now: NOW })
  session.reset()
  const r2 = session.resolve('What about the market?', NOW + 1000)
  // After reset nothing is remembered: no active entities, no unresolved refs.
  assert.equal(session.state.activeEntities.length, 0)
  assert.equal(r2.interpretation.entities.length, 0)
  assert.ok(!r2.interpretation.references.some((ref) => ref.entityId === 'TCS'))
})

test('bounded list helpers drop the OLDEST entries', () => {
  const list = pushBounded([1, 2, 3], 4, 3)
  assert.deepEqual(list, [2, 3, 4])
})

// TEST 12 — freshness classification is a documented, configurable policy.
test('TEST 12 — freshness policy is configurable and deterministic', () => {
  const policy = DEFAULT_CONVERSATION_CONFIG.freshness
  const ttl = policy.marketDataTtlMs
  assert.equal(classifyFreshness(NOW, NOW, policy, 'market'), 'fresh')
  assert.equal(classifyFreshness(NOW, NOW + ttl / 2, policy, 'market'), 'fresh')
  assert.equal(classifyFreshness(NOW, NOW + ttl + 1, policy, 'market'), 'recent')
  assert.equal(classifyFreshness(NOW, NOW + ttl * 6 + 1, policy, 'market'), 'stale')
  assert.equal(classifyFreshness(NOW, NOW + ttl * 24 + 1, policy, 'market'), 'expired')
  assert.equal(classifyFreshness(Number.NaN, NOW, policy, 'market'), 'unknown')
  assert.equal(classifyFreshness(0, 0, policy, 'market'), 'fresh')

  // Evidence uses its own (longer) TTL.
  assert.equal(classifyFreshness(NOW, NOW + ttl + 1, policy, 'evidence'), 'fresh')
})

test('confidenceScore maps the four reference confidence levels', () => {
  assert.equal(confidenceScore('high'), 0.9)
  assert.equal(confidenceScore('medium'), 0.6)
  assert.equal(confidenceScore('low'), 0.3)
  assert.equal(confidenceScore('unresolved'), 0)
})

test('createConversationState is deterministic and empty', () => {
  const s = createConversationState(NOW)
  assert.equal(s.conversationId, `conv-${NOW.toString(36)}`)
  assert.equal(s.turnCount, 0)
  assert.equal(s.createdAt, NOW)
  assert.equal(s.updatedAt, NOW)
  resetConversationState(s, NOW + 500)
  assert.equal(s.createdAt, NOW + 500)
  assert.equal(s.turnCount, 0)
})