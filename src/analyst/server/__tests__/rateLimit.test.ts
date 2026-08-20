import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter } from '../rateLimit'

test('allows requests up to the configured max', () => {
  let t = 1_000
  const limiter = createRateLimiter({ max: 3, windowMs: 60_000, now: () => t })
  assert.equal(limiter('ip-1').allowed, true)
  assert.equal(limiter('ip-1').allowed, true)
  assert.equal(limiter('ip-1').allowed, true)
  const fourth = limiter('ip-1')
  assert.equal(fourth.allowed, false)
  assert.equal(fourth.remaining, 0)
  assert.ok(fourth.retryAfterMs > 0)
})

test('keys are tracked independently', () => {
  let t = 1_000
  const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: () => t })
  assert.equal(limiter('ip-1').allowed, true)
  assert.equal(limiter('ip-1').allowed, false)
  assert.equal(limiter('ip-2').allowed, true)
})

test('the window resets after windowMs', () => {
  let t = 1_000
  const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: () => t })
  assert.equal(limiter('ip-1').allowed, true)
  assert.equal(limiter('ip-1').allowed, false)
  t = 61_000
  const decision = limiter('ip-1')
  assert.equal(decision.allowed, true)
  assert.equal(decision.retryAfterMs, 0)
})