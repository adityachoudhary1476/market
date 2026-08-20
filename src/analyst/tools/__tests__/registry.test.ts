import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AnalystToolRegistry, createDefaultAnalystToolRegistry } from '../registry'
import { createDefaultToolContext } from '../context'
import type { AnalystTool, ToolResult } from '../types'
import { ToolError } from '../errors'
import { successResult } from '../results'

const FIXED_NOW = 1_720_000_000_000

test('registry: default registry exposes the full 14-tool universe', () => {
  const registry = createDefaultAnalystToolRegistry()
  const names = registry.list().map((t) => t.name).sort()
  assert.deepEqual(names, [
    'analyzeSectors',
    'compareInstruments',
    'detectBreakouts',
    'detectDivergences',
    'detectPatterns',
    'getConfluence',
    'getHistoricalValidation',
    'getMacroContext',
    'getMarketBreadth',
    'getMarketMovers',
    'getMarketSnapshot',
    'getTechnicalAnalysis',
    'searchNews',
    'searchWeb',
  ])
})

test('registry: every tool has name, description and a JSON schema', () => {
  const registry = createDefaultAnalystToolRegistry()
  for (const tool of registry.list()) {
    assert.equal(typeof tool.name, 'string')
    assert.ok(tool.name.length > 0)
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 0, `${tool.name} needs a description`)
    assert.equal(tool.inputSchema.type, 'object')
    assert.ok(tool.inputSchema.properties, `${tool.name} needs properties`)
    assert.ok(Array.isArray(tool.inputSchema.required))
  }
})

test('registry: definitions() produces LLM-ready tool definitions', () => {
  const registry = createDefaultAnalystToolRegistry()
  const defs = registry.definitions()
  assert.equal(defs.length, 14)
  const tech = defs.find((d) => d.name === 'getTechnicalAnalysis')
  assert.ok(tech)
  assert.equal(tech!.parameters.type, 'object')
  assert.deepEqual(tech!.parameters.required, ['instrument'])
  const search = defs.find((d) => d.name === 'searchWeb')
  assert.ok(search)
  assert.deepEqual(search!.parameters.required, ['query'])
})

test('registry: duplicate registration throws DUPLICATE_TOOL', () => {
  const registry = new AnalystToolRegistry()
  const tool: AnalystTool = {
    name: 'x',
    description: 'x',
    inputSchema: { type: 'object', properties: {}, required: [] },
    run: (_input, ctx) => successResult('x', 'market-data', {}, { now: ctx.now }),
  }
  registry.register(tool)
  assert.throws(() => registry.register(tool), (err: unknown) => {
    assert.ok(err instanceof ToolError)
    assert.equal(err.code, 'DUPLICATE_TOOL')
    return true
  })
})

test('registry: unknown tool returns UNKNOWN_TOOL, never throws', () => {
  const registry = createDefaultAnalystToolRegistry()
  const context = createDefaultToolContext(FIXED_NOW)
  const result = registry.execute('doesNotExist', {}, context)
  assert.equal(result.ok, false)
  assert.equal(result.error?.code, 'UNKNOWN_TOOL')
  assert.equal(result.metadata.tool, 'unknown')
})

test('registry: a throwing tool is converted to INTERNAL_ERROR', () => {
  const registry = new AnalystToolRegistry()
  const context = createDefaultToolContext(FIXED_NOW)
  registry.register({
    name: 'explosive',
    description: 'always throws',
    inputSchema: { type: 'object', properties: {}, required: [] },
    run: () => {
      throw new Error('boom')
    },
  })
  const result = registry.execute('explosive', {}, context)
  assert.equal(result.ok, false)
  assert.equal(result.error?.code, 'INTERNAL_ERROR')
  assert.equal(result.data, null)
})

test('registry: execute normalizes timestamps to the context clock', () => {
  const registry = createDefaultAnalystToolRegistry()
  const context = createDefaultToolContext(FIXED_NOW)
  const result = registry.execute('getMarketBreadth', {}, context)
  assert.equal(result.ok, true)
  assert.equal(result.metadata.timestamp, new Date(FIXED_NOW).toISOString())
  assert.equal(typeof result.metadata.durationMs, 'number')
})

test('registry: execute is deterministic across repeated calls', () => {
  const registry = createDefaultAnalystToolRegistry()
  const context = createDefaultToolContext(FIXED_NOW)
  const strip = (r: ToolResult) => ({ ...r, metadata: { ...r.metadata, durationMs: undefined } })
  const a = strip(registry.execute('getMarketSnapshot', {}, context))
  const b = strip(registry.execute('getMarketSnapshot', {}, context))
  assert.deepEqual(a, b)
})

test('registry: results are JSON-serializable (no functions, no cycles)', () => {
  const registry = createDefaultAnalystToolRegistry()
  const context = createDefaultToolContext(FIXED_NOW)
  const result = registry.execute('getMarketSnapshot', { includeSectors: true }, context)
  const roundtrip = JSON.parse(JSON.stringify(result)) as ToolResult
  assert.deepEqual(roundtrip, result)
})