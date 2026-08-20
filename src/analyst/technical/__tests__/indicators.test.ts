import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateMovingAverages } from '../indicators/movingAverages'
import { calculateRSI } from '../indicators/rsi'
import { calculateMACD } from '../indicators/macd'
import { calculateBollinger } from '../indicators/bollinger'
import { calculateATR } from '../indicators/atr'
import { calculateADX } from '../indicators/adx'
import { calculateStochastic } from '../indicators/stochastic'
import { calculateVWAP } from '../indicators/vwap'
import { calculateOBV } from '../indicators/obv'
import { calculateMFI } from '../indicators/mfi'
import { calculateCCI } from '../indicators/cci'
import { calculateWilliamsR } from '../indicators/williamsR'
import { calculateROC } from '../indicators/roc'
import { calculateIchimoku } from '../indicators/ichimoku'
import { risingCandles, flatCandles, singleCandle, closeOnlyCandles } from './fixtures'

test('moving averages: bullish alignment on strong uptrend', () => {
  const m = calculateMovingAverages(risingCandles(260, 100, 0.8))
  assert.equal(m.bullishAlignment, true)
  assert.equal(m.bearishAlignment, false)
  assert.equal(m.priceAbove.ema50, true)
  assert.ok(m.ema[9].value != null)
  assert.ok(m.sma[200].value != null)
})

test('moving averages: insufficient data returns null long MAs', () => {
  const m = calculateMovingAverages(singleCandle())
  assert.equal(m.ema[200].value, null)
  assert.equal(m.alignment.ema50Vs200, 'insufficient-data')
})

test('RSI: overbought on strong uptrend', () => {
  const r = calculateRSI(risingCandles(60, 100, 1))
  assert.ok(r.value != null)
  assert.equal(r.zone, 'overbought')
})

test('RSI: null on insufficient data', () => {
  const r = calculateRSI(singleCandle())
  assert.equal(r.value, null)
  assert.equal(r.zone, 'insufficient-data')
})

test('RSI: flat series ~50', () => {
  const r = calculateRSI(flatCandles(40))
  assert.ok(r.value != null)
  assert.ok(Math.abs((r.value as number) - 50) < 2)
})

test('MACD: produces line/signal/histogram and valid crossover', () => {
  const m = calculateMACD(risingCandles(120))
  assert.ok(m.macd != null && m.signal != null && m.histogram != null)
  assert.ok(['bullish', 'bearish', 'none'].includes(m.crossover))
})

test('MACD: insufficient data', () => {
  assert.equal(calculateMACD(flatCandles(10)).macd, null)
})

test('Bollinger: symmetric on constant series', () => {
  const b = calculateBollinger(flatCandles(30, 100))
  assert.ok(b.middle != null && b.upper != null && b.lower != null)
  assert.ok(Math.abs((b.middle as number) - 100) < 0.01)
  assert.equal(b.upper as number, b.lower as number)
  assert.equal(b.percentB, 0.5)
})

test('Bollinger: upper > middle > lower and bandwidth positive', () => {
  const b = calculateBollinger(risingCandles(60))
  assert.ok((b.upper as number) > (b.middle as number))
  assert.ok((b.bandwidth as number) > 0)
})

test('ATR: value and percent of price', () => {
  const a = calculateATR(risingCandles(40))
  assert.ok(a.value != null && (a.percentOfPrice as number) > 0)
})

test('ATR: unavailable on close-only data', () => {
  const a = calculateATR(closeOnlyCandles(40))
  assert.equal(a.value, null)
})

test('ADX: bullish bias on monotonic rise', () => {
  const a = calculateADX(risingCandles(80, 100, 1.5))
  assert.ok(a.adx != null)
  assert.equal(a.direction, 'bullish')
  assert.ok(['emerging', 'established', 'strong'].includes(a.trendStrength))
})

test('ADX: insufficient data', () => {
  assert.equal(calculateADX(singleCandle()).trendStrength, 'insufficient-data')
})

test('Stochastic: bounded 0-100 on volatile data', () => {
  const s = calculateStochastic(risingCandles(60))
  if (s.k != null) assert.ok(s.k >= 0 && s.k <= 100)
  if (s.d != null) assert.ok(s.d >= 0 && s.d <= 100)
})

test('VWAP: unavailable on daily (non-intraday) data', () => {
  assert.equal(calculateVWAP(flatCandles(10), false).available, false)
})

test('VWAP: price above on rising intraday', () => {
  const day = Date.UTC(2026, 7, 19)
  const c = Array.from({ length: 20 }, (_, i) => {
    const p = 100 + i
    return { timestamp: day + i * 5 * 60 * 1000, open: p - 0.2, high: p + 0.4, low: p - 0.5, close: p, volume: 1000 + i * 10 }
  })
  const v = calculateVWAP(c, true)
  assert.equal(v.available, true)
  assert.equal(v.priceVsVWAP, 'above')
  assert.ok((v.distancePercent as number) > 0)
})

test('OBV: accumulates on up days, subtracts on down days', () => {
  const c = [
    { timestamp: 1, open: 10, high: 10, low: 10, close: 10, volume: 100 },
    { timestamp: 2, open: 10, high: 11, low: 10, close: 11, volume: 200 },
    { timestamp: 3, open: 11, high: 11, low: 9, close: 9, volume: 50 },
  ]
  assert.equal(calculateOBV(c).value, 150)
})

test('OBV: unavailable without volume', () => {
  const v = calculateOBV(closeOnlyCandles(30))
  assert.equal(v.available, false)
})

test('MFI: bounded 0-100', () => {
  const m = calculateMFI(risingCandles(60))
  assert.ok(m.value != null && m.value >= 0 && m.value <= 100)
})

test('CCI: zero on constant price', () => {
  assert.equal(calculateCCI(flatCandles(30)).value, 0)
})

test('Williams %R: bounded -100..0', () => {
  const w = calculateWilliamsR(risingCandles(40))
  if (w.value != null) assert.ok(w.value <= 0 && w.value >= -100)
})

test('ROC: positive on rising series', () => {
  const r = calculateROC(risingCandles(40), 12)
  assert.ok(r.value != null && (r.value as number) > 0)
})

test('Ichimoku: components present and valid state', () => {
  const i = calculateIchimoku(risingCandles(80))
  assert.ok(i.tenkan != null && i.kijun != null && i.senkouA != null)
  assert.ok(['bullish', 'bearish', 'neutral', 'transitioning', 'insufficient-data'].includes(i.state))
})
