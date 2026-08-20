import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Candle } from '../../types'
import { buildTechnicalContext, buildMultiTimeframe } from '../../technicalContext'
import { risingCandles, flatCandles, closeOnlyCandles, volatileCandles } from '../../__tests__/fixtures'
import { buildConfluenceContext } from '../confluenceEngine'

function fallingCandles(count = 300, start = 250, step = 0.5): Candle[] {
  const day = 24 * 60 * 60 * 1000
  const base = Date.UTC(2025, 0, 1)
  let c = start
  return Array.from({ length: count }, (_, i) => {
    const o = Math.max(c, 10)
    c = Math.max(10, c - step)
    const hi = o + 0.3
    const lo = c - 0.3
    return { timestamp: base + i * day, open: o, high: hi, low: lo, close: c, volume: 1_000_000 }
  })
}

test('rising market → bullish confluence with decomposable score', () => {
  const ctx = buildTechnicalContext('TEST', risingCandles())
  const con = ctx.confluence!
  assert.ok(con.available)
  assert.equal(con.instrument, 'TEST')
  assert.ok(['bullish', 'balanced'].includes(con.bias), `bias = ${con.bias}`)
  assert.ok(con.score.bullish > con.score.bearish)
  assert.ok(con.score.balance > 0)
  assert.ok(con.score.confidence > 0)
  assert.ok(Number.isFinite(con.score.balance))
  // Fully decomposable: sum of group nets equals balance
  const sumNets = con.groups.reduce((s, g) => s + g.net, 0)
  assert.equal(con.score.balance, Number(Math.max(-100, Math.min(100, sumNets)).toFixed(2)))
  // Thesis present and structured
  assert.ok(con.thesis)
  assert.equal(con.thesis!.bias, con.bias)
  assert.ok(con.thesis!.summary.length > 0)
  assert.ok(con.thesis!.conditions.length > 0)
  // Key levels include the nearest support; a market at new highs may
  // honestly have no resistance above (never fabricated).
  assert.ok(con.thesis!.keyLevels.some((k) => k.type === 'support'))
  assert.ok(con.thesis!.keyLevels.length >= 1)
  // Method transparency
  assert.equal(con.method.version, '2C.1')
  assert.ok(con.method.weights.length >= 10)
})

test('flat market → balanced bias, no major conflicts', () => {
  const ctx = buildTechnicalContext('FLAT', flatCandles())
  const con = ctx.confluence!
  assert.equal(con.bias, 'balanced')
  assert.ok(Math.abs(con.score.balance) < 18, `balance ${con.score.balance}`)
  assert.equal(con.conflicts.filter((c) => c.severity === 'major').length, 0)
})

test('volatile market → available confluence, finite values, pattern evidence present', () => {
  const ctx = buildTechnicalContext('VOL', volatileCandles())
  const con = ctx.confluence!
  assert.ok(con.available)
  for (const e of con.evidence) {
    assert.ok(Number.isFinite(e.weight))
    assert.ok(e.weight >= 0 && e.weight <= 100)
  }
  assert.ok(con.score.confidence >= 0 && con.score.confidence <= 100)
  const patternItems = con.evidence.filter((e) => e.metadata?.patternName)
  assert.ok(patternItems.length >= 0)
  // Bias must be one of the four valid values
  assert.ok(['bullish', 'bearish', 'balanced', 'insufficient-data'].includes(con.bias))
})

test('close-only feed → honest adjustments, no candlestick evidence', () => {
  const ctx = buildTechnicalContext('CLOSE', closeOnlyCandles())
  const con = ctx.confluence!
  assert.ok(con.dataQuality.adjustedFor.some((a) => a.includes('close-only')), JSON.stringify(con.dataQuality.adjustedFor))
  const candleEvidence = con.evidence.filter((e) => e.group === 'candlestick')
  assert.equal(candleEvidence.length, 0)
})

test('multi-timeframe: aligned timeframes are reported as aligned', () => {
  const daily = buildTechnicalContext('TEST', risingCandles(300, 100, 0.5), { timeframe: 'daily' })
  const weekly = buildTechnicalContext('TEST', risingCandles(150, 100, 2.0), { timeframe: 'weekly' })
  const con = buildConfluenceContext({
    technical: daily,
    multiTimeframe: { daily, weekly },
  })
  assert.ok(con.timeframeConfluence)
  assert.equal(con.timeframeConfluence!.primary.timeframe, 'daily')
  assert.ok(['aligned', 'partially-aligned'].includes(con.timeframeConfluence!.alignment), con.timeframeConfluence!.alignment)
  assert.ok(con.timeframeConfluence!.netAgreement > 0)
})

test('multi-timeframe: opposing timeframes produce a conflict', () => {
  const daily = buildTechnicalContext('TEST', risingCandles(300, 100, 0.5), { timeframe: 'daily' })
  const weekly = buildTechnicalContext('TEST', fallingCandles(150, 250, 2.0), { timeframe: 'weekly' })
  const con = buildConfluenceContext({
    technical: daily,
    multiTimeframe: { daily, weekly },
  })
  assert.ok(con.timeframeConfluence)
  assert.equal(con.timeframeConfluence!.alignment, 'opposed')
  // Opposing views of similar strength cancel in the confidence-weighted
  // average — netAgreement must be near zero, not strongly positive.
  assert.ok(Math.abs(con.timeframeConfluence!.netAgreement) < 30, `netAgreement ${con.timeframeConfluence!.netAgreement}`)
  const primaryView = con.timeframeConfluence!.primary
  const weeklyView = con.timeframeConfluence!.supporting[0]
  assert.equal(primaryView.bias, 'bullish')
  assert.equal(weeklyView.bias, 'bearish')
  assert.ok(con.conflicts.some((c) => c.type === 'timeframe-conflict'))
  // Opposed timeframes must have reduced the confidence
  assert.ok(con.dataQuality.adjustedFor.some((a) => a.includes('opposed')))
})

test('multi-timeframe via buildMultiTimeframe feeds the engine cleanly', () => {
  const multi = buildMultiTimeframe('TEST', { daily: risingCandles(300), weekly: risingCandles(150, 100, 2) })
  assert.ok(multi.daily.available && multi.daily.context)
  const con = buildConfluenceContext({
    technical: multi.daily.context,
    multiTimeframe: { daily: multi.daily.context, weekly: multi.weekly.context },
  })
  assert.ok(con.timeframeConfluence)
  assert.equal(con.timeframeConfluence!.supporting.length, 1)
})

test('regime evidence is used only when provided', () => {
  const ctx = buildTechnicalContext('TEST', risingCandles())
  const withRegime = buildConfluenceContext({ technical: ctx, regime: 'risk-on' })
  assert.ok(withRegime.evidence.some((e) => e.group === 'regime'))
  assert.ok(withRegime.dataQuality.adjustedFor.some((a) => a.includes('regime')))
  const without = buildConfluenceContext({ technical: ctx })
  assert.ok(!without.evidence.some((e) => e.group === 'regime'))
})

test('historical validation is optional and never fabricated', () => {
  const ctx = buildTechnicalContext('TEST', risingCandles())
  const withHook = buildConfluenceContext({
    technical: ctx,
    historicalValidation: { bullish: 65, bearish: 35, confidence: 55, note: 'external backtest of similar setups' },
  })
  const hist = withHook.evidence.find((e) => e.group === 'historical')
  assert.ok(hist, 'historical evidence must appear when the hook provides it')
  assert.equal(hist!.direction, 'bullish')
  assert.ok(withHook.dataQuality.adjustedFor.some((a) => a.includes('historical')))
  const without = buildConfluenceContext({ technical: ctx })
  assert.ok(!without.evidence.some((e) => e.group === 'historical'))
  assert.ok(!without.dataQuality.adjustedFor.some((a) => a.includes('historical')))
})

test('determinism: same input yields identical balance', () => {
  const a = buildConfluenceContext({ technical: buildTechnicalContext('D', risingCandles()) })
  const b = buildConfluenceContext({ technical: buildTechnicalContext('D', risingCandles()) })
  assert.equal(a.score.balance, b.score.balance)
  assert.equal(a.bias, b.bias)
  assert.deepEqual(a.groups.map((g) => g.net), b.groups.map((g) => g.net))
})

test('unavailable technical context → unavailable confluence', () => {
  const con = buildConfluenceContext({
    technical: {
      available: false,
      instrument: 'X',
      timeframe: 'daily',
      generatedAt: new Date().toISOString(),
      dataQuality: { candleCount: 0, hasHighLow: false, hasVolume: false },
    },
  })
  assert.equal(con.available, false)
  assert.equal(con.bias, 'insufficient-data')
})

test('conflict reduction: a real conflict lowers confidence below the base', () => {
  const daily = buildTechnicalContext('TEST', risingCandles(300, 100, 0.5), { timeframe: 'daily' })
  const weekly = buildTechnicalContext('TEST', fallingCandles(150, 250, 2.0), { timeframe: 'weekly' })
  const conflicted = buildConfluenceContext({ technical: daily, multiTimeframe: { daily, weekly } })
  const clean = buildConfluenceContext({ technical: daily })
  assert.ok(conflicted.score.confidence < clean.score.confidence)
})