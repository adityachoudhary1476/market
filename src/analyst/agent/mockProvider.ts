// ---------------------------------------------------------------------------
// Phase 3A — Agent layer: deterministic mock LLM provider
//
// A fully deterministic, scripted LLM for tests and offline demos. It simulates:
//   - a final JSON response
//   - one or many tool calls in a single round
//   - multiple reasoning rounds
//   - an invalid (non-JSON) response
//   - provider errors / timeouts
//   - malformed tool arguments
// Tests never require a real API.
// ---------------------------------------------------------------------------

import type { LLMProvider, LLMRequest, LLMResult, LLMToolCall, ProviderErrorKind } from './types'
import { ProviderError } from './types'

export type MockStep =
  | { kind: 'final'; content: string }
  | { kind: 'tool-calls'; calls: LLMToolCall[] }
  | { kind: 'invalid'; content?: string }
  | { kind: 'error'; errorKind: ProviderErrorKind; message?: string }
  | { kind: 'timeout'; message?: string }

export interface MockProviderOptions {
  /** Repeat the last step when the script is exhausted (default true). */
  loop?: boolean
  name?: string
}

/** A scripted provider. Consumes steps in order; loops the last when exhausted. */
export function createMockProvider(steps: MockStep[], options: MockProviderOptions = {}): LLMProvider {
  const { loop = true, name = 'mock' } = options
  let index = -1
  let calls = 0

  return {
    name,
    async generate(_request: LLMRequest): Promise<LLMResult> {
      calls += 1
      if (steps.length === 0) throw new ProviderError('unavailable', 'Mock provider has no steps.')
      if (!loop && calls > steps.length) {
        throw new ProviderError('unavailable', `Mock provider script exhausted after ${calls} calls.`)
      }
      index = Math.min(index + 1, steps.length - 1)
      const step = steps[index]
      switch (step.kind) {
        case 'final':
          return { content: step.content, toolCalls: [] }
        case 'tool-calls':
          return { content: '', toolCalls: step.calls, stopReason: 'tool_calls' }
        case 'invalid':
          return { content: step.content ?? 'this is not json', toolCalls: [] }
        case 'timeout':
          throw new ProviderError('timeout', step.message ?? 'Mock provider timed out.')
        case 'error':
          throw new ProviderError(step.errorKind, step.message ?? `Mock provider error: ${step.errorKind}`)
      }
    },
  }
}

export interface RuleContext {
  request: LLMRequest
  round: number
  /** Number of calls so far this session. */
  callCount: number
}

export type MockRule = (ctx: RuleContext) => MockStep

/**
 * A deterministic rule-based provider: given the full request (including tool
 * results already appended to messages), it decides the next step. This lets
 * golden tests exercise *dynamic* tool selection — the model inspects a tool
 * result and decides whether another tool is needed.
 */
export function createRuleMockProvider(rule: MockRule, options: MockProviderOptions = {}): LLMProvider {
  const { name = 'rule-mock' } = options
  let callCount = 0

  return {
    name,
    async generate(request: LLMRequest): Promise<LLMResult> {
      callCount += 1
      const step = rule({ request, round: callCount, callCount })
      switch (step.kind) {
        case 'final':
          return { content: step.content, toolCalls: [] }
        case 'tool-calls':
          return { content: '', toolCalls: step.calls, stopReason: 'tool_calls' }
        case 'invalid':
          return { content: step.content ?? 'not json at all', toolCalls: [] }
        case 'timeout':
          throw new ProviderError('timeout', step.message ?? 'Mock rule timed out.')
        case 'error':
          throw new ProviderError(step.errorKind, step.message ?? `Mock rule error: ${step.errorKind}`)
      }
    },
  }
}

/** Convenience: build a single tool call. */
export function toolCall(name: string, args: Record<string, unknown>, id = 'call-1'): LLMToolCall {
  return { id, name, arguments: args }
}