// ---------------------------------------------------------------------------
// Phase 3B — Analyst API gateway: lightweight in-memory rate limiter
//
// A tiny fixed-window limiter for the local/self-hosted Node gateway. It is
// deliberately dependency-free, per-process and optional:
//   - keyed (typically by client IP)
//   - bounded fixed window (default 60s)
//   - pure, so tests can drive it with an injected clock
//
// This is basic abuse protection, NOT an authentication system — enterprise
// auth belongs to a later phase. Serverless platforms usually provide their
// own rate limiting at the platform layer.
// ---------------------------------------------------------------------------

export interface RateLimiterOptions {
  /** Requests allowed per window per key. */
  max: number
  /** Window length in ms. */
  windowMs?: number
  now?: () => number
}

export interface RateLimitDecision {
  allowed: boolean
  /** Requests still permitted in the current window. */
  remaining: number
  /** ms until the window resets (useful for Retry-After). */
  retryAfterMs: number
}

interface WindowState {
  start: number
  count: number
}

export function createRateLimiter(options: RateLimiterOptions): (key: string) => RateLimitDecision {
  const windowMs = options.windowMs ?? 60_000
  const now = options.now ?? (() => Date.now())
  const windows = new Map<string, WindowState>()

  return (key: string): RateLimitDecision => {
    const t = now()
    let state = windows.get(key)

    if (!state || t - state.start >= windowMs) {
      state = { start: t, count: 0 }
      windows.set(key, state)
    }

    if (state.count >= options.max) {
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, windowMs - (t - state.start)) }
    }

    state.count += 1
    return { allowed: true, remaining: options.max - state.count, retryAfterMs: 0 }
  }
}