import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSearchWebTool } from '../tools/searchWeb'
import { createDefaultAnalystToolRegistry } from '../registry'
import { createDefaultToolContext } from '../context'

const FIXED_NOW = 1_720_000_000_000

test('searchWeb: schema matches the approved limits', () => {
  const tool = createSearchWebTool()
  assert.equal(tool.name, 'searchWeb')
  assert.deepEqual(tool.inputSchema.required, ['query'])
  assert.equal(tool.inputSchema.properties.query.type, 'string')
  assert.equal(tool.inputSchema.properties.maxResults.maximum, 8)
  assert.equal(tool.inputSchema.properties.recencyDays.maximum, 3_650)
  assert.ok(tool.description.includes('fabricate'), 'honesty is in the description')
})

test('searchWeb: invalid input returns INVALID_INPUT, never fabricates', () => {
  const tool = createSearchWebTool({ transport: { search: async () => ({ query: '', provider: 'tavily', results: [], totalResults: 0, truncated: false }) } })
  const context = createDefaultToolContext(FIXED_NOW)
  const result = tool.run({ query: 'x'.repeat(401) }, context)
  assert.equal(result.ok, false)
  assert.equal(result.error?.code, 'INVALID_INPUT')
  assert.equal(result.metadata.source, 'web-search')
  assert.equal(result.metadata.available, false)
})

test('searchWeb: reports not-configured honestly when no transport exists', () => {
  const tool = createSearchWebTool({ transport: null })
  const context = createDefaultToolContext(FIXED_NOW)
  const result = tool.run({ query: 'NIFTY news' }, context)
  assert.equal(result.ok, true)
  assert.equal(result.metadata.available, false)
  assert.equal(result.data, null)
  assert.ok(result.metadata.warnings[0].includes('not configured'))
})

test('searchWeb: direct sync execution reports honestly that it needs the session transport', () => {
  const tool = createSearchWebTool({ transport: { search: async () => ({ query: 'q', provider: 'tavily', results: [], totalResults: 0, truncated: false }) } })
  const context = createDefaultToolContext(FIXED_NOW)
  const result = tool.run({ query: 'NIFTY news' }, context)
  assert.equal(result.ok, true)
  assert.equal(result.metadata.available, false)
  assert.equal(result.data, null)
  assert.ok(result.metadata.warnings[0].includes('asynchronously'))
})

test('searchWeb: the default registry includes the tool', () => {
  const registry = createDefaultAnalystToolRegistry()
  const tool = registry.get('searchWeb')
  assert.ok(tool, 'searchWeb must be registered for the gateway whitelist and catalog')
})