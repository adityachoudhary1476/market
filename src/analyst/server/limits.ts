// ---------------------------------------------------------------------------
// Phase 3B — Analyst API gateway: request/response limits and validation
//
// The gateway is a public endpoint, so it must defend itself:
//   - request body / question / history / tool-catalog size bounds
//   - tool names restricted to the registered Finova tool registry
//   - response bounds (content length, tool-call count, argument size)
//
// Everything here is pure and framework-independent so tests can exercise it
// without HTTP or a real LLM.
// ---------------------------------------------------------------------------

import type { AnalystGatewayRequest } from '../api/contract'
import type { LLMMessage, LLMRole, LLMToolCall, LLMResult } from '../agent/types'
import type { ToolDefinition } from '../tools/types'

export const GATEWAY_LIMITS = {
  /** Maximum request body the HTTP layer accepts. */
  maxBodyBytes: 256_000,
  /** Maximum system-prompt length. */
  maxSystemChars: 64_000,
  /** Maximum number of messages in one request. */
  maxMessages: 48,
  /** Maximum length of a single message. */
  maxMessageChars: 32_000,
  /** Maximum total message payload per request. */
  maxTotalMessageChars: 200_000,
  /** Maximum number of tool definitions in the catalog. */
  maxToolCatalog: 20,
  /** Maximum tool description length. */
  maxToolDescriptionChars: 4_000,
  /** Maximum serialized tool-parameter schema size. */
  maxToolParametersChars: 8_000,
  /** Maximum length of the LLM's final content. */
  maxResponseContentChars: 64_000,
  /** Maximum tool calls in a single provider response. */
  maxToolCallsPerResponse: 16,
  /** Maximum serialized size of one tool-call argument object. */
  maxToolArgumentsChars: 8_000,
  /** Maximum question length (the last user message). */
  maxQuestionChars: 8_000,
  /** Maximum length of free-form string fields (names, ids). */
  maxNameChars: 128,
  /** Maximum instruments per array argument. */
  maxInstruments: 8,
  /** Hard deadline for one gateway request (ms). */
  maxRequestDeadlineMs: 45_000,
} as const

const ROLES: readonly LLMRole[] = ['system', 'user', 'assistant', 'tool']
const STOP_REASONS: readonly NonNullable<LLMResult['stopReason']>[] = ['stop', 'tool_calls', 'length', 'error']

export interface GatewayValidationFailure {
  ok: false
  code: 'invalid-request' | 'request-too-large'
  message: string
}

export type GatewayRequestValidation =
  | { ok: true; request: AnalystGatewayRequest }
  | GatewayValidationFailure

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function tooLarge(message: string): GatewayValidationFailure {
  return { ok: false, code: 'request-too-large', message }
}

function invalid(message: string): GatewayValidationFailure {
  return { ok: false, code: 'invalid-request', message }
}

/**
 * Validate a decoded gateway request body.
 * `knownToolNames` is the whitelist from the Finova tool registry — the model
 * may only be offered tools that actually exist in Finova's deterministic
 * registry.
 */
export function validateGatewayRequest(body: unknown, knownToolNames: ReadonlySet<string>): GatewayRequestValidation {
  if (!isRecord(body)) return invalid('Request body must be a JSON object.')

  const system = body.system
  if (typeof system !== 'string') return invalid('"system" is required and must be a string.')
  if (system.length > GATEWAY_LIMITS.maxSystemChars) return tooLarge('System prompt exceeds the size limit.')

  const rawMessages = body.messages
  if (!Array.isArray(rawMessages)) return invalid('"messages" is required and must be an array.')
  if (rawMessages.length > GATEWAY_LIMITS.maxMessages) {
    return tooLarge(`Too many messages (max ${GATEWAY_LIMITS.maxMessages}).`)
  }

  const messages: LLMMessage[] = []
  let totalChars = 0
  for (const m of rawMessages) {
    if (!isRecord(m)) return invalid('Each message must be an object.')
    const role = m.role
    if (typeof role !== 'string' || !ROLES.includes(role as LLMRole)) {
      return invalid(`Invalid message role: ${String(role)}.`)
    }
    if (typeof m.content !== 'string') return invalid('Each message must have a string "content".')
    if (m.content.length > GATEWAY_LIMITS.maxMessageChars) return tooLarge('A message exceeds the size limit.')
    totalChars += m.content.length
    if (totalChars > GATEWAY_LIMITS.maxTotalMessageChars) {
      return tooLarge('Total message payload exceeds the size limit.')
    }

    const name = typeof m.name === 'string' ? m.name.slice(0, GATEWAY_LIMITS.maxNameChars) : undefined
    const toolCallId = typeof m.toolCallId === 'string' ? m.toolCallId.slice(0, GATEWAY_LIMITS.maxNameChars) : undefined

    // Assistant messages may echo the model's tool calls (multi-round
    // protocol); validated and bounded, never trusted blindly.
    let toolCalls: LLMToolCall[] | undefined
    if (m.toolCalls !== undefined && m.toolCalls !== null) {
      if (!Array.isArray(m.toolCalls)) return invalid('Message "toolCalls" must be an array.')
      toolCalls = []
      for (const tc of m.toolCalls) {
        if (!isRecord(tc) || typeof tc.id !== 'string' || typeof tc.name !== 'string' || !isRecord(tc.arguments)) {
          return invalid('Each tool call must be an object with string "id", string "name" and object "arguments".')
        }
        if (tc.id.length > GATEWAY_LIMITS.maxNameChars || tc.name.length > GATEWAY_LIMITS.maxNameChars) {
          return invalid('A tool call id/name exceeds the size limit.')
        }
        if (JSON.stringify(tc.arguments).length > GATEWAY_LIMITS.maxToolArgumentsChars) {
          return tooLarge('A tool call arguments object exceeds the size limit.')
        }
        toolCalls.push({ id: tc.id, name: tc.name, arguments: tc.arguments })
      }
    }

    messages.push({
      role: role as LLMRole,
      content: m.content,
      ...(name ? { name } : {}),
      ...(toolCallId ? { toolCallId } : {}),
      ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    })
  }

  // The question is the last user message (orchestrator contract).
  const question = [...messages].reverse().find((m) => m.role === 'user')
  if (question && question.content.length > GATEWAY_LIMITS.maxQuestionChars) {
    return tooLarge('Question exceeds the size limit.')
  }

  let tools: ToolDefinition[] | undefined
  if (body.tools !== undefined && body.tools !== null) {
    if (!Array.isArray(body.tools)) return invalid('"tools" must be an array.')
    if (body.tools.length > GATEWAY_LIMITS.maxToolCatalog) {
      return tooLarge(`Too many tool definitions (max ${GATEWAY_LIMITS.maxToolCatalog}).`)
    }
    tools = []
    for (const t of body.tools) {
      if (!isRecord(t)) return invalid('Each tool definition must be an object.')
      if (typeof t.name !== 'string') return invalid('Each tool definition must have a string "name".')
      if (!knownToolNames.has(t.name)) {
        return invalid(`Tool '${t.name}' is not a registered Finova tool.`)
      }
      if (typeof t.description !== 'string' || t.description.length > GATEWAY_LIMITS.maxToolDescriptionChars) {
        return invalid(`Tool '${t.name}' has an invalid or oversized description.`)
      }
      const params = t.parameters
      if (!isRecord(params) || params.type !== 'object') {
        return invalid(`Tool '${t.name}' must declare object parameters.`)
      }
      if (JSON.stringify(params).length > GATEWAY_LIMITS.maxToolParametersChars) {
        return tooLarge(`Tool '${t.name}' parameters exceed the size limit.`)
      }
      // The server forwards the catalog to the LLM as-is; the Phase 3A
      // registry remains the authoritative source of tool schemas on the
      // client. The cast is intentional: shape was validated above and the
      // payload is size-bounded JSON.
      tools.push({ name: t.name, description: t.description, parameters: params as unknown as ToolDefinition['parameters'] })
    }
  }

  let temperature: number | undefined
  if (body.temperature !== undefined && body.temperature !== null) {
    if (typeof body.temperature !== 'number' || !Number.isFinite(body.temperature) || body.temperature < 0 || body.temperature > 2) {
      return invalid('"temperature" must be a number between 0 and 2.')
    }
    temperature = body.temperature
  }

  let maxTokens: number | undefined
  if (body.maxTokens !== undefined && body.maxTokens !== null) {
    if (typeof body.maxTokens !== 'number' || !Number.isInteger(body.maxTokens) || body.maxTokens < 1 || body.maxTokens > 16_384) {
      return invalid('"maxTokens" must be an integer between 1 and 16384.')
    }
    maxTokens = body.maxTokens
  }

  let requestId: string | undefined
  if (body.requestId !== undefined && body.requestId !== null) {
    if (typeof body.requestId !== 'string' || body.requestId.length > 64) {
      return invalid('"requestId" must be a string of at most 64 characters.')
    }
    requestId = body.requestId
  }

  return { ok: true, request: { system, messages, ...(tools && tools.length > 0 ? { tools } : {}), ...(temperature !== undefined ? { temperature } : {}), ...(maxTokens !== undefined ? { maxTokens } : {}), ...(requestId ? { requestId } : {}) } }
}

export type GatewayResponseValidation =
  | { ok: true; result: { content: string; toolCalls: LLMToolCall[]; stopReason?: LLMResult['stopReason'] } }
  | { ok: false; message: string }

/** Validate a provider result before it leaves the gateway. */
export function validateGatewayResponse(
  raw: unknown,
  knownToolNames: ReadonlySet<string>,
): GatewayResponseValidation {
  if (!isRecord(raw)) return { ok: false, message: 'Provider result must be an object.' }

  const content = raw.content
  if (typeof content !== 'string') return { ok: false, message: 'Provider result must have a string "content".' }
  if (content.length > GATEWAY_LIMITS.maxResponseContentChars) {
    return { ok: false, message: 'Provider content exceeds the size limit.' }
  }

  const rawCalls = raw.toolCalls
  if (rawCalls === undefined || rawCalls === null) {
    return { ok: false, message: 'Provider result must include "toolCalls".' }
  }
  if (!Array.isArray(rawCalls)) return { ok: false, message: '"toolCalls" must be an array.' }
  if (rawCalls.length > GATEWAY_LIMITS.maxToolCallsPerResponse) {
    return { ok: false, message: `Too many tool calls (max ${GATEWAY_LIMITS.maxToolCallsPerResponse}).` }
  }

  const toolCalls: LLMToolCall[] = []
  for (const tc of rawCalls) {
    if (!isRecord(tc)) return { ok: false, message: 'Each tool call must be an object.' }
    if (typeof tc.id !== 'string' || tc.id.length > GATEWAY_LIMITS.maxNameChars) {
      return { ok: false, message: 'Tool call id must be a bounded string.' }
    }
    if (typeof tc.name !== 'string') return { ok: false, message: 'Tool call must have a string "name".' }
    if (!knownToolNames.has(tc.name)) {
      return { ok: false, message: `Tool call '${tc.name}' is not a registered Finova tool.` }
    }
    const args = tc.arguments
    if (!isRecord(args)) return { ok: false, message: `Tool call '${tc.name}' arguments must be an object.` }
    if (JSON.stringify(args).length > GATEWAY_LIMITS.maxToolArgumentsChars) {
      return { ok: false, message: `Tool call '${tc.name}' arguments exceed the size limit.` }
    }
    // Entity/instrument fields are bounded (canonical resolution happens in
    // the Phase 3A orchestrator, which remains authoritative).
    const instrument = args.instrument
    if (instrument !== undefined && (typeof instrument !== 'string' || instrument.length > 64)) {
      return { ok: false, message: `Tool call '${tc.name}' has an invalid "instrument".` }
    }
    const instruments = args.instruments
    if (instruments !== undefined) {
      if (!Array.isArray(instruments) || instruments.length > GATEWAY_LIMITS.maxInstruments) {
        return { ok: false, message: `Tool call '${tc.name}' has an invalid "instruments" array.` }
      }
      if (instruments.some((i) => typeof i !== 'string' || i.length > 64)) {
        return { ok: false, message: `Tool call '${tc.name}' has an invalid "instruments" entry.` }
      }
    }
    toolCalls.push({ id: tc.id, name: tc.name, arguments: args })
  }

  let stopReason: LLMResult['stopReason']
  if (raw.stopReason === undefined || raw.stopReason === null) {
    stopReason = toolCalls.length > 0 ? 'tool_calls' : 'stop'
  } else if (STOP_REASONS.includes(raw.stopReason as NonNullable<LLMResult['stopReason']>)) {
    stopReason = raw.stopReason as NonNullable<LLMResult['stopReason']>
  } else {
    return { ok: false, message: 'Provider result has an invalid "stopReason".' }
  }

  return { ok: true, result: { content, toolCalls, stopReason } }
}