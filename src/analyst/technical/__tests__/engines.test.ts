import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectSwings, calculateMarketStructure } from '../marketStructure'
import { calculateSupportResistance } from '../supportResistance'
import { calculateVolume } from '../volume'
import { calculateVolatility } from '../volatility'
import { calculateTrend } from '../trend'
import { calculateIndicators } from '../indicators'
import { generateSignals } from '../signals'
import { buildTechnicalContext, buildMultiTimeframe } from '../technicalContext'
import { validateCandles, getCapabilities } from '../validation'
import { risingCandles, flatCandles, singleCandle, closeOnlyCandles, volatileCandles } from './fixtures'
import type { Candle } from '../types'

test('swing detection finds highs and lows', () => {
  const mk = (arr: number[]): Candle[] =>
    arr.map((c, i) => ({ timestamp: i, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 1000 }))
  const { highs, lows } = detectSwings(mk([10, 11, 12, 13, 12, 11, 10, 11, 12, 13, 14]), 2)
  assert.ok(highs.length > 0)
  assert.ok(lows.length > 0)
})

test('market structure: bullish on a rising volatile series', () => {
  // Use a volatile uptrend so swing highs/lows actually form (a monotonic
  // line with tiny fixed wicks produces no fractal swings, which is correct).
  const c = volatileCandles(160, 100).map((x, i, arr) => ({
    ...x,
    close: x.close + i * 0.15,
    high: Math.max(x.high, x.close) + 0.1,
    low: Math.min(x.low, arr[Math.max(0, i - 1)].close) - 0.1,
  }))
  const s = calculateMarketStructure(c)
  assert.ok(['bullish', 'transitioning'].includes(s.state), `state was ${s.state}`)
  assert.ok(s.recentSwingHighs.length > 0 || s.recentSwingLows.length > 0)
})

test('market structure: insufficient data', () => {
  assert.equal(calculateMarketStructure(singleCandle()).state, 'insufficient-data')
})

test('market structure: close-only returns insufficient (no H/L)', () => {
  const s = calculateMarketStructure(closeOnlyCandles(60))
  assert.equal(s.state, 'insufficient-data')
})

test('capabilities: detects close-only feeds', () => {
  assert.equal(getCapabilities(closeOnlyCandles(40)).hasHighLow, false)
  assert.equal(getCapabilities(risingCandles(40)).hasHighLow, true)
})

test('support/resistance returns zones relative to price', () => {
  const c = risingCandles(200, 100)
  const price = c[c.length - 1].close
  const sr = calculateSupportResistance(c)
  if (sr.nearestResistance) assert.ok(sr.nearestResistance.low > price)
  if (sr.nearestSupport) assert.ok(sr.nearestSupport.high < price)
})

test('relative volume classifies state', () => {
  const c = risingCandles(60, 100)
  c[c.length - 1] = { ...c[c.length - 1], volume: c[c.length - 1].volume! * 10 }
  const v = calculateVolume(c)
  assert.ok(['high', 'veryHigh'].includes(v.state as string))
  assert.ok((v.relativeVolume as number) > 1)
})

test('volume: unavailable without volume', () => {
  assert.equal(calculateVolume(closeOnlyCandles(40)).available, false)
})

test('volatility: produces a regime', () => {
  const v = calculateVolatility(risingCandles(60))
  assert.ok(v.atr != null && v.atrPercent != null)
  assert.ok(['low', 'normal', 'elevated', 'high'].includes(v.state as string))
})

test('trend: bullish long-term on strong uptrend', () => {
  const c = risingCandles(260, 100, 1)
  const ind = calculateIndicators(c)
  const t = calculateTrend(c, ind)
  assert.equal(t.longTerm.direction, 'bullish')
  assert.ok(t.shortTerm.evidence.length > 0)
})

test('trend: insufficient-data on single candle', () => {
  const ind = calculateIndicators(singleCandle())
  assert.equal(calculateTrend(singleCandle(), ind).shortTerm.direction, 'insufficient-data')
})

test('signals: every signal has evidence, no BUY/SELL', () => {
  const c = risingCandles(260)
  const ind = calculateIndicators(c)
  const trend = calculateTrend(c, ind)
  const signals = generateSignals({
    candles: c, indicators: ind, trend,
    structure: calculateMarketStructure(c),
    volume: calculateVolume(c),
    volatility: calculateVolatility(c),
    sr: calculateSupportResistance(c),
  })
  assert.ok(signals.length >= 5)
  for (const s of signals) {
    assert.ok(s.evidence.length > 0)
    assert.ok(['bullish', 'bearish', 'neutral'].includes(s.direction))
    assert.ok(s.strength >= 0 && s.strength <= 100)
  }
  const text = JSON.stringify(signals).toUpperCase()
  assert.ok(!text.includes('STRONG BUY'))
  assert.ok(!text.includes('STRONG SELL'))
})

test('builder: complete structured context', () => {
  const ctx = buildTechnicalContext('TEST', risingCandles(260))
  assert.equal(ctx.available, true)
  assert.equal(ctx.instrument, 'TEST')
  assert.ok(ctx.signals.length > 0)
  assert.ok(ctx.indicators.rsi.value != null)
  assert.ok(ctx.indicators.macd.macd != null)
  assert.equal(ctx.dataQuality.hasVolume, true)
})

test('builder: honest on close-only data — H/L indicators null but MA/RSI work', () => {
  const ctx = buildTechnicalContext('CLOSE', closeOnlyCandles(52))
  assert.equal(ctx.available, true)
  assert.equal(ctx.dataQuality.hasHighLow, false)
  // close-only indicators work
  assert.ok(ctx.indicators.rsi.value != null)
  assert.ok(ctx.indicators.movingAverages.ema[20].value != null)
  // H/L-dependent are honestly null
  assert.equal(ctx.indicators.atr.value, null)
  assert.equal(ctx.indicators.adx.adx, null)
  // volume-dependent unavailable
  assert.equal(ctx.indicators.obv.available, false)
  assert.ok(ctx.dataQuality.warnings.some((w) => w.includes('High/low')))
})

test('builder: invalid data is unavailable', () => {
  const bad: Candle[] = [{ timestamp: 1, open: 10, high: 9, low: 11, close: 10, volume: 1 }]
  const ctx = buildTechnicalContext('BAD', bad)
  assert.equal(ctx.available, false)
  assert.equal(ctx.signals.length, 0)
})

test('builder: empty array does not crash', () => {
  assert.equal(buildTechnicalContext('EMPTY', []).available, false)
})

test('multi-timeframe: missing timeframes marked unavailable', () => {
  const daily = risingCandles(260)
  const mtf = buildMultiTimeframe('TEST', { daily })
  assert.equal(mtf.daily.available, true)
  assert.equal(mtf.intraday.available, false)
  assert.equal(mtf.weekly.available, false)
  assert.ok(mtf.daily.context != null)
})

test('validation: rejects unsorted timestamps and negative volume', () => {
  const c: Candle[] = [
    { timestamp: 2, open: 10, high: 11, low: 9, close: 10, volume: 1 },
    { timestamp: 1, open: 10, high: 11, low: 9, close: 10, volume: 1 },
  ]
  assert.equal(validateCandles(c).valid, false)
  assert.equal(validateCandles([{ ...c[0], timestamp: 1, volume: -5 }]).valid, false)
})

test('flat series: neutral RSI, no NaN', () => {
  const ctx = buildTechnicalContext('FLAT', flatCandles(260))
  assert.ok(ctx.indicators.rsi.value != null)
  assert.ok(Number.isFinite(ctx.indicators.rsi.value as number))
})
