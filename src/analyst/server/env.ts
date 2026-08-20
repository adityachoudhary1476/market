// ---------------------------------------------------------------------------
// Phase 3B — Analyst API gateway: server-side environment
//
// SERVER-ONLY. This module reads the LLM credentials and configuration that
// the browser must never see. It must never be imported from the client
// graph — the security tests verify that.
//
// All reads go through resolveServerEnv(), a pure function, so tests can
// exercise the parsing without touching process.env.
//
// Naming convention (FINOVA_*): the Vite envPrefix config exposes exactly ONE
// FINOVA variable to the browser (FINOVA_ANALYST_API_URL, a public endpoint).
// Every FINOVA_LLM_* variable below is server-only by construction.
// ---------------------------------------------------------------------------

export const SUPPORTED_LLM_PROVIDERS = ['openai-compatible'] as const
export type SupportedLLMProvider = (typeof SUPPORTED_LLM_PROVIDERS)[number]

export interface ServerEnv {
  /** Provider seam id. Phase 3B supports the generic OpenAI-compatible seam. */
  provider: SupportedLLMProvider
  /** Provider API key — exists ONLY here, server-side. */
  apiKey: string
  /** Model name, e.g. "gpt-4o-mini". */
  model: string
  /** OpenAI-compatible base URL, e.g. "https://api.openai.com/v1". */
  baseUrl: string
  /** Upstream provider call timeout in ms. */
  timeoutMs: number
  /** Local dev HTTP port. */
  port: number
  /** Per-IP fixed-window request cap (0 disables). */
  rateLimitMax: number
  /** Fixed-window length in ms. */
  rateLimitWindowMs: number
  /** CORS origin for the browser boundary ("*" or a single origin). */
  corsOrigin: string
}

const DEFAULTS = {
  provider: 'openai-compatible' as const,
  model: 'gpt-4o-mini',
  baseUrl: 'https://api.openai.com/v1',
  timeoutMs: 30_000,
  port: 8787,
  rateLimitMax: 60,
  rateLimitWindowMs: 60_000,
  corsOrigin: '*',
}

function parsePositiveInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw === null) return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * Resolve and validate the server-side LLM configuration.
 * Returns null when the gateway is NOT configured (no API key, or an
 * unsupported provider) — the gateway then answers 503 provider-not-configured
 * and the frontend falls back to the deterministic engine.
 */
export function resolveServerEnv(env: Record<string, string | undefined>): ServerEnv | null {
  const provider = (env.FINOVA_LLM_PROVIDER ?? DEFAULTS.provider).trim().toLowerCase()
  if (!SUPPORTED_LLM_PROVIDERS.includes(provider as SupportedLLMProvider)) return null

  const apiKey = (env.FINOVA_LLM_API_KEY ?? '').trim()
  if (!apiKey) return null

  const model = (env.FINOVA_LLM_MODEL ?? '').trim() || DEFAULTS.model
  const baseUrl = (env.FINOVA_LLM_BASE_URL ?? '').trim() || DEFAULTS.baseUrl

  return {
    provider: provider as SupportedLLMProvider,
    apiKey,
    model,
    baseUrl,
    timeoutMs: parsePositiveInt(env.FINOVA_LLM_TIMEOUT_MS, DEFAULTS.timeoutMs, 1_000, 120_000),
    port: parsePositiveInt(env.FINOVA_ANALYST_PORT, DEFAULTS.port, 1, 65_535),
    rateLimitMax: parsePositiveInt(env.FINOVA_GATEWAY_RATE_LIMIT, DEFAULTS.rateLimitMax, 0, 10_000),
    rateLimitWindowMs: parsePositiveInt(env.FINOVA_GATEWAY_RATE_LIMIT_WINDOW_MS, DEFAULTS.rateLimitWindowMs, 1_000, 3_600_000),
    corsOrigin: (env.FINOVA_GATEWAY_CORS_ORIGIN ?? DEFAULTS.corsOrigin).trim() || DEFAULTS.corsOrigin,
  }
}