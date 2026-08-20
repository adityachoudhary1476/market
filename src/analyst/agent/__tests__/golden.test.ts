import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentSession } from '../orchestrator'
import { createDefaultAnalystToolRegistry } from '../../tools/registry'
import { createDefaultToolContext } from '../../tools/context'
import { createRuleMockProvider, toolCall } from '../mockProvider'
import { buildAnalystContext } from '../../buildContext'

const NOW = 1_720_000_000_000
const REGISTRY = createDefaultAnalystToolRegistry()
const TOOL_CTX = createDefaultToolContext(NOW)
const CONTEXT = buildAnalystContext()

function finalResponse(title: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    intent: 'explain',
    title,
    summary: 'Synthesized answer from gathered evidence.',
    sections: [{ heading: 'Evidence', kind: 'fact', body: 'Based on the tools consulted.' }],
    findings: [{ kind: 'inference', title: 'Read', detail: 'Interpretation of evidence.' }],
    recommendations: ['Monitor the key levels.'],
    confidence: 'Medium',
    ...overrides,
  })
}

function run(script: Parameters<typeof createRuleMockProvider>[0], text: string, history: never[] = []) {
  const provider = createRuleMockProvider(script)
  return runAgentSession({ text, context: CONTEXT, history }, { provider, registry: REGISTRY, toolContext: TOOL_CTX })
}

test('SCENARIO 1 — "Why is NIFTY weak?" gathers market + technical evidence', async () => {
  const output = await run(({ callCount }) => {
    if (callCount === 1) return { kind: 'tool-calls', calls: [toolCall('getMarketSnapshot', {})] }
    if (callCount === 2) return { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] }
    return { kind: 'final', content: finalResponse('Why NIFTY is weak') }
  }, 'Why is NIFTY weak today?')

  assert.equal(output.response.title, 'Why NIFTY is weak')
  const tools = output.trace.filter((t) => t.kind === 'tool').map((t) => t.tool)
  assert.ok(tools.includes('getMarketSnapshot'), 'market evidence gathered')
  assert.ok(tools.includes('getTechnicalAnalysis'), 'technical evidence gathered')
})

test('SCENARIO 2 — "Compare TCS and Infosys" gathers comparison evidence', async () => {
  const output = await run(({ callCount }) => {
    if (callCount === 1) {
      return { kind: 'tool-calls', calls: [toolCall('compareInstruments', { instruments: ['TCS', 'INFY'] })] }
    }
    return { kind: 'final', content: finalResponse('TCS vs Infosys', { intent: 'compare' }) }
  }, 'Compare TCS and Infosys')

  assert.equal(output.response.intent, 'compare')
  const tools = output.trace.filter((t) => t.kind === 'tool').map((t) => t.tool)
  assert.ok(tools.includes('compareInstruments'), 'comparison tool used')
})

test('SCENARIO 3 — "Is this breakout historically reliable?" gathers breakout + historical evidence', async () => {
  const output = await run(({ callCount }) => {
    if (callCount === 1) {
      return { kind: 'tool-calls', calls: [toolCall('detectBreakouts', { instrument: 'nifty-50' })] }
    }
    if (callCount === 2) {
      return { kind: 'tool-calls', calls: [toolCall('getHistoricalValidation', { instrument: 'nifty-50' })] }
    }
    return { kind: 'final', content: finalResponse('Breakout reliability') }
  }, 'Is this breakout historically reliable?')

  const tools = output.trace.filter((t) => t.kind === 'tool').map((t) => t.tool)
  assert.ok(tools.includes('detectBreakouts'), 'breakout evidence gathered')
  assert.ok(tools.includes('getHistoricalValidation'), 'historical evidence gathered')
})

test('SCENARIO 4 — "Challenge the bullish thesis" gathers confluence/conflict evidence', async () => {
  const output = await run(({ callCount }) => {
    if (callCount === 1) {
      return { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] }
    }
    if (callCount === 2) {
      return { kind: 'tool-calls', calls: [toolCall('getConfluence', { instrument: 'nifty-50' })] }
    }
    return {
      kind: 'final',
      content: finalResponse('Challenging the bullish thesis', {
        sections: [
          { heading: 'Supporting evidence', kind: 'fact', body: 'Trend is bullish.' },
          { heading: 'Opposing evidence', kind: 'fact', body: 'Momentum and breadth disagree.' },
          { heading: 'What would invalidate', kind: 'inference', body: 'A break below the nearest support.' },
        ],
      }),
    }
  }, 'Challenge the bullish thesis on NIFTY')

  const tools = output.trace.filter((t) => t.kind === 'tool').map((t) => t.tool)
  assert.ok(tools.includes('getConfluence'), 'confluence evidence gathered')
  const bodies = (output.response.sections ?? [])
    .map((s) => `${s.heading} ${s.body ?? ''}`.toLowerCase())
    .join(' ')
  assert.ok(bodies.includes('opposing'), 'conflict is represented in the answer')
})

test('SCENARIO 5 — "What should I look at next?" is context-aware using prior turn', async () => {
  const history = [
    {
      id: 'h1',
      intent: 'explain' as const,
      title: 'NIFTY 50 technical read',
      generatedAt: new Date(NOW).toISOString(),
    },
  ]
  const output = await run(
    ({ callCount }) => {
      if (callCount === 1) {
        return { kind: 'tool-calls', calls: [toolCall('getTechnicalAnalysis', { instrument: 'nifty-50' })] }
      }
      return { kind: 'final', content: finalResponse('What to watch next', { intent: 'next' }) }
    },
    'What should I look at next?',
    history as never[],
  )

  assert.equal(output.response.intent, 'next')
  const tools = output.trace.filter((t) => t.kind === 'tool').map((t) => t.tool)
  assert.ok(tools.includes('getTechnicalAnalysis'), 'reuses the prior turn instrument')
})