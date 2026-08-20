// ---------------------------------------------------------------------------
// Phase 3O — Analyst Reasoning & Conversational Intelligence: follow-up
// classification tests.
//
// The UNDERSTAND stage now classifies how a turn continues (or starts) the
// analytical thread: why/risks/drivers/deepen/expand/opinion/premise/switch-
// subject/temporal-compare/counterfactual/bull-bear/confirmed — or "new" /
// "clarify". These are PROGRESSIVE-DISCLOSURE signals (how to answer), never
// routing. Tests cover: the classification matrix, thread-dependent kinds
// (bare follow-ups need an active thread, else they warrant one concise
// clarification), premise extraction (evaluated, never inherited), depth
// escalation for continuation asks, and the thread-meta mapping.
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyFollowUp,
  extractPremise,
  isContinuation,
  threadMetaOf,
  understandTurn,
  type FollowUpKind,
} from '../understanding'

function kind(text: string, hasActiveTopic = false): FollowUpKind {
  return classifyFollowUp(text, { hasActiveTopic }).kind
}

// --- The classification matrix ----------------------------------------------

test('F1 — fresh-ask turns with their own subject are `new`, never continuations', () => {
  assert.equal(kind('Is gold going up today?'), 'new')
  assert.equal(kind('Nifty outlook for this year?'), 'new')
  assert.equal(kind('Compare Gold and Brent'), 'new')
  assert.equal(kind('What is driving gold right now?'), 'new', 'an entity-named drivers ask is a fresh question')
  assert.equal(isContinuation('new'), false)
})

test('F2 — bare follow-ups need an active thread; without one they warrant a clarification', () => {
  assert.equal(kind('why?'), 'clarify')
  assert.equal(kind('what could kill it?'), 'clarify')
  assert.equal(kind('go deeper'), 'clarify')
  assert.equal(kind('expand on that'), 'clarify')
  assert.equal(kind("what's actually driving it?"), 'clarify')
  assert.ok(understandTurn('why?').needsClarification, 'bare why without a thread needs clarification')
})

test('F3 — the same bare ask WITH an active thread classifies as the continuation', () => {
  assert.equal(kind('why?', true), 'why')
  assert.equal(kind('why is it falling?', true), 'why')
  assert.equal(kind('what could kill it?', true), 'risks')
  assert.equal(kind('go deeper', true), 'deepen')
  assert.equal(kind('expand on that', true), 'deepen', 'expand-on-that is an elaboration ask')
  assert.equal(kind('in more depth', true), 'deepen')
  assert.equal(kind("what's actually driving it?", true), 'drivers')
  assert.equal(kind("what's the biggest risk to that view?", true), 'risks')
  assert.equal(kind('tell me more', true), 'expand')
  for (const k of ['why', 'risks', 'deepen', 'expand', 'drivers']) {
    assert.equal(isContinuation(k as FollowUpKind), true, `${k} is a continuation`)
  }
})

test('F4 — opinion, counterfactual, bull-bear, confirmed and temporal-compare asks', () => {
  assert.equal(kind('what do you think — should I buy?'), 'opinion')
  assert.equal(kind('what is your take on the move?'), 'opinion')
  assert.equal(kind('what if rates rise?'), 'counterfactual')
  assert.equal(kind('what would happen if the RBI hikes?'), 'counterfactual')
  assert.equal(kind('give me the bull case and the bear case', true), 'bull-bear')
  assert.equal(kind('is that confirmed or just reported?', true), 'confirmed')
  assert.equal(kind('is that actually verified?', true), 'confirmed')
  assert.equal(kind('compared to yesterday?', true), 'temporal-compare')
  assert.equal(kind('what changed since this morning?', true), 'temporal-compare')
})

test('F5 — a named switch-subject starts a new focus, never a bare continuation', () => {
  assert.equal(kind('what about gold now?'), 'switch-subject')
  assert.equal(kind('how about crude?'), 'switch-subject')
  assert.equal(kind('and what about Silver?'), 'switch-subject')
  assert.ok(isContinuation('switch-subject'))
})

// --- Premise extraction ------------------------------------------------------

test('F6 — an asserted causal premise is captured for evaluation, never inherited', () => {
  const u = understandTurn('gold is rising because of the weak dollar, right?')
  assert.equal(u.followUp, 'premise')
  assert.ok(u.premise, 'premise extracted')
  assert.ok(u.premise!.includes('weak dollar'), 'the claim is captured verbatim')
  assert.ok(!u.premise!.startsWith('of '), 'leading "of" is stripped')

  const u2 = understandTurn('oil rallied thanks to supply cuts')
  assert.equal(u2.followUp, 'premise')
  assert.equal(u2.premise, 'supply cuts')
})

test('F7 — premise text is bounded and never crashes on degenerate input', () => {
  const huge = `X rose because ${'y'.repeat(500)}`
  const u = understandTurn(huge)
  assert.ok(u.premise && u.premise.length <= 140, 'premise bounded')
  assert.equal(extractPremise('no causal clause here'), null)
  assert.equal(extractPremise(''), null)
  assert.equal(extractPremise('because'), null, 'bare "because" has no claim')
})

// --- Depth -------------------------------------------------------------------

test('F8 — continuation asks never get a "brief" answer, deepen/bull-bear go deep', () => {
  assert.equal(understandTurn('why?', { hasActiveTopic: true }).depth, 'standard')
  assert.equal(understandTurn('what could kill it?', { hasActiveTopic: true }).depth, 'standard')
  assert.equal(understandTurn('go deeper', { hasActiveTopic: true }).depth, 'deep')
  assert.equal(understandTurn('give me the bull case and the bear case', { hasActiveTopic: true }).depth, 'deep')
  assert.equal(understandTurn('how is Nifty doing?').depth, 'brief', 'short status stays brief')
  assert.equal(understandTurn('what is the Nifty outlook over the long term?').depth, 'deep', 'long-horizon stays deep')
})

// --- Thread meta -------------------------------------------------------------

test('F9 — threadMetaOf maps the structured intent/timeframe to thread meta', () => {
  assert.deepEqual(threadMetaOf(understandTurn('how is Nifty doing?')), { questionKind: 'status', timeframe: 'unspecified' })
  assert.deepEqual(threadMetaOf(understandTurn('any news on gold?')), { questionKind: 'news', timeframe: 'unspecified' })
  assert.deepEqual(threadMetaOf(understandTurn('compare Gold and Brent')), { questionKind: 'comparison', timeframe: 'unspecified' })
  assert.deepEqual(threadMetaOf(understandTurn('Nifty technicals today')), { questionKind: 'directional', timeframe: 'today' })
  assert.deepEqual(threadMetaOf(understandTurn('why is Nifty up?')), { questionKind: 'explanatory', timeframe: 'unspecified' })
  assert.deepEqual(threadMetaOf(understandTurn('Nifty outlook for this year')), { questionKind: 'directional', timeframe: 'longer' })
})

test('F10 — understandTurn is deterministic: same input, same classification', () => {
  const a = understandTurn("what's actually driving it?", { hasActiveTopic: true })
  const b = understandTurn("what's actually driving it?", { hasActiveTopic: true })
  assert.deepEqual(a, b)
})