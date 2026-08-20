import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanHistory } from '../scanner'
import { validateHistory } from '../validationEngine'
import { seriesFromCandles } from '../validationEngine'
import { DEFAULT_HISTORICAL_CONFIG } from '../config'
import { generateFixtureCandles } from './fixtures'
import { computeSetupOutcome } from '../outcomes'

const caps = { hasHighLow: false, hasVolume: false }

/**
 * No-lookahead proof (spec §39):
 *  1. Detection: mutating the FUTURE must not change which setups are detected
 *     at a given bar — detection at T sees only candles[0..T].
 *  2. Outcomes: mutating the future MUST change outcomes after T.
 */
test('2D lookahead: future mutations never change detection at T', () => {
  const a = generateFixtureCandles({ bars: 260, closeOnly: true, seed: 99 })
  const cut = 200 // bars after `cut` are mutated in series B

  // Series B: identical bars 0..cut, then a violent crash.
  const bCandles = a.candles.slice(0, cut + 1).map((c, i) => {
    if (i <= cut) return { ...c }
    return c
  })
  for (let i = cut + 1; i < a.candles.length; i++) {
    const prev = bCandles[i - 1].close
    const close = prev * (1 - 0.03) // -3% per bar collapse
    bCandles.push({ timestamp: a.candles[i].timestamp, open: prev, high: close, low: close, close, volume: null })
  }

  const scanA = scanHistory('TEST', a.candles, 'weekly', DEFAULT_HISTORICAL_CONFIG)
  const scanB = scanHistory('TEST', bCandles, 'weekly', DEFAULT_HISTORICAL_CONFIG)

  const setupsA = scanA.setups.filter((s) => s.barIndex <= cut)
  const setupsB = scanB.setups.filter((s) => s.barIndex <= cut)

  assert.equal(setupsA.length, setupsB.length, 'same number of setups up to the cut')

  const key = (s: (typeof setupsA)[number]) =>
    [s.barIndex, s.direction, s.pattern?.family, s.pattern?.name, s.evidenceSignature.trend, s.regime].join('|')

  const keysB = new Set(setupsB.map(key))
  for (const s of setupsA) {
    assert.ok(keysB.has(key(s)), `setup at bar ${s.barIndex} (${s.pattern?.name}) must be detected identically in B`)
  }
})

test('2D lookahead: future mutations DO change outcomes after T', () => {
  const a = generateFixtureCandles({ bars: 260, closeOnly: true, seed: 99 })
  const cut = 200
  const bCandles = a.candles.slice(0, cut + 1)
  for (let i = cut + 1; i < a.candles.length; i++) {
    const prev = bCandles[i - 1].close
    const close = prev * (1 - 0.03)
    bCandles.push({ timestamp: a.candles[i].timestamp, open: prev, high: close, low: close, close, volume: null })
  }

  const scanA = scanHistory('TEST', a.candles, 'weekly', DEFAULT_HISTORICAL_CONFIG)
  const scanB = scanHistory('TEST', bCandles, 'weekly', DEFAULT_HISTORICAL_CONFIG)

  const T = cut - DEFAULT_HISTORICAL_CONFIG.minimumForwardBars + 1 // T+20 lands inside the crash zone
  const setupA = scanA.setups.find((s) => s.barIndex === T)
  const setupB = scanB.setups.find((s) => s.barIndex === T)
  assert.ok(setupA && setupB, `a setup must exist at bar ${T} in both scans`)

  const oA = computeSetupOutcome(setupA, a.candles, false, false, DEFAULT_HISTORICAL_CONFIG)
  const oB = computeSetupOutcome(setupB, bCandles, false, false, DEFAULT_HISTORICAL_CONFIG)
  assert.ok(oA && oB)
  const h = DEFAULT_HISTORICAL_CONFIG.minimumForwardBars
  assert.notEqual(oA.horizons[String(h)].forwardReturn, oB.horizons[String(h)].forwardReturn)
  assert.ok(oA.horizons[String(h)].forwardReturn! > oB.horizons[String(h)].forwardReturn!)
})

test('2D lookahead: full-pipeline result reflects only the prefix visible at each bar', () => {
  const a = generateFixtureCandles({ bars: 260, closeOnly: true, seed: 99 })
  const cut = 180 // crash begins after this bar — lands inside some groups' 20-session windows
  const bCandles = a.candles.slice(0, cut + 1)
  for (let i = cut + 1; i < a.candles.length; i++) {
    const prev = bCandles[i - 1].close
    const close = prev * (1 - 0.03)
    bCandles.push({ timestamp: a.candles[i].timestamp, open: prev, high: close, low: close, close, volume: null })
  }
  const ctxA = validateHistory(seriesFromCandles('TEST', 'weekly', a.candles, caps))
  const ctxB = validateHistory(seriesFromCandles('TEST', 'weekly', bCandles, caps))
  assert.equal(ctxA.available, true)
  assert.equal(ctxB.available, true)
  // Detection is future-independent: identical groups and identical sample
  // sizes, because both pipelines saw the same prefixes up to the cut.
  assert.equal(ctxA.results.length, ctxB.results.length)
  const groupKey = (r: { pattern: { name: string; direction: string } | null }) =>
    `${r.pattern?.name ?? 'no-pattern'}|${r.pattern?.direction ?? 'none'}`
  const byKeyB = new Map(ctxB.results.map((r) => [groupKey(r), r]))
  for (const ra of ctxA.results) {
    const rb = byKeyB.get(groupKey(ra))
    assert.ok(rb, `group ${groupKey(ra)} must be present in B`)
    assert.equal(rb.sampleSize, ra.sampleSize)
  }
  // Outcomes are future-dependent: groups whose 20-session window overlaps
  // the crash must report a LOWER median return than the intact series.
  const affected = ctxA.results.filter((ra) => {
    const rb = byKeyB.get(groupKey(ra))!
    return ra.outcomes['20'].medianReturn !== rb.outcomes['20'].medianReturn
  })
  assert.ok(affected.length > 0, 'at least one group must reflect the mutated future')
  for (const ra of affected) {
    const rb = byKeyB.get(groupKey(ra))!
    assert.ok(ra.outcomes['20'].medianReturn! > rb.outcomes['20'].medianReturn!)
  }
})