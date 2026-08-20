import { test } from 'node:test'
import assert from 'node:assert/strict'
import { regimeFromContext, regimeFromRules } from '../regimes'
import type { StructuredTechnicalContextLike } from '../../confluence/types'

test('regimes: null context is neutral', () => {
  assert.equal(regimeFromContext(null), 'neutral')
  assert.equal(regimeFromContext(undefined), 'neutral')
})

test('regimes: strong bullish trend + structure + RSI -> risk-on', () => {
  assert.equal(
    regimeFromRules({ trend: 'bullish', structure: 'bullish', rsi: 65, volatilityState: 'normal' }),
    'risk-on',
  )
})

test('regimes: strong bearish trend + structure + RSI -> risk-off', () => {
  assert.equal(
    regimeFromRules({ trend: 'bearish', structure: 'bearish', rsi: 30, volatilityState: 'elevated' }),
    'risk-off',
  )
})

test('regimes: conflicting signals -> mixed', () => {
  assert.equal(
    regimeFromRules({ trend: 'bullish', structure: 'bearish', rsi: 60, volatilityState: 'normal' }),
    'mixed',
  )
})

test('regimes: neutral trend -> neutral', () => {
  assert.equal(
    regimeFromRules({ trend: 'neutral', structure: 'range', rsi: 50, volatilityState: 'normal' }),
    'neutral',
  )
})

test('regimes: risk-on is refused under high volatility', () => {
  const r = regimeFromRules({ trend: 'bullish', structure: 'bullish', rsi: 65, volatilityState: 'high' })
  assert.notEqual(r, 'risk-on')
})

test('regimes: regimeFromContext reads a minimal technical context', () => {
  const ctx = {
    available: true,
    instrument: 'X',
    timeframe: 'daily',
    generatedAt: '',
    trend: { overall: { direction: 'bullish', strength: 50, evidence: [] } },
    structure: { state: 'bullish' },
    indicators: { rsi: { value: 70, zone: 'overbought' } },
    volatility: { state: 'normal' },
  } as unknown as StructuredTechnicalContextLike
  assert.equal(regimeFromContext(ctx), 'risk-on')
})

test('regimes: insufficient-data fields stay neutral', () => {
  assert.equal(regimeFromRules({ trend: 'insufficient-data', structure: 'insufficient-data', rsi: null, volatilityState: 'insufficient-data' }), 'neutral')
})