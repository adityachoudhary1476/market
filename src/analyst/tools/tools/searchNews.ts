// ---------------------------------------------------------------------------
// Phase 3N.1 — searchNews AnalystTool
//
// The LLM-facing live-news tool. Same honesty contract as searchWeb:
//   - The model names a SUBJECT (and optionally a region + freshness window);
//     the deterministic news module builds the bounded, natural query.
//   - It NEVER fabricates results: the real news search runs asynchronously
//     through the agent session's WebSearchTransport (the Phase 3A
//     orchestrator executes searchNews specially — see orchestrator.ts).
//   - When no transport is configured, run() reports available=false
//     ("not configured") and the agent falls back to Finova evidence.
//   - Direct synchronous execution cannot perform a web request, so run()
//     reports that honestly instead of pretending.
// ---------------------------------------------------------------------------

import type { AnalystTool, ToolResult } from '../types'
import { unavailableResult, errorResult } from '../results'
import { ToolError } from '../errors'
import { buildNewsQuery, type NewsRegion } from '../../websearch/news'
import type { NewsEvidence, WebSearchTransport } from '../../websearch/types'
import { createDefaultWebSearchTransport } from '../../websearch/transport'

export interface SearchNewsInput {
  /** The news subject, e.g. "RBI interest rate decision". */
  subject: string
  /** Optional region hint: "in" | "us" | "global". */
  region?: NewsRegion
  /** Maximum stories to return (1-8, default 5). */
  maxResults?: number
  /** Only stories from the last N days (1-30, default 7). */
  maxAgeDays?: number
}

export interface SearchNewsToolOutput extends NewsEvidence {
  query: import('../../websearch/types').WebSearchQuery
}

export interface SearchNewsToolOptions {
  /** The agent's transport. Null = web search not configured. */
  transport?: WebSearchTransport | null
}

export function createSearchNewsTool(options: SearchNewsToolOptions = {}): AnalystTool<SearchNewsInput, SearchNewsToolOutput> {
  const transport = options.transport ?? null

  return {
    name: 'searchNews',
    description:
      'Use for LIVE NEWS questions — "what is happening with X", "any developments?", "latest headlines on X". Returns the top stories with a deterministic freshness tier (breaking/today/recent/older), a source quality tier and how many outlets independently report each story. Prefer this over searchWeb for news; use searchWeb for general factual queries. Returns only real, validated sources; report unavailable sources honestly.',
    inputSchema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'The news subject, e.g. "RBI interest rate decision" (max 200 characters).',
        },
        region: {
          type: 'string',
          description: 'Optional region hint: "in" (India), "us" (United States), "global".',
          enum: ['in', 'us', 'global'],
        },
        maxResults: {
          type: 'number',
          description: 'Maximum stories to return (1-8, default 5).',
          minimum: 1,
          maximum: 8,
        },
        maxAgeDays: {
          type: 'number',
          description: 'Only stories from the last N days (1-30, default 7).',
          minimum: 1,
          maximum: 30,
        },
      },
      required: ['subject'],
    },

    run(input: SearchNewsInput, context): ToolResult<SearchNewsToolOutput> {
      const build = buildNewsQuery(input.subject, {
        region: input.region,
        maxResults: input.maxResults,
        maxAgeDays: input.maxAgeDays,
      })
      if (!build.ok) {
        return errorResult(this.name, 'web-search', ToolError.invalidInput(build.error), {
          available: false,
          now: context.now,
        })
      }

      if (!transport) {
        return unavailableResult<SearchNewsToolOutput>(this.name, 'web-search', {
          available: false,
          now: context.now,
          warnings: [
            'Web search is not configured for this build. No live news search was performed — fall back to available Finova evidence.',
          ],
        })
      }

      // A web request cannot be performed synchronously. The Phase 3A
      // orchestrator executes searchNews asynchronously through the session
      // transport; a direct run() reports that honestly.
      return unavailableResult<SearchNewsToolOutput>(this.name, 'web-search', {
        available: false,
        now: context.now,
        warnings: [
          'searchNews executes asynchronously through the agent session transport and cannot run synchronously.',
        ],
      })
    },
  }
}

/**
 * The default searchNews tool. Wired to the app's default transport, which is
 * derived from the client-safe FINOVA_ANALYST_API_URL; null (no gateway
 * configured) makes the tool report not-configured honestly.
 */
export const searchNews: AnalystTool<SearchNewsInput, SearchNewsToolOutput> = createSearchNewsTool({
  transport: createDefaultWebSearchTransport(),
})