import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createConversationSession } from '../session'
import { extractExplicitEntities, resolveEntityId, entityDisplayNames } from '../entities'
import { makeResponse, NOW } from './helpers'

// TEST 4 — entity memory: explicit mentions become active entities with the
// first one as primary (conversation focus).
test('TEST 4 — explicit entities become active with primary/context roles', () => {
  const session = createConversationSession({}, NOW)
  const r = session.resolve('Compare NIFTY 50 and Bank Nifty on momentum', NOW)
  session.update(r, { response: makeResponse(), evidence: [], sources: [], now: NOW })

  const ids = session.state.activeEntities.map((e) => e.id)
  assert.ok(ids.includes('nifty-50'))
  assert.ok(ids.includes('bank-nifty'))
  assert.equal(session.state.activeTopic, 'nifty-50')
  assert.equal(session.state.activeEntities.find((e) => e.id === 'nifty-50')?.role, 'primary')
  assert.equal(session.state.activeEntities.find((e) => e.id === 'bank-nifty')?.role, 'context')
  assert.equal(session.state.activeComparison?.entities.join(','), 'nifty-50,bank-nifty')
  assert.ok(session.state.activeComparison?.dimensions.includes('momentum'))
})

test('entity extraction only resolves real instruments (never invents)', () => {
  const entities = extractExplicitEntities('What about FakeStockXYZ and TCS?')
  assert.equal(entities.length, 1)
  assert.equal(entities[0].id, 'TCS')
  assert.equal(resolveEntityId('Tata Consultancy Services'), 'TCS')
  assert.equal(resolveEntityId('totally-made-up-name'), undefined)
})

// TEST 5 — entity memory is bounded: active overflow demotes to recent and
// recent drops the oldest; display names survive demotion.
test('TEST 5 — entity memory bounds: overflow demotes, then drops oldest', () => {
  const session = createConversationSession(
    { maxActiveEntities: 2, maxRecentEntities: 3 },
    NOW,
  )
  const stocks = ['TCS', 'INFY', 'RELIANCE', 'HDFCBANK', 'SBIN', 'LT']
  let now = NOW
  for (const s of stocks) {
    const r = session.resolve(`Analyze ${s}`, now)
    session.update(r, { response: makeResponse(), evidence: [], sources: [], now })
    now += 1000
  }

  const state = session.state
  assert.ok(state.activeEntities.length <= 2)
  assert.ok(state.recentEntities.length <= 3)
  // The two most recent names are active; older names moved to recent.
  assert.equal(state.activeEntities[0].id, 'LT')
  assert.equal(state.activeEntities[1].id, 'SBIN')
  const recentIds = state.recentEntities.map((e) => e.id)
  assert.ok(recentIds.includes('HDFCBANK'))
  // Oldest name (TCS) is gone entirely once recent memory is full.
  assert.ok(!recentIds.includes('TCS'))
  assert.ok(!state.activeEntities.some((e) => e.id === 'TCS'))

  // Display names remain resolvable for everything still remembered.
  const names = entityDisplayNames(state, ['LT', 'SBIN', 'HDFCBANK'])
  assert.equal(names.length, 3)
  assert.ok(names.every((n) => n.length > 0))
})

test('evidence entities (from tool calls) are remembered as context', () => {
  const session = createConversationSession({}, NOW)
  const r = session.resolve('Why is NIFTY weak?', NOW)
  session.update(r, {
    response: makeResponse(),
    evidence: [{ result: { ok: true, data: null, error: null, metadata: { tool: 'getTechnicalAnalysis', timestamp: '', source: 'technical-engine', available: true, warnings: [] } }, entity: 'nifty-50' }],
    sources: [],
    now: NOW,
  })
  const tool = session.state.recentToolEvidence[0]
  assert.equal(tool.entity, 'nifty-50')
  assert.equal(tool.tool, 'getTechnicalAnalysis')
  assert.equal(session.state.activeTopic, 'nifty-50')
})