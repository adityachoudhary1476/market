import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleMarketDataRequest } from '../marketDataGateway'

const NOW = 1_720_000_000_000

function response(value: number, period: string) {
  return {
    response: { data: [{ period, value: String(value) }] },
  }
}

test('free market data is unavailable without an EIA key', async () => {
  const fetchImpl = async (): Promise<Response> => new Response('', { status: 503 })
  const result = await handleMarketDataRequest({}, { apiKey: null, now: () => NOW, fetchImpl })
  assert.equal(result.status, 503)
})

test('EIA adapter normalizes daily Brent and WTI without premium dependencies', async () => {
  let calls = 0
  const fetchImpl = async (url: URL | RequestInfo): Promise<Response> => {
    calls += 1
    const text = String(url)
    const payload = text.includes('RBRTE') ? response(82.1, '2026-08-20') : text.includes('RWTC') ? response(78.4, '2026-08-20') : text.includes('coingecko') ? { bitcoin: { usd: 60_000 }, ethereum: { usd: 3_000 } } : { date: '2026-08-20', rates: { EUR: 0.86, GBP: 0.75, JPY: 150, INR: 88 } }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const result = await handleMarketDataRequest({}, { apiKey: 'free-test-key', now: () => NOW, fetchImpl })
  assert.equal(result.status, 200)
  if ('instruments' in result.body) {
    assert.equal(result.body.provider, 'free-aggregate')
    assert.equal(result.body.classification, 'FREE')
    assert.equal(result.body.instruments.brent?.value, 82.1)
    assert.equal(result.body.instruments.wti?.value, 78.4)
    assert.equal(result.body.instruments.brent?.dataMode, 'daily')
    assert.equal(result.body.instruments.btc?.source, 'coingecko')
    assert.equal(result.body.instruments.usdinr?.source, 'ecb')
  }
  assert.equal(calls, 8)
})
