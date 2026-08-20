import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractSetups } from '../setups'
import type { StructuredTechnicalContext } from '../../types'

function minimalContext(overrides: Partial<StructuredTechnicalContext> = {}): StructuredTechnicalContext {
  return {
    available: true,
    instrument: 'TEST',
    timeframe: 'daily',
    generatedAt: '',
    price: { current: 100, change: 1, changePercent: 1, open: 99, high: 101, low: 98, previousClose: 99 },
    dataQuality: { candleCount: 120, sufficientHistory: true, warnings: [], hasHighLow: true, hasVolume: true },
    trend: {
      shortTerm: { direction: 'bullish', strength: 50, evidence: [] },
      mediumTerm: { direction: 'bullish', strength: 50, evidence: [] },
      longTerm: { direction: 'bullish', strength: 50, evidence: [] },
      overall: { direction: 'bullish', strength: 50, evidence: [] },
    },
    structure: {
      recentSwingHighs: [],
      recentSwingLows: [],
      higherHighs: 2,
      higherLows: 3,
      lowerHighs: 0,
      lowerLows: 0,
      state: 'bullish',
      lastHigh: null,
      lastLow: null,
    },
    indicators: {
      movingAverages: {
        sma: {},
        ema: {},
        priceAbove: {},
        shortAboveLong: {},
        alignment: {},
        bullishAlignment: true,
        bearishAlignment: false,
      },
      rsi: { period: 14, value: 62, previousValue: 60, direction: 'rising', zone: 'neutral' },
      macd: { fast: 12, slow: 26, signalPeriod: 9, macd: 1, signal: 0.8, histogram: 0.2, histogramDirection: 'rising', crossover: 'bullish' },
      bollinger: { period: 20, standardDeviation: 1, upper: 102, middle: 100, lower: 98, bandwidth: 4, percentB: 0.6, pricePosition: 'inside', squeeze: false, expansion: 'flat' },
      atr: { period: 14, value: 1, percentOfPrice: 1, direction: 'flat', volatilityState: 'normal' },
      adx: { period: 14, adx: 25, plusDI: 25, minusDI: 20, trendStrength: 'established', direction: 'bullish' },
      stochastic: { kPeriod: 14, dPeriod: 3, k: 60, d: 55, crossover: 'none', zone: 'neutral', direction: 'rising' },
      vwap: { available: false, reason: 'daily feed' },
      obv: { value: 0, direction: 'flat', slope: 0, available: true },
      mfi: { period: 14, value: 55, zone: 'neutral', direction: 'rising' },
      cci: { period: 20, value: 50, zone: 'neutral', direction: 'rising' },
      williamsR: { period: 14, value: -40, zone: 'neutral', direction: 'rising' },
      roc: { period: 10, value: 2, direction: 'rising', acceleration: 'accelerating' },
      ichimoku: { tenkan: 100, kijun: 99, senkouA: 99, senkouB: 98, chikou: 100, priceAboveCloud: true, priceBelowCloud: false, insideCloud: false, cloudDirection: 'bullish', cloudThickness: 1, tenkanAboveKijun: true, state: 'bullish' },
    },
    momentum: { rsi: 62, macdHistogram: 0.2, stochasticK: 60, mfi: 55, roc: 2, cci: 50, williamsR: -40, bias: 'bullish' },
    volatility: { atr: 1, atrPercent: 1, bollingerBandwidth: 4, recentRangePercent: 1, state: 'normal', change: 'flat' },
    volume: { currentVolume: 1_500_000, averageVolume: 1_000_000, relativeVolume: 1.5, relativeTo5: 1.4, relativeTo20: 1.5, relativeTo50: 1.3, state: 'high', priceVolume: 'rising-price-rising-volume', available: true },
    supportResistance: {
      levels: [],
      nearestSupport: null,
      nearestResistance: null,
      distanceToResistancePercent: null,
      distanceToSupportPercent: null,
    },
    signals: [],
    patterns: {
      available: true,
      instrument: 'TEST',
      timeframe: 'daily',
      generatedAt: '',
      hasOHLC: true,
      hasVolume: true,
      barCount: 120,
      candlesticks: [],
      chartPatterns: [],
      divergences: [],
      breakouts: [],
      all: [],
      recentPatterns: [],
      activePatterns: [
        {
          id: 'p1',
          family: 'breakout',
          name: 'range-breakout',
          label: 'Range Breakout',
          direction: 'bullish',
          status: 'confirmed',
          confidence: 70,
          confidenceBand: 'medium',
          strength: 60,
          detectedAt: 1000,
          barIndex: 100,
          invalidationLevel: 100,
          targetLevel: 110,
          evidence: [],
          level: 100,
          penetrationPercent: 2,
          volumeConfirmation: 1.5,
          dataRequirements: ['close'],
          metadata: { breakoutStatus: 'broken-up' },
        },
        {
          id: 'p2',
          family: 'breakout',
          name: 'range-breakout',
          label: 'Range Breakout',
          direction: 'bullish',
          status: 'forming',
          confidence: 40,
          confidenceBand: 'low',
          strength: 30,
          detectedAt: 900,
          barIndex: 99,
          invalidationLevel: 100,
          targetLevel: null,
          evidence: [],
          level: 100,
          penetrationPercent: 0.5,
          volumeConfirmation: null,
          dataRequirements: ['close'],
        },
      ],
      summary: {
        total: 2,
        byFamily: {
          candlestick: { count: 0, bullish: 0, bearish: 0, neutral: 0 },
          chart: { count: 0, bullish: 0, bearish: 0, neutral: 0 },
          divergence: { count: 0, bullish: 0, bearish: 0, neutral: 0 },
          breakout: { count: 2, bullish: 2, bearish: 0, neutral: 0 },
          breakdown: { count: 0, bullish: 0, bearish: 0, neutral: 0 },
        },
        lifecycle: { forming: 1, confirmed: 1, mature: 0, failed: 0, complete: 0, invalidated: 0, unavailable: 0 },
        directionalBias: 'bullish',
      },
      signals: [],
      dataQuality: { candleCount: 120, warnings: [], unavailableDetectors: [] },
    },
    confluence: undefined,
    ...overrides,
  }
}

test('setups: only confirmed/mature patterns become setups', () => {
  const s = extractSetups(minimalContext(), 100, 'TEST', 'daily')
  assert.equal(s.length, 1)
  assert.equal(s[0].pattern!.name, 'range-breakout')
  assert.equal(s[0].barIndex, 100)
})

test('setups: regime and evidence signature are derived from context', () => {
  const s = extractSetups(minimalContext(), 100, 'TEST', 'daily')
  assert.equal(s[0].regime, 'risk-on')
  assert.equal(s[0].evidenceSignature.trend, 'bullish')
  assert.equal(s[0].evidenceSignature.momentum, 'bullish')
  assert.equal(s[0].evidenceSignature.structure, 'bullish')
  assert.equal(s[0].evidenceSignature.volume, 'high')
})

test('setups: no active patterns -> empty', () => {
  const s = extractSetups(minimalContext({ patterns: { ...minimalContext().patterns!, activePatterns: [] } }), 100, 'TEST', 'daily')
  assert.equal(s.length, 0)
})

test('setups: ids are unique and stable within a run', () => {
  const a = extractSetups(minimalContext(), 100, 'TEST', 'daily')
  const b = extractSetups(minimalContext(), 100, 'TEST', 'daily')
  assert.notEqual(a[0].id, b[0].id)
})