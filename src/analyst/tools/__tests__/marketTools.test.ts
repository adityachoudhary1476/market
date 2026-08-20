import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultAnalystToolRegistry } from '../registry'
import { createDefaultToolContext } from '../context'

const FIXED_NOW = 1_720_000_000_000

function run(tool: string, input: Record<string, unknown> = {}) {
  const registry = createDefaultAnalystToolRegistry()
  return registry.execute(tool, input, createDefaultToolContext(FIXED_NOW))
}

test('getMarketSnapshot: returns regime, indices, breadth and movers', () => {
  const r = run('getMarketSnapshot')
  assert.equal(r.ok, true)
  assert.equal(r.metadata.available, true)
  assert.equal(r.metadata.source, 'market-data')
  const data = r.data as {
    regime: string
    indices: unknown[]
    breadth: { advPct: number }
    gainers: unknown[]
    losers: unknown[]
    active: unknown[]
  }
  assert.ok(['risk-on', 'risk-off', 'mixed', 'neutral'].includes(data.regime))
  assert.ok(data.indices.length >= 4)
  assert.ok(data.breadth.advPct >= 0 && data.breadth.advPct <= 100)
  assert.ok(data.gainers.length > 0)
  assert.ok(data.losers.length > 0)
  assert.ok(data.active.length > 0)
})

test('getMarketSnapshot: includeSectors returns the full sector list', () => {
  const small = run('getMarketSnapshot')
  const full = run('getMarketSnapshot', { includeSectors: true })
  const smallCount = (small.data as { sectors: unknown[] }).sectors.length
  const fullCount = (full.data as { sectors: unknown[] }).sectors.length
  assert.ok(fullCount > smallCount, `${fullCount} > ${smallCount}`)
  assert.ok(fullCount >= 8)
})

test('getMarketBreadth: breadth math is consistent with the dataset', () => {
  const r = run('getMarketBreadth')
  const data = r.data as {
    breadth: { advancing: number; declining: number; unchanged: number; ratio: number; advPct: number }
    indices: unknown[]
  }
  assert.equal(r.ok, true)
  const total = data.breadth.advancing + data.breadth.declining + data.breadth.unchanged
  assert.ok(total > 0)
  assert.ok(Math.abs(data.breadth.advPct - (data.breadth.advancing / total) * 100) < 0.2)
  assert.ok(data.breadth.ratio > 0)
  assert.ok(data.indices.length <= 4)
})

test('getMarketBreadth: indexLimit is clamped', () => {
  const r = run('getMarketBreadth', { indexLimit: 99 })
  const data = r.data as { indices: unknown[] }
  assert.ok(data.indices.length <= 10)
})

test('analyzeSectors: sorts by best, worst and alpha', () => {
  const best = run('analyzeSectors', { sort: 'best', limit: 3 })
  assert.equal(best.ok, true)
  const bestData = best.data as { sort: string; sectors: { changePct: number }[] }
  assert.equal(bestData.sort, 'best')
  assert.ok(bestData.sectors.length <= 3)
  for (let i = 1; i < bestData.sectors.length; i++) {
    assert.ok(bestData.sectors[i - 1].changePct >= bestData.sectors[i].changePct)
  }

  const worst = run('analyzeSectors', { sort: 'worst', limit: 3 })
  const worstData = worst.data as { sectors: { changePct: number }[] }
  for (let i = 1; i < worstData.sectors.length; i++) {
    assert.ok(worstData.sectors[i - 1].changePct <= worstData.sectors[i].changePct)
  }
})

test('analyzeSectors: invalid sort is an INVALID_INPUT error', () => {
  const r = run('analyzeSectors', { sort: 'sideways' })
  assert.equal(r.ok, false)
  assert.equal(r.error?.code, 'INVALID_INPUT')
})

test('analyzeSectors: unknown sectorId returns warning, not error', () => {
  const r = run('analyzeSectors', { sectorId: 'crypto' })
  assert.equal(r.ok, true)
  assert.ok(r.metadata.warnings.length > 0)
  assert.equal((r.data as { sectors: unknown[] }).sectors.length, 0)
})

test('getMarketMovers: every category returns rows with symbols', () => {
  for (const category of ['gainers', 'losers', 'active', 'near-high', 'near-low']) {
    const r = run('getMarketMovers', { category })
    assert.equal(r.ok, true, category)
    const data = r.data as { category: string; movers: { symbol: string }[] }
    assert.equal(data.category, category)
    assert.ok(data.movers.length > 0, `${category} should have movers`)
    assert.ok(data.movers.every((m) => typeof m.symbol === 'string' && m.symbol.length > 0))
  }
})

test('getMarketMovers: active rows include relative volume', () => {
  const r = run('getMarketMovers', { category: 'active' })
  const data = r.data as { movers: { relVolume?: number }[] }
  assert.ok(data.movers.every((m) => typeof m.relVolume === 'number'))
})

test('getMarketMovers: invalid category is an INVALID_INPUT error', () => {
  const r = run('getMarketMovers', { category: 'meme' })
  assert.equal(r.ok, false)
  assert.equal(r.error?.code, 'INVALID_INPUT')
})

test('getMacroContext: returns the macro indicator set', () => {
  const r = run('getMacroContext')
  assert.equal(r.ok, true)
  const data = r.data as { macro: { id: string; label: string; value: string }[] }
  assert.ok(data.macro.length >= 4)
  assert.ok(data.macro.every((m) => typeof m.id === 'string' && typeof m.value === 'string'))
})

test('getMacroContext: indicatorId filters results', () => {
  const r = run('getMacroContext', { indicatorId: 'repo' })
  assert.equal(r.ok, true)
  const data = r.data as { macro: { id: string }[] }
  assert.ok(data.macro.length >= 1)
  assert.ok(data.macro.every((m) => m.id === 'repo'))
})