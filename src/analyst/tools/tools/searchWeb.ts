// ---------------------------------------------------------------------------
// Phase 3C.1 — searchWeb AnalystTool
//
// The LLM-facing web search tool. Like every Finova tool it is deterministic
// and honest:
//   - Its input schema is validated against the approved limits.
//   - It NEVER fabricates results: the real search runs asynchronously
//     through the agent session's WebSearchTransport (the Phase 3A
//     orchestrator executes searchWeb specially — see orchestrator.ts).
//   - When no transport is configured, run() reports available=false
//     ("not configured") and the agent falls back to Finova evidence
//     (locked decision 8).
//   - Direct synchronous execution cannot perform a web request, so run()
//     reports that honestly instead of pretending.
// ---------------------------------------------------------------------------

import type { AnalystTool, ToolResult } from '../types'
import { unavailableResult, errorResult } from '../results'
import { ToolError } from '../errors'
import { validateWebSearchQuery } from '../../websearch/limits'
import type { WebSearchResult, WebSearchTransport } from '../../websearch/types'
import { createDefaultWebSearchTransport } from '../../websearch/transport'

export interface SearchWebInput {
  query: string
  maxResults?: number
  recencyDays?: number
  domainFilter?: string
}

export interface SearchWebToolOutput {
  query: string
  results: WebSearchResult[]
  /** Valid results before the evidence budget cut. */
  totalResults: number
  /** True when results were cut to fit the evidence budget. */
  truncated: boolean
  /** True when the server answered from its cache. */
  cached?: boolean
}

export interface SearchWebToolOptions {
  /** The agent's transport. Null = web search not configured. */
  transport?: WebSearchTransport | null
}

export function createSearchWebTool(options: SearchWebToolOptions = {}): AnalystTool<SearchWebInput, SearchWebToolOutput> {
  const transport = options.transport ?? null

  return {
    name: 'searchWeb',
    description:
      'Use when the question needs current web context the deterministic market tools cannot provide — recent news, events, announcements, company or macro developments. Returns only real, validated sources (title, url, snippet, publication date when known). Never fabricates results; report unavailable sources honestly.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query (max 400 characters).',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum results to return (1-8, default 5).',
          minimum: 1,
          maximum: 8,
        },
        recencyDays: {
          type: 'number',
          description: 'Only results from the last N days (1-3650).',
          minimum: 1,
          maximum: 3650,
        },
        domainFilter: {
          type: 'string',
          description: 'Restrict to a single domain, e.g. "reuters.com".',
        },
      },
      required: ['query'],
    },

    run(input: SearchWebInput, context): ToolResult<SearchWebToolOutput> {
      const validation = validateWebSearchQuery(input)
      if (!validation.ok) {
        return errorResult(this.name, 'web-search', ToolError.invalidInput(validation.error), {
          available: false,
          now: context.now,
        })
      }

      if (!transport) {
        return unavailableResult<SearchWebToolOutput>(this.name, 'web-search', {
          available: false,
          now: context.now,
          warnings: [
            'Web search is not configured for this build. No live search was performed — fall back to available Finova evidence.',
          ],
        })
      }

      // A web request cannot be performed synchronously. The Phase 3A
      // orchestrator executes searchWeb asynchronously through the session
      // transport; a direct run() reports that honestly.
      return unavailableResult<SearchWebToolOutput>(this.name, 'web-search', {
        available: false,
        now: context.now,
        warnings: [
          'searchWeb executes asynchronously through the agent session transport and cannot run synchronously.',
        ],
      })
    },
  }
}

/**
 * The default searchWeb tool. Wired to the app's default transport, which is
 * derived from the client-safe FINOVA_ANALYST_API_URL; null (no gateway
 * configured) makes the tool report not-configured honestly.
 */
export const searchWeb: AnalystTool<SearchWebInput, SearchWebToolOutput> = createSearchWebTool({
  transport: createDefaultWebSearchTransport(),
})