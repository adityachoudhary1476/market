import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createConversationSession } from '../session'
import { suggestFollowUps } from '../contextBuilder'
import { makeResponse, makeSource, makeToolResult, NOW } from './helpers'

function richSession() {
  const session = createConversationSession({}, NOW)
  const r1 = session.resolve('Compare NIFTY 50 and Bank Nifty on momentum', NOW)
  session.update(r1, {
    response: makeResponse({
      intent: 'compare',
      title: 'NIFTY vs Bank Nifty',
      findings: [
        { kind: 'fact', title: 'Momentum', detail: 'NIFTY RSI 54 vs Bank Nifty 61.' },
        { kind: 'inference', title: 'Relative strength', detail: 'Bank Nifty is leading.' },
      ],
    }),
    evidence: [{ result: makeToolResult(), entity: 'nifty-50' }],
    sources: [makeSource()],
    now: NOW,
  })
  return session
}

// TEST 11 — the context payload is bounded, deterministic and never
// fabricates: it only contains what memory actually holds.
test('TEST 11 — context payload carries memory with provenance, no fabrication', () => {
  const session = richSession()
  const r = session.resolve('Which one is stronger today?', NOW + 1000)
  const payload = r.payload

  assert.ok(payload.startsWith('CONVERSATION CONTEXT'))
  assert.ok(payload.includes('nifty-50'))
  assert.ok(payload.includes('Bank Nifty'))
  assert.ok(payload.includes('Active comparison'), 'comparison memory present')
  assert.ok(payload.includes('momentum'), 'comparison dimensions present')
  assert.ok(payload.includes('Recent important findings'))
  assert.ok(payload.includes('Latest tool evidence'))
  assert.ok(payload.includes('example.com'), 'sources present')
  assert.ok(payload.includes('This turn'), 'turn interpretation present')
  assert.ok(payload.includes('which one'))
  assert.ok(payload.includes('turn'), 'memory entries carry turn provenance')
  assert.ok(payload.includes('fresh'), 'freshness labels present')
  assert.ok(!payload.includes('2024-07-05T14:26:40Z'), 'no fabricated absolute timestamps')
  assert.ok(!payload.includes('says') && !payload.includes('claimed'), 'no invented claims')
})

test('context payload is hard-capped at maxContextChars', () => {
  const session = createConversationSession({ maxContextChars: 400 }, NOW)
  for (let i = 0; i < 6; i += 1) {
    const r = session.resolve(`Why is NIFTY weak? Question ${i}`, NOW + i * 1000)
    session.update(r, {
      response: makeResponse({ title: `A${i}` }),
      evidence: [makeToolResult(), makeToolResult()].map((result) => ({ result })),
      sources: [makeSource(), makeSource()],
      now: NOW + i * 1000,
    })
  }
  const payload = session.resolve('Is it still weak?', NOW + 7000).payload
  assert.ok(payload.length <= 400 + 64, `payload capped (${payload.length})`)
  assert.ok(payload.includes('…[context truncated]'), 'truncation is explicit')
})

test('empty memory yields an honest, minimal payload', () => {
  const session = createConversationSession({}, NOW)
  const payload = session.resolve('Hi', NOW).payload
  assert.ok(payload.includes('CONVERSATION CONTEXT'))
  assert.ok(!payload.includes('nifty-50'))
  assert.ok(!payload.includes('Active entities'))
})

test('corrections appear in the payload with the walked-back mapping', () => {
  const session = createConversationSession({}, NOW)
  const r1 = session.resolve('Why is TCS weak?', NOW)
  session.update(r1, { response: makeResponse(), evidence: [], sources: [], now: NOW })
  const r2 = session.resolve('Actually, I meant Infosys', NOW + 1000)
  session.update(r2, { response: makeResponse(), evidence: [], sources: [], now: NOW + 1000 })
  const payload = session.resolve('Is it still weak?', NOW + 2000).payload
  assert.ok(payload.includes('TCS → INFY'), 'correction mapping is explicit')
})

test('suggestFollowUps derives chips only from memory (never routed)', () => {
  const session = richSession()
  const ups = suggestFollowUps(session.state)
  assert.ok(ups.length >= 1)
  assert.ok(ups.some((u) => u.includes('stronger')), 'comparison-aware chip')
  assert.ok(ups.every((u) => !u.includes('technicalAnalysis')), 'no tool routing in chips')

  const fresh = createConversationSession({}, NOW)
  assert.deepEqual(suggestFollowUps(fresh.state), [])
})