import type { AnalystResponse } from '../../types'
import type { ToolResult } from '../../tools/types'
import type { WebSearchResult } from '../../websearch/types'

export function makeResponse(overrides: Partial<AnalystResponse> = {}): AnalystResponse {
  return {
    id: 'r-1',
    intent: 'explain',
    title: 'Why NIFTY is weak',
    summary: 'Synthesized answer from gathered evidence.',
    findings: [
      { kind: 'fact', title: 'Trend', detail: 'NIFTY below its 20-day EMA.' },
      { kind: 'inference', title: 'Read', detail: 'Short-term momentum has weakened.' },
    ],
    confidence: 'Medium',
    generatedAt: '2024-07-03T10:00:00.000Z',
    ...overrides,
  }
}

export function makeToolResult(overrides: Partial<ToolResult> = {}): ToolResult {
  return {
    ok: true,
    data: { rsi: 54.2, macd: -12.5 },
    error: null,
    metadata: {
      tool: 'getTechnicalAnalysis',
      timestamp: '2024-07-03T10:00:00.000Z',
      source: 'technical-engine',
      available: true,
      warnings: [],
    },
    ...overrides,
  }
}

export function makeSource(overrides: Partial<WebSearchResult> = {}): WebSearchResult {
  return {
    title: 'NIFTY closes higher on financials rally',
    url: 'https://example.com/nifty-financials',
    snippet: 'Indian equities closed higher led by financials.',
    source: 'example.com',
    publishedAt: '2024-07-03T09:00:00.000Z',
    provider: 'tavily',
    ...overrides,
  }
}

export const NOW = 1_720_000_000_000