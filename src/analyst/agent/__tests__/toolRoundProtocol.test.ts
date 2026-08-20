// ---------------------------------------------------------------------------
// Phase 3A — multi-round tool-calling protocol regression tests
//
// OpenAI-compatible endpoints (including Gemini's /v1beta/openai) require the
// model's tool calls to be echoed back as an ASSISTANT message BEFORE the
// role='tool' results: every tool message's tool_call_id must reference a
// preceding assistant tool_calls entry. Without this, round 2+ is rejected by
// the provider and the session falls back to deterministic synthesis.
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentSession } from '../orchestrator'
import { createOpenAICompatibleProvider } from '../openaiCompatible'
import { createDefaultAnalystToolRegistry } from '../../tools/registry'
import { createDefaultToolContext } from '../../tools/context'
import { createRuleMockProvider, toolCall } from '../mockProvider'
import { buildAnalystContext } from '../../buildContext'
import { validateGatewayRequest } from '../../server/limits'
import type { LLMMessage } from '../types'
import type { WebSearchResult } from '../../websearch/types'

const NOW = 1_720_000_000_000

function jsonResponse(init: { ok?: boolean; status?: number; body: unknown }) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    async json() {
      return init.body
    },
  }
}

function validJson(title = 'Answer', summary = 'A synthesis.') {
  return JSON.stringify({
    intent: 'explain',
    title,
    summary,
    sections: [{ heading: 'Evidence', kind: 'fact', body: 'Supporting point.' }],
    findings: [{ kind: 'fact', title: 'Trend', detail: 'up' }],
    confidence: 'High',
  })
}

function result(url: string, title: string, publishedAt: string | null = null): WebSearchResult {
  return { title, url, snippet: 'Body text.', source: new URL(url).hostname, publishedAt, provider: 'tavily' }
}

// --- Type acceptance --------------------------------------------------------

test('LLMMessage accepts an assistant toolCalls field (uses the LLMToolCall type)', () => {
  const message: LLMMessage = {
    role: 'assistant',
    content: '',
    toolCalls: [
      { id: 'call-1', name: 'searchNews', arguments: { subject: 'gold' } },
      { id: 'call-2', name: 'getMacroContext', arguments: { indicatorId: 'gold' } },
    ],
  }
  assert.equal(message.toolCalls?.length, 2)
  assert.equal(message.toolCalls?.[0].arguments.subject, 'gold')
})

// --- OpenAI-compatible serialization ----------------------------------------

test('assistant toolCalls serialize to OpenAI-compatible tool_calls with matching tool_call_id', async () => {
  const captured: { body: string } = { body: '' }
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    model: 'gemini-test',
    fetchImpl: async (_url, init) => {
      captured.body = init.body
      return jsonResponse({
        body: {
          choices: [{ message: { role: 'assistant', content: validJson() }, finish_reason: 'stop' }],
        },
      })
    },
  })

  await provider.generate({
    system: 'sys',
    messages: [
      { role: 'user', content: 'source me some latest news for gold' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call-news', name: 'searchNews', arguments: { subject: 'gold' } }],
      },
      { role: 'tool', name: 'searchNews', toolCallId: 'call-news', content: '{"items":[]}' },
    ],
  })

  const sent = JSON.parse(captured.body) as {
    messages: Array<{
      role: string
      content: string | null
      tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
      tool_call_id?: string
      name?: string
    }>
  }

  const assistant = sent.messages[2]
  assert.equal(assistant.role, 'assistant')
  assert.equal(assistant.content, null)
  assert.equal(assistant.tool_calls?.length, 1)
  assert.equal(assistant.tool_calls?.[0].id, 'call-news')
  assert.equal(assistant.tool_calls?.[0].type, 'function')
  assert.equal(assistant.tool_calls?.[0].function.name, 'searchNews')
  assert.equal(assistant.tool_calls?.[0].function.arguments, '{"subject":"gold"}')

  const tool = sent.messages[3]
  assert.equal(tool.role, 'tool')
  assert.equal(tool.tool_call_id, 'call-news')
  assert.equal(tool.name, 'searchNews')
})

test('multi-tool assistant message preserves order and every id', async () => {
  const captured: { body: string } = { body: '' }
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    model: 'gemini-test',
    fetchImpl: async (_url, init) => {
      captured.body = init.body
      return jsonResponse({
        body: {
          choices: [{ message: { role: 'assistant', content: validJson() }, finish_reason: 'stop' }],
        },
      })
    },
  })

  await provider.generate({
    system: 'sys',
    messages: [
      { role: 'user', content: 'news on gold' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'call-a', name: 'searchNews', arguments: { subject: 'gold' } },
          { id: 'call-b', name: 'getMacroContext', arguments: { indicatorId: 'gold' } },
        ],
      },
      { role: 'tool', name: 'searchNews', toolCallId: 'call-a', content: '{"items":[]}' },
      { role: 'tool', name: 'getMacroContext', toolCallId: 'call-b', content: '{"gold":1}' },
    ],
  })

  const sent = JSON.parse(captured.body) as {
    messages: Array<{ role: string; tool_calls?: Array<{ id: string }>; tool_call_id?: string }>
  }
  const assistant = sent.messages[2]
  assert.deepEqual(
    assistant.tool_calls?.map((tc) => tc.id),
    ['call-a', 'call-b'],
    'assistant tool_calls keep the model\'s order',
  )
  assert.equal(sent.messages[3].tool_call_id, 'call-a')
  assert.equal(sent.messages[4].tool_call_id, 'call-b')
})

test('normal assistant messages keep the existing conversion (no toolCalls)', async () => {
  const captured: { body: string } = { body: '' }
  const provider = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    model: 'gemini-test',
    fetchImpl: async (_url, init) => {
      captured.body = init.body
      return jsonResponse({
        body: { choices: [{ message: { role: 'assistant', content: validJson() }, finish_reason: 'stop' }] },
      })
    },
  })
  await provider.generate({
    system: 'sys',
    messages: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '{"intent":"ask"}' },
    ],
  })
  const sent = JSON.parse(captured.body) as {
    messages: Array<{ role: string; content: string | null; tool_calls?: unknown[] }>
  }
  assert.equal(sent.messages[2].role, 'assistant')
  assert.equal(sent.messages[2].content, '{"intent":"ask"}')
  assert.equal(sent.messages[2].tool_calls, undefined)
})

// --- Orchestrator round history (integration scenario) -----------------------

test('round history is assistant(tool_calls) BEFORE tool results, and the final synthesis round completes', async () => {
  const deps = {
    registry: createDefaultAnalystToolRegistry(),
    toolContext: createDefaultToolContext(NOW),
    config: {},
    context: buildAnalystContext(),
    search: {
      transport: {
        search: async () => ({
          query: 'gold price news',
          provider: 'tavily' as const,
          results: [result('https://kitco.com/gold', 'Gold steadies on safe-haven demand', new Date(NOW - 2 * 3_600_000).toISOString())],
          totalResults: 1,
          truncated: false,
        }),
      },
    },
  }

  const provider = createRuleMockProvider(({ request, callCount }) => {
    if (callCount === 1) {
      // user -> model requests searchNews + getMacroContext
      return {
        kind: 'tool-calls',
        calls: [
          toolCall('searchNews', { subject: 'gold' }, 'call-news'),
          toolCall('getMacroContext', { indicatorId: 'gold' }, 'call-macro'),
        ],
      }
    }
    // round 2 — the protocol under test: the model must receive the echoed
    // assistant tool_calls message BEFORE the tool results, ids matching.
    const assistantIdx = request.messages.findIndex((m) => m.role === 'assistant' && (m.toolCalls?.length ?? 0) > 0)
    assert.notEqual(assistantIdx, -1, 'assistant tool-calls message is present in round 2')
    const assistant = request.messages[assistantIdx]
    assert.deepEqual(
      assistant.toolCalls?.map((t) => t.id),
      ['call-news', 'call-macro'],
      'assistant echoes the exact tool calls in order',
    )
    const firstToolIdx = request.messages.findIndex((m) => m.role === 'tool')
    assert.ok(assistantIdx < firstToolIdx, 'assistant tool_calls precede the tool results')
    const toolIds = request.messages.filter((m) => m.role === 'tool').map((m) => m.toolCallId)
    assert.deepEqual(toolIds, ['call-news', 'call-macro'], 'tool results reference the assistant tool_calls ids')
    assert.ok(
      request.messages[firstToolIdx].content.includes('searchNews'),
      'the searchNews tool result reaches the model',
    )
    // model produces the final synthesis
    return { kind: 'final', content: validJson('Gold news roundup') }
  })

  const output = await runAgentSession(
    { text: 'source me some latest news for gold', context: deps.context, history: [] },
    { ...deps, provider },
  )

  assert.equal(output.response.title, 'Gold news roundup', 'the model synthesis is used, not the deterministic fallback')
  assert.ok(
    output.trace.some((t) => t.kind === 'llm' && t.detail === 'final-response-validated'),
    'the final response was validated, not synthesized-from-evidence',
  )
  assert.equal(output.response.sources?.length, 1, 'news evidence is attached')
})

// --- Single-round / no-tool behavior unchanged -------------------------------

test('single-round, no-tool sessions are unchanged', async () => {
  const deps = {
    registry: createDefaultAnalystToolRegistry(),
    toolContext: createDefaultToolContext(NOW),
    config: {},
    context: buildAnalystContext(),
  }
  let sawToolMessage = false
  const provider = createRuleMockProvider(({ request, callCount }) => {
    if (callCount === 1) {
      assert.equal(request.messages.filter((m) => m.role === 'tool').length, 0)
      return { kind: 'final', content: validJson('Direct answer') }
    }
    sawToolMessage = request.messages.some((m) => m.role === 'tool')
    return { kind: 'final', content: validJson('Direct answer') }
  })
  const output = await runAgentSession(
    { text: 'How is NIFTY doing?', context: deps.context, history: [] },
    { ...deps, provider },
  )
  assert.equal(output.response.title, 'Direct answer')
  assert.ok(!sawToolMessage)
  assert.ok(output.trace.some((t) => t.kind === 'llm' && t.detail === 'final-response-validated'))
})

// --- Gateway boundary preserves the assistant toolCalls ----------------------

test('validateGatewayRequest preserves bounded assistant toolCalls (and rejects malformed ones)', () => {
  const known = new Set<string>(['searchNews', 'getMacroContext'])
  const body = {
    system: 'sys',
    messages: [
      { role: 'user', content: 'source me some latest news for gold' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'call-news', name: 'searchNews', arguments: { subject: 'gold' } },
          { id: 'call-macro', name: 'getMacroContext', arguments: { indicatorId: 'gold' } },
        ],
      },
      { role: 'tool', name: 'searchNews', toolCallId: 'call-news', content: '{"items":[]}' },
    ],
  }
  const ok = validateGatewayRequest(body, known)
  assert.ok(ok.ok, 'valid request passes')
  if (!ok.ok) return
  assert.equal(ok.request.messages[1].toolCalls?.length, 2)
  assert.equal(ok.request.messages[1].toolCalls?.[0].id, 'call-news')
  assert.equal(ok.request.messages[1].toolCalls?.[1].arguments.indicatorId, 'gold')

  const bad = validateGatewayRequest(
    {
      system: 'sys',
      messages: [
        { role: 'assistant', content: '', toolCalls: [{ id: 'x', name: 'searchNews', arguments: 'not-an-object' }] },
      ],
    },
    known,
  )
  assert.ok(!bad.ok, 'malformed toolCalls are rejected — validation is not weakened')
})