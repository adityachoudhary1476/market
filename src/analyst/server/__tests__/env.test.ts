import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveServerEnv, SUPPORTED_LLM_PROVIDERS } from '../env'

test('missing API key means the gateway is not configured', () => {
  assert.equal(resolveServerEnv({}), null)
  assert.equal(resolveServerEnv({ FINOVA_LLM_API_KEY: '   ' }), null)
})

test('unsupported provider means the gateway is not configured', () => {
  assert.equal(resolveServerEnv({ FINOVA_LLM_API_KEY: 'sk-x', FINOVA_LLM_PROVIDER: 'hackrf' }), null)
})

test('configured env resolves the generic OpenAI-compatible provider with defaults', () => {
  const env = resolveServerEnv({ FINOVA_LLM_API_KEY: 'sk-x' })
  assert.ok(env)
  assert.equal(env.provider, 'openai-compatible')
  assert.equal(env.apiKey, 'sk-x')
  assert.equal(env.model, 'gpt-4o-mini')
  assert.equal(env.baseUrl, 'https://api.openai.com/v1')
  assert.equal(env.timeoutMs, 30_000)
  assert.equal(env.port, 8787)
  assert.equal(env.rateLimitMax, 60)
})

test('explicit overrides are honored', () => {
  const env = resolveServerEnv({
    FINOVA_LLM_API_KEY: 'sk-x',
    FINOVA_LLM_PROVIDER: 'openai-compatible',
    FINOVA_LLM_MODEL: 'deepseek-chat',
    FINOVA_LLM_BASE_URL: 'https://api.deepseek.com/v1',
    FINOVA_LLM_TIMEOUT_MS: '12000',
    FINOVA_ANALYST_PORT: '9999',
    FINOVA_GATEWAY_RATE_LIMIT: '0',
    FINOVA_GATEWAY_CORS_ORIGIN: 'https://app.finova.dev',
  })
  assert.ok(env)
  assert.equal(env.model, 'deepseek-chat')
  assert.equal(env.baseUrl, 'https://api.deepseek.com/v1')
  assert.equal(env.timeoutMs, 12_000)
  assert.equal(env.port, 9999)
  assert.equal(env.rateLimitMax, 0)
  assert.equal(env.corsOrigin, 'https://app.finova.dev')
})

test('out-of-range numeric values are clamped', () => {
  const env = resolveServerEnv({
    FINOVA_LLM_API_KEY: 'sk-x',
    FINOVA_LLM_TIMEOUT_MS: '999999999',
    FINOVA_GATEWAY_RATE_LIMIT: '-5',
  })
  assert.ok(env)
  assert.equal(env.timeoutMs, 120_000)
  assert.equal(env.rateLimitMax, 0)
})

test('the supported provider list contains the generic seam', () => {
  assert.deepEqual([...SUPPORTED_LLM_PROVIDERS], ['openai-compatible'])
})