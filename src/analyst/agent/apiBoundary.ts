// ---------------------------------------------------------------------------
// Phase 3A — Agent layer: provider resolution / API boundary
//
// The browser NEVER holds an LLM API key. This module resolves which provider
// the app should use:
//
//   - If FINOVA_ANALYST_API_URL is configured (a public server endpoint, not
//     a secret), the client talks to that server-side boundary, which owns
//     the credentials.
//   - Otherwise it falls back to the deterministic offline mock provider so
//     the app remains fully usable and testable without any network.
//
// Server-side consumers (a future backend) should import
// `createOpenAICompatibleProvider` from './openaiCompatible' and pass a key
// from server-only environment variables. That file is intentionally NOT
// re-exported into browser bundles via the agent barrel.
// ---------------------------------------------------------------------------

import type { LLMProvider } from './types'
import { createMockProvider, type MockStep } from './mockProvider'
import { createApiBoundaryProvider } from './openaiCompatible'

export interface ProviderResolution {
  provider: LLMProvider
  /** Human-readable description of how the provider was chosen. */
  mode: 'api-boundary' | 'mock' | 'custom'
}

/**
 * The offline/demo default script. Deterministic and useful: it answers
 * directly with a structured greeting-style response so the agent loop works
 * end-to-end without a network. Real deployments replace this via the API
 * boundary URL.
 */
const DEMO_SCRIPT: MockStep[] = [
  {
    kind: 'final',
    content: JSON.stringify({
      intent: 'summary',
      title: 'Finova Analyst — demo mode',
      summary:
        'The AI Analyst reasoning layer is running in offline demo mode. Configure FINOVA_ANALYST_API_URL to connect the live reasoning model.',
      sections: [
        {
          heading: 'How to go live',
          kind: 'inference',
          bullets: [
            'This response came from the deterministic mock provider — no LLM call was made.',
            'Point FINOVA_ANALYST_API_URL at a server-side Analyst API endpoint to enable live reasoning.',
            'The deterministic tools, entity resolution and validation all work identically either way.',
          ],
        },
      ],
      recommendations: ['Set FINOVA_ANALYST_API_URL to your Analyst API endpoint.'],
      confidence: 'High',
      followUps: ['Why is NIFTY moving?', 'Compare TCS and Infosys'],
      partial: true,
    }),
  },
]

/**
 * Resolve the provider for the current runtime. In the browser, only
 * VITE_* env vars are available; the only VITE variable we read is the
 * Analyst API URL — a public endpoint, never a secret.
 */
export function resolveAppProvider(): ProviderResolution {
  const vite = safeViteEnv()

  const endpoint = vite.FINOVA_ANALYST_API_URL
  if (endpoint && endpoint.trim().length > 0) {
    return { provider: createApiBoundaryProvider({ endpoint: endpoint.trim() }), mode: 'api-boundary' }
  }

  return { provider: createMockProvider(DEMO_SCRIPT, { name: 'demo' }), mode: 'mock' }
}

/**
 * Read Vite env without crashing in non-Vite (node test) runtimes.
 * NOTE: must access import.meta.env DIRECTLY — Vite statically replaces
 * `import.meta.env` (dev and build); reading it through a local alias like
 * `const meta = import.meta` defeats the replacement and yields undefined in
 * the browser, silently selecting the demo provider.
 */
function safeViteEnv(): Record<string, string | undefined> {
  try {
    return (import.meta.env as Record<string, string | undefined> | undefined) ?? {}
  } catch {
    return {}
  }
}