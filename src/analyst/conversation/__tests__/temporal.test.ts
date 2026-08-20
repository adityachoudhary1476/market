import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectTemporalReference } from '../temporal'

// TEST 10 — temporal references normalize relative language driven by the
// injected clock; no fabricated absolute dates are ever emitted.
const NOW = 1_720_000_000_000 // 2024-07-03T09:46:40Z (a Wednesday)
const WEDNESDAY = new Date(NOW).getDay() // 3
assert.equal(WEDNESDAY, 3, 'fixture NOW must be a Wednesday for deterministic weekday tests')

test('TEST 10 — relative periods normalize deterministically', () => {
  assert.equal(detectTemporalReference('How is NIFTY doing today?', NOW)?.normalized, 'today (the current session)')
  assert.equal(detectTemporalReference('Compare sectors this week', NOW)?.normalized, 'this week')
  assert.equal(detectTemporalReference('Last month was rough', NOW)?.normalized, 'last month')
  const last3d = detectTemporalReference('Over the last few days it sold off', NOW)
  assert.equal(last3d?.normalized, 'the last few days')
  assert.equal(last3d?.confidence, 'medium')
  assert.equal(detectTemporalReference('What happened recently?', NOW)?.normalized, 'recently')
})

test('weekdays resolve relative to the current clock — never an absolute date', () => {
  const monday = detectTemporalReference('How did Monday look?', NOW)
  assert.equal(monday?.kind, 'day-of-week')
  assert.equal(monday?.normalized, 'Monday of this week (relative to the current clock)')

  // Saturday is AFTER Wednesday → next week.
  const saturday = detectTemporalReference('Check Saturday data', NOW)
  assert.equal(saturday?.normalized, 'Saturday of next week (relative to the current clock)')

  // "since Monday" anchors to the current week.
  const since = detectTemporalReference('Since Monday, how has it moved?', NOW)
  assert.equal(since?.normalized, 'Monday of the current week (relative)')

  // No absolute ISO dates anywhere in the output.
  const all = [monday, saturday, since].map((t) => t?.normalized ?? '').join(' ')
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(all))
})

test('moment words and absence of temporal signal', () => {
  assert.equal(detectTemporalReference('Where is it right now?', NOW)?.normalized, 'now (the current moment)')
  assert.equal(detectTemporalReference('Compare TCS and Infosys', NOW), null)
  assert.equal(detectTemporalReference('', NOW), null)
})

test('the injected clock drives weekday math (determinism)', () => {
  const mondayNow = new Date('2024-07-01T10:00:00Z').getTime() // a Monday
  const sunday = detectTemporalReference('What about Sunday?', mondayNow)
  assert.equal(sunday?.normalized, 'Sunday of this week (relative to the current clock)')
})