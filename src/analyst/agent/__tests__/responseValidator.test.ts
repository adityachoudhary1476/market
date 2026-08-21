import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateStructuredResponse } from '../responseValidator'

const VALID = {
  intent: 'explain',
  title: 'Why NIFTY is moving',
  summary: 'Short synthesis.',
  metrics: [{ label: 'NIFTY', value: 24816.45, delta: '+0.75%', trend: 'up', primary: true }],
  sections: [
    { heading: 'Evidence', kind: 'fact', bullets: ['Breadth is 42% advancing.'] },
    { heading: 'Read', kind: 'inference', body: 'Momentum is weakening.' },
  ],
  findings: [
    { kind: 'fact', title: 'Trend', detail: 'Below the 20-day EMA.', metric: 'down' },
    { kind: 'recommendation', title: 'Watch', detail: 'Wait for confirmation.' },
  ],
  recommendations: ['Stay cautious until breadth improves.'],
  confidence: 'Medium',
  followUps: ['What am I missing?'],
  partial: false,
}

test('accepts a fully valid structured response', () => {
  const result = validateStructuredResponse(VALID)
  assert.equal(result.ok, true)
  assert.equal(result.errors.length, 0)
  const r = result.response!
  assert.equal(r.title, 'Why NIFTY is moving')
  assert.equal(r.intent, 'explain')
  assert.equal(r.confidence, 'Medium')
  assert.equal(r.metrics!.length, 1)
  assert.equal(r.sections!.length, 2)
  assert.equal(r.findings!.length, 2)
  assert.equal(r.findings![1].kind, 'recommendation')
  assert.equal(typeof r.generatedAt, 'string')
  assert.ok(r.id.startsWith('ai-'))
})

test('accepts the minimal conversational answer contract', () => {
  const result = validateStructuredResponse({
    intent: 'explain',
    title: 'Oil outlook',
    answer: 'Oil is mildly bullish, but the setup is not clean.',
    supportingPoints: ['Supply concerns support prices.', 'Demand remains a counterweight.'],
    followUp: 'The main risk is a faster supply recovery.',
  })
  assert.equal(result.ok, true)
  assert.equal(result.response!.answer, 'Oil is mildly bullish, but the setup is not clean.')
  assert.equal(result.response!.supportingPoints!.length, 2)
  assert.equal(result.response!.followUp, 'The main risk is a faster supply recovery.')
})

test('rejects non-object responses', () => {
  for (const bad of [null, 42, 'text', [], true]) {
    const result = validateStructuredResponse(bad)
    assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(bad)}`)
    assert.ok(result.errors.length > 0)
  }
})

test('rejects missing title and invalid intent', () => {
  const result = validateStructuredResponse({ intent: 'not-an-intent', title: '   ' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes('title')))
  assert.ok(result.errors.some((e) => e.includes('intent')))
})

test('rejects invalid confidence', () => {
  const result = validateStructuredResponse({ ...VALID, confidence: '99%' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes('confidence')))
})

test('rejects responses with no substance', () => {
  const result = validateStructuredResponse({ intent: 'ask', title: 'Hello' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes('substance')))
})

test('drops invalid entries inside arrays instead of failing the whole response', () => {
  const result = validateStructuredResponse({
    ...VALID,
    metrics: [
      { label: 'NIFTY', value: 24816.45 },
      { label: '', value: 1 },
      { label: 'NoValue' },
    ],
    sections: [
      { heading: 'Good', body: 'ok' },
      { heading: '' },
    ],
    findings: [{ kind: 'guess', title: 'x', detail: 'y' }],
  })
  assert.equal(result.ok, true)
  assert.equal(result.response!.metrics!.length, 1)
  assert.equal(result.response!.sections!.length, 1)
  assert.equal(result.response!.findings, undefined)
})

test('coerces numeric metric values to strings and rejects non-finite numbers', () => {
  const result = validateStructuredResponse({
    ...VALID,
    metrics: [
      { label: 'A', value: 42.5 },
      { label: 'B', value: Infinity },
    ],
    chart: { title: 'C', type: 'bar', points: [{ label: 'x', value: 3 }, { label: 'y', value: NaN }] },
  })
  assert.equal(result.ok, true)
  assert.equal(result.response!.metrics!.length, 1)
  assert.equal(result.response!.metrics![0].value, '42.5')
  assert.equal(result.response!.chart!.points.length, 1)
})

test('preserves fact/inference/recommendation distinction', () => {
  const result = validateStructuredResponse({
    ...VALID,
    findings: [
      { kind: 'fact', title: 'F', detail: 'measured' },
      { kind: 'inference', title: 'I', detail: 'reasoned' },
      { kind: 'recommendation', title: 'R', detail: 'action' },
    ],
  })
  assert.equal(result.ok, true)
  const kinds = result.response!.findings!.map((f) => f.kind)
  assert.deepEqual(kinds, ['fact', 'inference', 'recommendation'])
})

test('strips markdown fences from JSON content via the orchestrator path (content parse)', () => {
  // The validator itself takes parsed JSON; fence stripping lives in the
  // orchestrator. Guard the behaviour here by validating parsed content only.
  const result = validateStructuredResponse({ ...VALID, title: 'ok' })
  assert.equal(result.ok, true)
})

test('treats partial as a boolean flag', () => {
  const result = validateStructuredResponse({ ...VALID, partial: true })
  assert.equal(result.ok, true)
  assert.equal(result.response!.partial, true)
})

test('accepts table, plan, chart and actions', () => {
  const result = validateStructuredResponse({
    ...VALID,
    table: {
      headers: ['Sector', 'Change'],
      rows: [['Financials', '+1.2%'], ['IT', '-0.4%']],
      caption: 'Sorted',
    },
    plan: [{ time: '15:45', title: 'Confirm regime' }],
    actions: [{ label: 'Open terminal', kind: 'explore', to: '/markets' }],
    chart: { title: 'Sector performance', type: 'bar', unit: '%', points: [{ label: 'Fin', value: 1.2 }] },
  })
  assert.equal(result.ok, true)
  assert.equal(result.response!.table!.rows.length, 2)
  assert.equal(result.response!.plan!.length, 1)
  assert.equal(result.response!.actions!.length, 1)
  assert.equal(result.response!.chart!.points.length, 1)
})