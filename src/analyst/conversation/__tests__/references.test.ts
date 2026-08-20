import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createConversationSession } from '../session'
import { resolveReferences, detectCorrections, extractComparisonDimensions } from '../references'
import { makeResponse, NOW } from './helpers'

function seededSession() {
  const session = createConversationSession({}, NOW)
  const r1 = session.resolve('Why is NIFTY weak?', NOW)
  session.update(r1, { response: makeResponse({ title: 'NIFTY read' }), evidence: [], sources: [], now: NOW })
  return session
}

// TEST 6 — pronouns resolve to the primary topic with high confidence when
// it is unambiguous.
test('TEST 6 — pronouns resolve to the active topic with confidence', () => {
  const session = seededSession()
  const refs = resolveReferences('Is it still bullish?', session.state)
  const it = refs.find((r) => r.raw === 'it')
  assert.ok(it)
  assert.equal(it.entityId, 'nifty-50')
  assert.equal(it.confidence, 'high')

  // A second active entity lowers confidence (still resolvable, not a guess).
  const r2 = session.resolve('Also check TCS', NOW + 1000)
  session.update(r2, { response: makeResponse(), evidence: [], sources: [], now: NOW + 1000 })
  const refs2 = resolveReferences('Is it still bullish?', session.state)
  // Both NIFTY and TCS are active now; "it" leans to the current focus (TCS)
  // but is genuinely ambiguous → medium confidence, never a silent guess.
  assert.equal(refs2.find((r) => r.raw === 'it')?.confidence, 'medium')
  assert.equal(refs2.find((r) => r.raw === 'it')?.entityId, 'TCS')
})

test('pronouns with NO active entity are unresolved, never guessed', () => {
  const session = createConversationSession({}, NOW)
  const refs = resolveReferences('Is it still bullish?', session.state)
  const it = refs.find((r) => r.raw === 'it')
  assert.equal(it?.confidence, 'unresolved')
  assert.equal(it?.entityId, undefined)
})

// TEST 7 — comparison references: "the other one", "which one", "both",
// "the stronger one" resolve against the active comparison pair.
test('TEST 7 — comparison references resolve against the active pair', () => {
  const session = createConversationSession({}, NOW)
  const r1 = session.resolve('Compare NIFTY 50 and Bank Nifty', NOW)
  session.update(r1, { response: makeResponse({ intent: 'compare' }), evidence: [], sources: [], now: NOW })

  const refs = resolveReferences('Which one is stronger today?', session.state)
  const which = refs.find((r) => r.raw === 'which one')
  assert.equal(which?.entityId, 'nifty-50')
  assert.equal(which?.confidence, 'medium')
  assert.ok(which?.reason.includes('Bank Nifty'), 'the pair members are explicit in the reason')

  const other = resolveReferences('What about the other one?', session.state)
    .find((r) => r.kind === 'comparison' && r.reason.includes('the other'))
  assert.ok(other)
  assert.equal(other.confidence, 'high')

  const both = resolveReferences('Give me both of them', session.state)
    .find((r) => r.raw === 'both')
  assert.equal(both?.confidence, 'high')
  assert.ok(both?.displayName?.includes('Nifty 50'), 'both members are explicit')

  const stronger = resolveReferences('Which is the leader?', session.state)
    .find((r) => r.raw === 'the stronger one')
  // "the leader" is meaningful but the stronger member is a TOOL question —
  // medium confidence, never an unresolved guess.
  assert.equal(stronger?.confidence, 'medium')
  assert.equal(stronger?.entityId, 'nifty-50')
})

test('comparison dimensions are a bounded deterministic vocabulary', () => {
  assert.deepEqual(extractComparisonDimensions('Compare on momentum and trend'), ['momentum', 'trend'])
  assert.deepEqual(extractComparisonDimensions('Compare on momentum and momentum'), ['momentum'])
  assert.deepEqual(extractComparisonDimensions('Just compare them'), [])
})

// TEST 8 — corrections: "Actually, I meant X" records the correction, marks
// the previous focus and switches the primary entity.
test('TEST 8 — corrections record previous/target and switch the focus', () => {
  const session = seededSession()
  const correction = detectCorrections('Actually, I meant TCS, not NIFTY', session.state)
  assert.equal(correction.length, 1)
  assert.equal(correction[0].corrected, 'TCS')
  assert.equal(correction[0].previous, 'nifty-50')

  const resolution = session.resolve('Actually, I meant TCS, not NIFTY', NOW + 1000)
  session.update(resolution, { response: makeResponse({ title: 'TCS read' }), evidence: [], sources: [], now: NOW + 1000 })

  const s = session.state
  assert.equal(s.activeTopic, 'TCS')
  assert.equal(s.corrections.length, 1)
  assert.equal(s.corrections[0].corrected, 'TCS')
  assert.equal(s.corrections[0].previous, 'nifty-50')
  // The corrected entity became primary; NIFTY remains remembered.
  assert.equal(s.activeEntities.find((e) => e.id === 'TCS')?.role, 'primary')
  assert.ok(s.activeEntities.some((e) => e.id === 'nifty-50'))
})

test('corrections with no resolvable entity are recorded, not guessed', () => {
  const session = seededSession()
  const correction = detectCorrections('Actually, ignore that question', session.state)
  assert.equal(correction.length, 1)
  assert.equal(correction[0].corrected, undefined)
  assert.equal(correction[0].previous, undefined)
})

test('role references: "the index", "the market", "the sector"', () => {
  const session = seededSession()
  const refs = resolveReferences('Is the index above its 20-day EMA?', session.state)
  const index = refs.find((r) => r.raw === 'the index')
  assert.equal(index?.entityId, 'nifty-50')
  assert.equal(index?.confidence, 'high')

  const market = resolveReferences('How is the market doing?', session.state)
    .find((r) => r.raw === 'the market')
  assert.equal(market?.confidence, 'high')
  assert.equal(market?.entityId, undefined) // broad context, not an instrument

  const sector = resolveReferences('Is the sector leading?', session.state)
    .find((r) => r.raw === 'the sector')
  assert.equal(sector?.confidence, 'low') // sectors are not tracked → ask
})

// TEST 9 — meaningful ambiguity is surfaced, never silently assumed.
test('TEST 9 — low-confidence/unresolved references flag needsClarification', () => {
  const session = createConversationSession({}, NOW)
  const r = session.resolve('Is the sector leading today?', NOW)
  assert.ok(r.interpretation.needsClarification)
  assert.ok(r.interpretation.references.some((ref) => ref.confidence === 'low'))

  // Once a topic is active and unambiguous, no clarification is needed.
  const r2 = session.resolve('Why is NIFTY weak?', NOW + 1000)
  session.update(r2, { response: makeResponse(), evidence: [], sources: [], now: NOW + 1000 })
  const r3 = session.resolve('Is it still weak?', NOW + 2000)
  assert.ok(!r3.interpretation.needsClarification)
})

test('the reference-confidence threshold is configurable', () => {
  const strict = createConversationSession({ referenceConfidenceThreshold: 0.7 }, NOW)
  strict.update(strict.resolve('Why is NIFTY weak?', NOW), { response: makeResponse(), evidence: [], sources: [], now: NOW })
  // With two active entities "it" is medium (0.6) < 0.7 → flagged.
  const r = strict.resolve('Is it still weak? And TCS?', NOW + 1000)
  strict.update(r, { response: makeResponse(), evidence: [], sources: [], now: NOW + 1000 })
  const flagged = strict.resolve('What about it now?', NOW + 2000)
  assert.ok(flagged.interpretation.needsClarification)
})