// ---------------------------------------------------------------------------
// Phase 3A — Agent layer: real provider seams
//
// TWO provider implementations, both implementing LLMProvider:
//
// 1) createOpenAICompatibleProvider — talks directly to any OpenAI-compatible
//    /chat/completions endpoint. Intended for a TRUSTED server-side boundary.
//    It accepts an apiKey, so it must NEVER be wired to browser code where the
//    key would leak into client JS.
//
// 2) createApiBoundaryProvider — talks to a Finova serverless/API endpoint
//    that OWNS the credentials. The browser only knows the endpoint URL (a
//    public address, not a secret). This is the safe seam for the static
//    frontend: Analyst UI -> Analyst API -> LLM.
//
// The app resolves providers through apiBoundary.ts, which never touches an
// API key on the client.
// ---------------------------------------------------------------------------

import type { LLMMessage, LLMProvider, LLMRequest, LLMResult, LLMToolCall } from './types'
import { ProviderError } from './types'
import type { AnalystGatewayRequest, AnalystGatewayResponseBody } from '../api/contract'

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

interface OpenAIMessage {
  role: string
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  name?: string
  tool_call_id?: string
}

interface OpenAIResponse {
  choices?: Array<{ message?: OpenAIMessage; finish_reason?: string }>
  error?: { message?: string }
}

/**
 * Extract a provider error message from either the standard OpenAI error
 * shape ({ error: { message } }) or Gemini's OpenAI-compatible error body,
 * which is a top-level ARRAY of the same shape ([{ error: { message } }]).
 * Returns undefined when no message is present.
 */
function extractProviderErrorMessage(parsed: unknown): string | undefined {
  const items = Array.isArray(parsed) ? parsed : [parsed]
  for (const item of items) {
    if (item && typeof item === 'object') {
      const error = (item as { error?: { message?: unknown } }).error
      if (error && typeof error.message === 'string' && error.message.length > 0) {
        return error.message
      }
    }
  }
  return undefined
}

export interface OpenAICompatibleOptions {
  baseUrl: string
  model: string
  apiKey?: string
  fetchImpl?: FetchLike
  timeoutMs?: number
}

function parseToolArguments(raw: string, callId: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // fall through
  }
  throw new ProviderError('invalid-response', `Tool call ${callId} had malformed JSON arguments.`)
}

function mapStatusError(status: number, message: string): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('auth', message)
  if (status === 429) return new ProviderError('rate-limit', message)
  if (status === 408 || status === 504) return new ProviderError('timeout', message)
  if (status >= 500) return new ProviderError('unavailable', message)
  // 4xx rejections (400 bad payload, 404 unknown model/route, ...) mean the
  // REQUEST was wrong, not that the response was malformed. Retrying won't
  // help; the server-side model/baseUrl configuration must be fixed.
  if (status === 400 || status === 404) return new ProviderError('bad-request', message)
  return new ProviderError('invalid-response', message)
}

/** Map the gateway's explicit error codes first, then fall back to HTTP status. */
function mapAnalystError(code: string | undefined, status: number, message: string): ProviderError {
  if (code === 'rate-limit') return new ProviderError('rate-limit', message)
  if (code === 'timeout') return new ProviderError('timeout', message)
  return mapStatusError(status, message)
}

function toOpenAIMessages(messages: LLMMessage[]): OpenAIMessage[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content, name: m.name, tool_call_id: m.toolCallId }
    }
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      // The model's tool calls, echoed as the assistant message that precedes
      // the tool results (each tool result's tool_call_id references these).
      return {
        role: 'assistant',
        content: null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      }
    }
    if (m.role === 'assistant' && m.toolCallId) {
      // Assistant message that contains a tool call (carried via content JSON).
      return { role: 'assistant', content: m.content }
    }
    return { role: m.role, content: m.content }
  })
}

/** Direct OpenAI-compatible chat completions. SERVER-SIDE ONLY (may hold a key). */
export function createOpenAICompatibleProvider(options: OpenAICompatibleOptions): LLMProvider {
  const { baseUrl, model, apiKey, fetchImpl = fetch as unknown as FetchLike, timeoutMs = 30_000 } = options
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  return {
    name: `openai-compatible:${model}`,
    async generate(request: LLMRequest): Promise<LLMResult> {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
      const timer =
        timeoutMs > 0 && controller
          ? setTimeout(() => {
              controller.abort()
            }, timeoutMs)
          : undefined

      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: request.system },
          ...toOpenAIMessages(request.messages),
        ],
        temperature: request.temperature ?? 0,
      }
      if (request.tools && request.tools.length > 0) {
        body.tools = request.tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }))
        body.tool_choice = 'auto'
      }

      let res: { ok: boolean; status: number; json(): Promise<unknown> }
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify(body),
          ...(controller ? { signal: controller.signal as unknown as never } : {}),
        })
      } catch (thrown) {
        const message = thrown instanceof Error ? thrown.message : 'Network error'
        if (thrown instanceof DOMException && thrown.name === 'AbortError') {
          throw new ProviderError('timeout', `Provider timed out after ${timeoutMs}ms.`)
        }
        throw new ProviderError('network', message)
      } finally {
        if (timer) clearTimeout(timer)
      }

      if (!res.ok) {
        let msg = `Provider returned HTTP ${res.status}.`
        try {
          const parsed = (await res.json()) as unknown
          const upstreamMessage = extractProviderErrorMessage(parsed)
          if (upstreamMessage) msg = upstreamMessage
        } catch {
          // ignore body parse failure
        }
        throw mapStatusError(res.status, msg)
      }

      let parsed: OpenAIResponse
      try {
        parsed = (await res.json()) as OpenAIResponse
      } catch {
        throw new ProviderError('invalid-response', 'Provider returned a non-JSON response.')
      }

      const upstreamError = extractProviderErrorMessage(parsed)
      if (upstreamError) {
        throw new ProviderError('invalid-response', upstreamError)
      }

      const message = parsed.choices?.[0]?.message
      if (!message) {
        throw new ProviderError('invalid-response', 'Provider response had no choices.')
      }

      const toolCalls: LLMToolCall[] = (message.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: parseToolArguments(tc.function.arguments, tc.id),
      }))

      return {
        content: message.content ?? '',
        toolCalls,
        stopReason:
          message.tool_calls && message.tool_calls.length > 0
            ? 'tool_calls'
            : parsed.choices?.[0]?.finish_reason === 'length'
              ? 'length'
              : 'stop',
      }
    },
  }
}

export interface ApiBoundaryOptions {
  endpoint: string
  fetchImpl?: FetchLike
  timeoutMs?: number
}

/**
 * Derive the analyst endpoint from the client-safe FINOVA_ANALYST_API_URL:
 * the gateway serves /api/analyze AND /api/search on the same origin, and
 * FINOVA_ANALYST_API_URL is the only FINOVA_* variable Vite exposes. A
 * path-less URL (e.g. http://localhost:8787) is normalized to
 * http://localhost:8787/api/analyze — the same rule the search transport
 * applies for /api/search (see deriveSearchEndpoint).
 */
export function deriveAnalystEndpoint(analystApiUrl: string): string {
  try {
    const url = new URL(analystApiUrl.trim())
    url.pathname = url.pathname.replace(/\/search\/?$/, '/analyze')
    if (!url.pathname.endsWith('/analyze')) url.pathname = '/api/analyze'
    return url.toString()
  } catch {
    return analystApiUrl.trim()
  }
}

/**
 * Talks to a server-side Analyst API that owns the LLM credentials.
 * The client sends ONLY the request payload (prompt + messages + tools) and
 * receives { content, toolCalls }. Never a secret in the browser.
 */
export function createApiBoundaryProvider(options: ApiBoundaryOptions): LLMProvider {
  const { fetchImpl = fetch as unknown as FetchLike, timeoutMs = 30_000 } = options
  const endpoint = deriveAnalystEndpoint(options.endpoint)

  return {
    name: `analyst-api:${endpoint}`,
    async generate(request: LLMRequest): Promise<LLMResult> {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
      const timer =
        timeoutMs > 0 && controller
          ? setTimeout(() => {
              controller.abort()
            }, timeoutMs)
          : undefined

      let res: { ok: boolean; status: number; json(): Promise<unknown> }
      try {
        const payload: AnalystGatewayRequest = {
          system: request.system,
          messages: request.messages,
          tools: request.tools ?? [],
          temperature: request.temperature ?? 0,
        }
        if (request.maxTokens !== undefined) payload.maxTokens = request.maxTokens
        res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          ...(controller ? { signal: controller.signal as unknown as never } : {}),
        })
      } catch (thrown) {
        const message = thrown instanceof Error ? thrown.message : 'Network error'
        if (thrown instanceof DOMException && thrown.name === 'AbortError') {
          throw new ProviderError('timeout', `Analyst API timed out after ${timeoutMs}ms.`)
        }
        throw new ProviderError('network', message)
      } finally {
        if (timer) clearTimeout(timer)
      }

      if (!res.ok) {
        let msg = `Analyst API returned HTTP ${res.status}.`
        let code: string | undefined
        try {
          const parsed = (await res.json()) as { error?: { message?: string; code?: string } }
          if (parsed?.error?.message) msg = parsed.error.message
          code = parsed?.error?.code
        } catch {
          // ignore
        }
        throw mapAnalystError(code, res.status, msg)
      }

      let parsed: AnalystGatewayResponseBody
      try {
        parsed = (await res.json()) as AnalystGatewayResponseBody
      } catch {
        throw new ProviderError('invalid-response', 'Analyst API returned a non-JSON response.')
      }

      if ('error' in parsed) {
        const message = typeof parsed.error?.message === 'string' ? parsed.error.message : 'Analyst API reported an error.'
        throw new ProviderError('invalid-response', message)
      }

      return {
        content: parsed.content ?? '',
        toolCalls: Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [],
        ...(parsed.stopReason ? { stopReason: parsed.stopReason } : {}),
      }
    },
  }
}