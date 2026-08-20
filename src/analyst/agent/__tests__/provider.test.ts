import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMockProvider, createRuleMockProvider, toolCall } from '../mockProvider'
import { ProviderError } from '../types'

const SYSTEM = 'system'

test('mock provider returns a final JSON content response', async () => {
  const provider = createMockProvider([{ kind: 'final', content: '{"intent":"summary"}' }])
  const result = await provider.generate({ system: SYSTEM, messages: [{ role: 'user', content: 'hi' }] })
  assert.equal(result.content, '{"intent":"summary"}')
  assert.deepEqual(result.toolCalls, [])
  assert.equal(provider.name, 'mock')
})

test('mock provider returns a single tool call', async () => {
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] },
  ])
  const result = await provider.generate({ system: SYSTEM, messages: [{ role: 'user', content: 'x' }] })
  assert.equal(result.toolCalls.length, 1)
  assert.equal(result.toolCalls[0].name, 'getTechnicalAnalysis')
  assert.deepEqual(result.toolCalls[0].arguments, { instrument: 'nifty-50' })
  assert.equal(result.stopReason, 'tool_calls')
})

test('mock provider returns multiple tool calls in one round', async () => {
  const provider = createMockProvider([
    {
      kind: 'tool-calls',
      calls: [
        toolCall('getMarketSnapshot', {}, 'c1'),
        toolCall('getMarketBreadth', {}, 'c2'),
      ],
    },
  ])
  const result = await provider.generate({ system: SYSTEM, messages: [] })
  assert.equal(result.toolCalls.length, 2)
})

test('mock provider supports multiple reasoning rounds via script steps', async () => {
  const provider = createMockProvider([
    { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] },
    { kind: 'final', content: '{"intent":"explain","title":"T"}' },
  ])
  const first = await provider.generate({ system: SYSTEM, messages: [] })
  assert.equal(first.toolCalls.length, 1)
  const second = await provider.generate({ system: SYSTEM, messages: [] })
  assert.equal(second.content, '{"intent":"explain","title":"T"}')
})

test('mock provider throws a typed ProviderError for error steps', async () => {
  const provider = createMockProvider([{ kind: 'error', errorKind: 'timeout' }])
  await assert.rejects(
    () => provider.generate({ system: SYSTEM, messages: [] }),
    (err: unknown) => err instanceof ProviderError && err.kind === 'timeout' && err.retryable === true,
  )
})

test('mock provider loops the last step by default', async () => {
  const provider = createMockProvider([{ kind: 'final', content: '{"intent":"ask"}' }])
  const a = await provider.generate({ system: SYSTEM, messages: [] })
  const b = await provider.generate({ system: SYSTEM, messages: [] })
  assert.equal(a.content, b.content)
})

test('mock provider throws when non-looping script is exhausted', async () => {
  const provider = createMockProvider([{ kind: 'final', content: '{}' }], { loop: false })
  await provider.generate({ system: SYSTEM, messages: [] })
  await assert.rejects(() => provider.generate({ system: SYSTEM, messages: [] }), ProviderError)
})

test('mock provider with no steps throws unavailable', async () => {
  const provider = createMockProvider([])
  await assert.rejects(
    () => provider.generate({ system: SYSTEM, messages: [] }),
    (err: unknown) => err instanceof ProviderError && err.kind === 'unavailable',
  )
})

test('rule provider decides based on the request (dynamic selection)', async () => {
  const provider = createRuleMockProvider(({ callCount }) => {
    if (callCount === 1) {
      return { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] }
    }
    return { kind: 'final', content: '{"intent":"explain","title":"Done"}' }
  })
  const first = await provider.generate({ system: SYSTEM, messages: [] })
  assert.equal(first.toolCalls.length, 1)
  const second = await provider.generate({ system: SYSTEM, messages: [] })
  assert.equal(second.content, '{"intent":"explain","title":"Done"}')
})