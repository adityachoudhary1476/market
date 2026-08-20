import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createConversationSession } from '../session'
import { makeResponse, NOW } from './helpers'

// End-to-end resolution: one message against a seeded session produces a
// TurnResolution that is pure (state unchanged), deterministic and carries
// everything the orchestrator needs.
test('resolveTurn is pure — it never mutates the state', () => {
  const session = createConversationSession({}, NOW)
  const before = JSON.stringify(session.state)
  const r = session.resolve('Why is NIFTY weak?', NOW)
  assert.equal(JSON.stringify(session.state), before)
  assert.equal(r.text, 'Why is NIFTY weak?')
  assert.ok(r.payload.length > 0)
})

test('resolveTurn is deterministic for identical inputs', () => {
  const a = createConversationSession({}, NOW)
  const b = createConversationSession({}, NOW)
  const ra = a.resolve('Compare NIFTY 50 and Bank Nifty on momentum', NOW)
  const rb = b.resolve('Compare NIFTY 50 and Bank Nifty on momentum', NOW)
  assert.equal(ra.payload, rb.payload)
  assert.deepEqual(ra.interpretation, rb.interpretation)
})

test('corrections are carried in the TurnResolution', () => {
  const session = createConversationSession({}, NOW)
  session.update(session.resolve('Analyze TCS', NOW), { response: makeResponse(), evidence: [], sources: [], now: NOW })
  const r = session.resolve('Actually, I meant Infosys', NOW + 1000)
  assert.equal(r.corrections.length, 1)
  assert.equal(r.corrections[0].corrected, 'INFY')
  assert.equal(r.corrections[0].previous, 'TCS')
})

test('a comparison continues across turns without re-mentioning entities', () => {
  const session = createConversationSession({}, NOW)
  const r1 = session.resolve('Compare NIFTY 50 and Bank Nifty', NOW)
  session.update(r1, { response: makeResponse({ intent: 'compare' }), evidence: [], sources: [], now: NOW })

  const r2 = session.resolve('Which one is stronger?', NOW + 1000)
  assert.ok(r2.interpretation.comparison, 'comparison continues')
  assert.deepEqual(r2.interpretation.comparison?.entities, ['nifty-50', 'bank-nifty'])
  assert.equal(r2.interpretation.entities[0]?.id, 'nifty-50')

  session.update(r2, { response: makeResponse(), evidence: [], sources: [], now: NOW + 1000 })
  assert.equal(session.state.activeComparison?.sourceTurn, 2)
  assert.equal(session.state.activeComparison?.entities.join(','), 'nifty-50,bank-nifty')
})

test('a NEW explicit comparison replaces the old one', () => {
  const session = createConversationSession({}, NOW)
  session.update(session.resolve('Compare NIFTY 50 and Bank Nifty', NOW), { response: makeResponse(), evidence: [], sources: [], now: NOW })
  const r2 = session.resolve('Now compare TCS and Infosys', NOW + 1000)
  assert.deepEqual(r2.interpretation.comparison?.entities, ['TCS', 'INFY'])
})

test('unresolved references are recorded into the state after update', () => {
  const session = createConversationSession({}, NOW)
  const r = session.resolve('Is the sector leading?', NOW)
  assert.ok(r.interpretation.needsClarification)
  session.update(r, { response: makeResponse(), evidence: [], sources: [], now: NOW })
  assert.ok(session.state.unresolvedReferences.length > 0)
  assert.equal(session.state.unresolvedReferences[0].raw, 'the sector')
})

test('lastResponseMetadata and activeQuestion track the latest turn', () => {
  const session = createConversationSession({}, NOW)
  session.update(session.resolve('Why is NIFTY weak?', NOW), {
    response: makeResponse({ confidence: 'High', partial: false }),
    evidence: [],
    sources: [],
    now: NOW,
  })
  const meta = session.state.lastResponseMetadata
  assert.equal(meta?.intent, 'explain')
  assert.equal(meta?.title, 'Why NIFTY is weak')
  assert.equal(meta?.confidence, 'High')
  assert.equal(session.state.activeQuestion, 'Why is NIFTY weak?')
  assert.equal(session.state.turnCount, 1)
  assert.equal(session.state.recentUserMessages[0].turn, 1)
})