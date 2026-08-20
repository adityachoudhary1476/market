// ---------------------------------------------------------------------------
// Phase 3B — Analyst API gateway: core handler
//
// The server-side LLM gateway. Pure and framework-independent: it receives a
// decoded request body, validates it, calls the server-side LLM provider and
// returns a sanitized, bounded response. HTTP framing lives in server.ts /
// handler.ts; tests drive this function directly with injected providers.
//
// Security model:
//   - The provider API key lives ONLY in ServerEnv (server-side) and is handed
//     to createOpenAICompatibleProvider — never returned, logged or echoed.
//   - Tool names (both the offered catalog and the model's calls) are
//     restricted to the registered Finova tool registry.
//   - Every provider error is mapped to a sanitized { code, message } shape;
//     provider messages are redacted and truncated. No keys, headers, stack
//     traces or internal paths ever reach the client.
//   - Request and response sizes are bounded (see limits.ts).
//
// Failure semantics match Phase 3A: the gateway reports typed statuses
// (429 / 502 / 503 / 504) and the client orchestrator/engine decides
// retry vs deterministic fallback vs partial synthesis.
// ---------------------------------------------------------------------------

import type { LLMProvider } from '../agent/types'
import { ProviderError } from '../agent/types'
import { createOpenAICompatibleProvider } from '../agent/openaiCompatible'
import { createDefaultAnalystToolRegistry } from '../tools/registry'
import { logAgent } from '../agent/logger'
import type { AnalystGatewayError, AnalystGatewayErrorCode, AnalystGatewayResponseBody } from '../api/contract'
import type { ServerEnv } from './env'
import { GATEWAY_LIMITS, validateGatewayRequest, validateGatewayResponse } from './limits'

export interface GatewayDeps {
  /** Server-side env. null means the gateway is not configured. */
  env: ServerEnv | null
  /** Injectable provider for tests; defaults to the env-wired provider. */
  provider?: LLMProvider
  now?: () => number
}

export interface GatewayResult {
  status: number
  body: AnalystGatewayResponseBody
}

/** Redact any secret that could theoretically appear inside a provider message. */
function redact(text: string, secrets: readonly string[]): string {
  let out = text
  for (const secret of secrets) {
    if (secret.length > 0) out = out.split(secret).join('[redacted]')
  }
  return out.slice(0, 300)
}

function errorBody(code: AnalystGatewayErrorCode, message: string): { error: AnalystGatewayError } {
  return { error: { code, message } }
}

function mapProviderError(err: ProviderError): { status: number; body: { error: AnalystGatewayError } } {
  // Client-facing messages are deliberately generic and fixed — provider text
  // can contain internal paths, request ids or other internals. It is logged
  // (redacted) server-side only, never forwarded to the browser.
  switch (err.kind) {
    case 'rate-limit':
      return { status: 429, body: errorBody('rate-limit', 'The LLM provider rate-limited this request. Try again shortly.') }
    case 'timeout':
      return { status: 504, body: errorBody('timeout', 'The LLM provider timed out.') }
    case 'auth':
      return {
        status: 502,
        body: errorBody('provider-error', 'The LLM provider rejected the server credentials. Check FINOVA_LLM_API_KEY on the server.'),
      }
    case 'network':
      return { status: 502, body: errorBody('provider-error', 'The LLM provider is unreachable.') }
    case 'bad-request':
      // The provider rejected the REQUEST (unknown/retired model, wrong base
      // URL, invalid payload) — a server config problem, not a malformed
      // response. The client gets an honest, sanitized pointer to the config.
      return {
        status: 502,
        body: errorBody(
          'provider-error',
          'The LLM provider rejected the request. Check FINOVA_LLM_MODEL and FINOVA_LLM_BASE_URL on the server.',
        ),
      }
    case 'invalid-response':
      return { status: 502, body: errorBody('provider-error', 'The LLM provider returned a malformed response.') }
    case 'unavailable':
      return { status: 503, body: errorBody('provider-error', 'The LLM provider is unavailable.') }
  }
}

function knownToolNames(): Set<string> {
  return new Set(createDefaultAnalystToolRegistry().list().map((t) => t.name))
}

function buildProvider(env: ServerEnv): LLMProvider {
  // Reuses the Phase 3A OpenAI-compatible seam — no duplicated provider logic.
  return createOpenAICompatibleProvider({
    baseUrl: env.baseUrl,
    model: env.model,
    apiKey: env.apiKey,
    timeoutMs: env.timeoutMs,
  })
}

/**
 * Handle one gateway request. Never throws: every outcome is a status + body.
 */
export async function handleAnalystRequest(body: unknown, deps: GatewayDeps): Promise<GatewayResult> {
  const now = deps.now ?? (() => Date.now())
  const started = now()
  const secrets = deps.env ? [deps.env.apiKey] : []

  const known = knownToolNames()

  const validation = validateGatewayRequest(body, known)
  if (!validation.ok) {
    logAgent({ kind: 'gateway-error', category: validation.code, message: validation.message })
    const status = validation.code === 'request-too-large' ? 413 : 400
    return { status, body: errorBody(validation.code, validation.message) }
  }
  const request = validation.request

  if (!deps.env) {
    logAgent({ kind: 'gateway-error', category: 'provider-not-configured', message: 'gateway not configured' })
    return {
      status: 503,
      body: errorBody(
        'provider-not-configured',
        'The Analyst gateway is not configured. Set FINOVA_LLM_PROVIDER, FINOVA_LLM_API_KEY, FINOVA_LLM_MODEL and FINOVA_LLM_BASE_URL on the server.',
      ),
    }
  }

  const provider = deps.provider ?? buildProvider(deps.env)
  logAgent({ kind: 'gateway-provider-call', provider: provider.name })

  let result: Awaited<ReturnType<LLMProvider['generate']>>
  try {
    result = await provider.generate({
      system: request.system,
      messages: request.messages,
      tools: request.tools,
      temperature: request.temperature ?? 0,
      maxTokens: request.maxTokens,
    })
  } catch (thrown) {
    if (thrown instanceof ProviderError) {
      const mapped = mapProviderError(thrown)
      logAgent({ kind: 'gateway-error', category: thrown.kind, message: redact(thrown.message, secrets) })
      return mapped
    }
    const message = thrown instanceof Error ? thrown.message : 'Unknown provider failure'
    logAgent({ kind: 'gateway-error', category: 'internal', message: redact(message, secrets) })
    return { status: 500, body: errorBody('internal', 'The Analyst gateway hit an unexpected internal error.') }
  }

  const responseCheck = validateGatewayResponse(result, known)
  if (!responseCheck.ok) {
    logAgent({ kind: 'gateway-error', category: 'invalid-response', message: responseCheck.message })
    return { status: 502, body: errorBody('provider-error', `The LLM provider returned an invalid result. ${responseCheck.message}`) }
  }

  const { content, toolCalls, stopReason } = responseCheck.result
  logAgent({
    kind: 'gateway-response',
    provider: provider.name,
    toolCalls: toolCalls.length,
    latencyMs: now() - started,
  })

  return {
    status: 200,
    body: { content, toolCalls, ...(stopReason ? { stopReason } : {}) },
  }
}

export const GATEWAY_DEADLINE_MS = GATEWAY_LIMITS.maxRequestDeadlineMs