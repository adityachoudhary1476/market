// ---------------------------------------------------------------------------
// Phase 3C.1 — Provider adapters: shared error seam
//
// SERVER-ONLY. Typed errors for the Tavily / Brave adapters. The /api/search
// gateway maps these to sanitized client codes — provider messages are never
// forwarded verbatim (they can carry internal details).
// ---------------------------------------------------------------------------

export type SearchProviderErrorKind =
  | 'auth' // credentials rejected
  | 'rate-limit'
  | 'timeout'
  | 'network' // unreachable / connection failure
  | 'invalid-response' // malformed provider payload — retrying won't help
  | 'unavailable' // provider 5xx — may be transient

export class SearchProviderError extends Error {
  readonly kind: SearchProviderErrorKind

  constructor(kind: SearchProviderErrorKind, message: string) {
    super(message)
    this.name = 'SearchProviderError'
    this.kind = kind
  }

  /** Kinds worth ONE transient retry (locked decision: single retry). */
  get retryable(): boolean {
    return this.kind === 'timeout' || this.kind === 'network' || this.kind === 'rate-limit' || this.kind === 'unavailable'
  }
}

export function mapProviderHttpStatus(status: number, message: string): SearchProviderError {
  if (status === 401 || status === 403) return new SearchProviderError('auth', message)
  if (status === 429) return new SearchProviderError('rate-limit', message)
  if (status === 408 || status === 504) return new SearchProviderError('timeout', message)
  if (status >= 500) return new SearchProviderError('unavailable', message)
  return new SearchProviderError('invalid-response', message)
}