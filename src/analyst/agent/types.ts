// ---------------------------------------------------------------------------
// Phase 3A — Agent layer: core types
//
// LLM = REASONING · TOOLS = EVIDENCE · UI = PRESENTATION
//
// The agent layer sits between the existing AnalystEngine seam and the
// Phase 2E deterministic tool registry. It is provider-agnostic: everything
// here is plain JSON-shaped data and functions — no vendor SDKs, no React,
// no DOM. A provider is anything that implements `LLMProvider`.
//
// Design rules:
//   - The final output is always a validated AnalystResponse (same schema the
//     UI already renders). Never free-form prose.
//   - Tool calls are dynamic: the model decides what evidence it needs.
//   - Every loop is bounded (rounds, tool calls, retries, result size).
//   - Tool results are authoritative evidence; the model must not invent
//     values that tools report as unavailable.
// ---------------------------------------------------------------------------

import type { AnalystResponse, Intent } from '../types'
import type { ToolDefinition } from '../tools/types'
import type { ConversationConfig } from '../conversation/types'
import type { Understanding } from './understanding'

// --- Provider contract ------------------------------------------------------

export type LLMRole = 'system' | 'user' | 'assistant' | 'tool'

export interface LLMMessage {
  role: LLMRole
  content: string
  /** Tool name for role === 'tool' messages (OpenAI-style). */
  name?: string
  /** Maps a tool result back to the tool call that produced it. */
  toolCallId?: string
  /**
   * The model's own tool calls, echoed back on the assistant message that
   * precedes the role === 'tool' results (OpenAI-compatible protocol: each
   * tool result's tool_call_id must reference a preceding assistant
   * tool_calls entry).
   */
  toolCalls?: LLMToolCall[]
}

export interface LLMToolCall {
  id: string
  name: string
  /** Parsed JSON object — never a raw string. */
  arguments: Record<string, unknown>
}

export interface LLMResult {
  /** Final free-form content when the model is done (expected: JSON). */
  content: string
  /** Tool calls the model wants executed. Empty when it answered directly. */
  toolCalls: LLMToolCall[]
  stopReason?: 'stop' | 'tool_calls' | 'length' | 'error'
}

export interface LLMRequest {
  system: string
  messages: LLMMessage[]
  tools?: ToolDefinition[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

/** A provider communicates with an LLM. The rest of Finova never sees vendor APIs. */
export interface LLMProvider {
  readonly name: string
  generate(request: LLMRequest): Promise<LLMResult>
}

// --- Provider errors --------------------------------------------------------

export type ProviderErrorKind =
  | 'unavailable' // provider/downstream down (may be transient)
  | 'timeout'
  | 'rate-limit'
  | 'bad-request' // provider rejected the request — bad model id, base URL or payload. Fix server config, don't retry.
  | 'invalid-response' // malformed/missing output — retrying may not help
  | 'network'
  | 'auth'

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind

  constructor(kind: ProviderErrorKind, message: string) {
    super(message)
    this.name = 'ProviderError'
    this.kind = kind
  }

  get retryable(): boolean {
    return this.kind === 'unavailable' || this.kind === 'timeout' || this.kind === 'rate-limit' || this.kind === 'network'
  }
}

// --- Agent session configuration -------------------------------------------

export interface AgentConfig {
  /** Maximum reasoning rounds (LLM calls) per session, including tool rounds. */
  maxReasoningRounds: number
  /** Maximum total tool executions per session. */
  maxToolCalls: number
  /** Retries for transient provider failures per LLM call. */
  maxRetries: number
  /** Retries when the model's structured output fails validation. */
  maxValidationRetries: number
  /** Tool results are truncated to this many chars before being fed back. */
  maxToolResultChars: number
  /** Recent conversation turns included in the prompt (oldest first). */
  maxHistoryTurns: number
  /** Per-call provider timeout in ms (0 = no timeout). */
  timeoutMs: number
  /** Sampling temperature for the LLM. */
  temperature: number
  /** Cache identical tool calls within one session (duplicate suppression). */
  cacheToolResults: boolean
  /**
   * Retrieval-cost optimization — session evidence cache TTL in ms. Entries
   * expire and are never cached indefinitely (default: the approved 300s
   * web-search cache TTL). Applies when cacheToolResults is enabled.
   */
  searchCacheTtlMs?: number
  /**
   * Phase 3D.1 — conversation & context limits. Overrides the bounded
   * conversation memory (entities, findings, sources, corrections, payload
   * sizes, freshness policy, reference-confidence threshold).
   */
  conversation?: ConversationConfig
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxReasoningRounds: 6,
  maxToolCalls: 12,
  maxRetries: 2,
  maxValidationRetries: 2,
  maxToolResultChars: 12_000,
  maxHistoryTurns: 6,
  timeoutMs: 30_000,
  temperature: 0,
  cacheToolResults: true,
}

export type AgentLimitKind = 'rounds' | 'tool-calls' | 'retries' | 'validation'

export interface AgentTraceStep {
  kind: 'llm' | 'tool' | 'error' | 'limit' | 'fallback'
  round: number
  detail: string
  /** Tool name when kind === 'tool'. */
  tool?: string
  /** True when kind === 'tool' and the tool succeeded. */
  ok?: boolean
  /** Provider name that produced this step. */
  provider?: string
}

export interface AgentSessionInput {
  /** The user's natural-language question for this turn. */
  text: string
  /** Compact market snapshot (used for the deterministic fallback path). */
  context: import('../types').AnalystContext
  /** Recent structured responses from previous turns. */
  history?: AnalystResponse[]
}

export interface AgentSessionOutput {
  response: AnalystResponse
  /** Full reasoning trace — tool provenance, errors, limits reached. */
  trace: AgentTraceStep[]
  /** Valid Intents, used by the validator. */
  intents?: Intent[]
  /**
   * Phase 3D — structured understanding of the turn: resolved subject,
   * asset class, intent, scope, clarification need. Debug observability
   * only; never rendered to the end user.
   */
  understanding?: Understanding
}