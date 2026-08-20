// ---------------------------------------------------------------------------
// Phase 3N.2 — Conversational Response Intelligence: test suite (RI1–RI26)
//
// Locks in the deterministic seams that make answers read like an analyst's
// answer instead of a dump of internal machinery:
//   - tool names never surface in normal prose;
//   - exact-duplicate sections are folded, empty sections are dropped,
//     repeated headings are detected — never merging content blindly;
//   - opposite directional signals surface as conflicts, never averaged away;
//   - the summary opens with the answer (substance first), built only from
//     real evidence;
//   - news stories render as short theme lines, never article dumps;
//   - the refinement pass over final responses is deterministic and
//     non-destructive (facts and structure are preserved).
// Evidence honesty is inherited from the tool layer: nothing here invents
// values, URLs, dates or figures.
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SUPPRESSED_TOOL_NAMES,
  containsToolName,
  firstToolName,
  toolNamesInText,
  naturalHeadingForTool,
  isExactDuplicateSection,
  dedupeSections,
  hasRepeatedHeadings,
  dropEmptySections,
  repeatedCaveats,
  directionalSign,
  directionalGroupOf,
  detectConflicts,
  newsThemes,
  themeLines,
  buildAnswerFirstSummary,
  refineResponse,
} from '../responseIntelligence'
import type { AnalystResponse } from '../../types'
import type { ToolResult } from '../../tools/types'
import type { NewsItem } from '../../websearch/types'

const NOW = 1_720_000_000_000

function result(overrides: Partial<ToolResult> = {}): ToolResult {
  return {
    ok: true,
    data: { rsi: 54.2, macd: -12.5 },
    error: null,
    metadata: {
      tool: 'getTechnicalAnalysis',
      timestamp: new Date(NOW).toISOString(),
      source: 'technical-engine',
      available: true,
      warnings: [],
    },
    ...overrides,
  }
}

function newsItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: 'Gold steadies near record as traders weigh Fed path',
    url: 'https://www.reuters.com/markets/gold',
    snippet: 'Gold held firm on Wednesday.',
    source: 'reuters.com',
    publishedAt: null,
    provider: 'tavily',
    subject: 'gold',
    freshness: 'today',
    sourceTier: 'major',
    corroboratedBy: 1,
    relevant: true,
    ...overrides,
  }
}

function response(overrides: Partial<AnalystResponse> = {}): AnalystResponse {
  return {
    id: 'r',
    intent: 'explain',
    title: 'Gold read',
    summary: 'A summary.',
    sections: [{ heading: 'Evidence', kind: 'fact', body: 'Body.' }],
    confidence: 'Medium',
    generatedAt: new Date(NOW).toISOString(),
    ...overrides,
  }
}

// --- §1 Tool-name suppression -------------------------------------------------

test('RI1 — every evidence-gathering tool is on the suppression list', () => {
  for (const name of ['searchNews', 'searchWeb', 'getMacroContext', 'getTechnicalAnalysis', 'getConfluence', 'getMarketSnapshot']) {
    assert.ok(SUPPRESSED_TOOL_NAMES.includes(name as (typeof SUPPRESSED_TOOL_NAMES)[number]), `${name} must be suppressed`)
  }
})

test('RI2 — containsToolName matches whole words only, never substrings', () => {
  assert.ok(containsToolName('I called getTechnicalAnalysis and it returned data'))
  assert.ok(containsToolName('the searchNews evidence arrived'))
  assert.ok(!containsToolName('the technical analysis of the chart'))
  assert.ok(!containsToolName('search new stories on the web'))
  assert.ok(!containsToolName('getMacroContextual drift')) 
  assert.ok(!containsToolName(''))
})

test('RI3 — firstToolName and toolNamesInText find the offending names', () => {
  assert.equal(firstToolName('searchNews then getMacroContext ran'), 'searchNews')
  assert.equal(firstToolName('plain prose with no names'), null)
  assert.deepEqual(toolNamesInText('getMacroContext and searchNews and getMacroContext'), ['searchNews', 'getMacroContext'])
})

test('RI4 — natural headings translate tool names into analyst vocabulary', () => {
  assert.equal(naturalHeadingForTool('getTechnicalAnalysis'), 'Technical picture')
  assert.equal(naturalHeadingForTool('getMacroContext'), 'Macro context')
  assert.equal(naturalHeadingForTool('searchNews'), 'News')
  assert.equal(naturalHeadingForTool('searchWeb'), 'Web evidence')
  assert.equal(naturalHeadingForTool('getMarketSnapshot'), 'Market snapshot')
  assert.equal(naturalHeadingForTool('getConfluence'), 'Confluence')
  assert.equal(naturalHeadingForTool('getHistoricalValidation'), 'Historical validation')
  assert.equal(naturalHeadingForTool('getMarketBreadth'), 'Breadth')
  assert.equal(naturalHeadingForTool('not-a-tool'), null)
})

// --- §2 Section hygiene -------------------------------------------------------

test('RI5 — exact duplicate sections are detected and folded, first wins', () => {
  const a = { heading: 'Trend & momentum', kind: 'fact' as const, body: 'same' }
  const b = { heading: 'Trend & momentum', kind: 'fact' as const, body: 'same' }
  const c = { heading: 'Trend & momentum', kind: 'fact' as const, body: 'different' }
  assert.ok(isExactDuplicateSection(a, b))
  assert.ok(!isExactDuplicateSection(a, c))
  assert.ok(!isExactDuplicateSection({ heading: 'A', body: 'x' }, { heading: 'B', body: 'x' }))
  const deduped = dedupeSections([a, b, c])
  assert.equal(deduped.length, 2)
  assert.equal(deduped[0].body, 'same')
  assert.equal(deduped[1].body, 'different')
})

test('RI6 — repeated headings are detected as a repetition signal', () => {
  assert.ok(hasRepeatedHeadings([
    { heading: 'Trend & momentum', body: 'a' },
    { heading: 'Trend & momentum', body: 'b' },
  ]))
  assert.ok(!hasRepeatedHeadings([
    { heading: 'Trend & momentum', body: 'a' },
    { heading: 'Analyst read', body: 'b' },
  ]))
})

test('RI7 — empty sections are dropped, content sections survive', () => {
  const sections = [
    { heading: 'Empty', body: '  ' },
    { heading: 'No bullets', bullets: [] },
    { heading: 'Real', body: 'content' },
    { heading: 'Bullets', bullets: ['one'] },
  ]
  const kept = dropEmptySections(sections)
  assert.deepEqual(kept.map((s) => s.heading), ['Real', 'Bullets'])
})

test('RI8 — repeated caveats across texts are detected, never silently removed', () => {
  const caveat = 'Historical performance never guarantees future results.'
  const repeated = repeatedCaveats([caveat, caveat, 'A different caveat.'])
  assert.deepEqual(repeated, [caveat.toLowerCase()])
  assert.equal(repeatedCaveats(['one', 'two']).length, 0)
})

// --- §3 Conflict detection ----------------------------------------------------

test('RI9 — directional signs map evidence vocabulary to bull/bear/mixed', () => {
  assert.equal(directionalSign('bullish'), 'bull')
  assert.equal(directionalSign('up'), 'bull')
  assert.equal(directionalSign('bearish'), 'bear')
  assert.equal(directionalSign('down'), 'bear')
  assert.equal(directionalSign('mixed'), 'mixed')
  assert.equal(directionalSign('sideways'), 'mixed')
  assert.equal(directionalSign('unknown-thing'), null)
  assert.equal(directionalSign(42), null)
})

test('RI10 — directional signals are extracted per evidence group', () => {
  const technical = directionalGroupOf(result({ data: { trend: { overall: { direction: 'up', strength: 0.8 } } } }))
  assert.deepEqual(technical, { label: 'technical picture', sign: 'bull' })
  const confluence = directionalGroupOf(result({
    metadata: { ...result().metadata, tool: 'getConfluence', source: 'confluence-engine' },
    data: { bias: 'bearish' },
  }))
  assert.deepEqual(confluence, { label: 'confluence', sign: 'bear' })
  const macro = directionalGroupOf(result({
    metadata: { ...result().metadata, tool: 'getMacroContext' },
    data: { macro: [{ changePct: 0.22 }] },
  }))
  assert.deepEqual(macro, { label: 'macro', sign: 'bull' })
})

test('RI11 — unavailable or shapeless results carry no directional signal', () => {
  assert.equal(directionalGroupOf(result({ ok: false })), null)
  assert.equal(directionalGroupOf(result({ metadata: { ...result().metadata, available: false } })), null)
  assert.equal(directionalGroupOf(result({ data: { rsi: 54 } })), null)
})

test('RI12 — opposite evidence surfaces as a conflict, never averaged', () => {
  const conflicts = detectConflicts([
    result({ data: { trend: { overall: { direction: 'up' } } } }),
    result({
      metadata: { ...result().metadata, tool: 'getConfluence', source: 'confluence-engine' },
      data: { bias: 'bearish' },
    }),
  ])
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].between, 'technical picture and confluence')
  assert.ok(conflicts[0].note.includes('split'), 'the split is named honestly')
  assert.ok(!conflicts[0].note.includes('getConfluence'), 'no raw tool name in the conflict note')
})

test('RI13 — agreeing or mixed evidence produces no conflict', () => {
  assert.equal(
    detectConflicts([
      result({ data: { trend: { overall: { direction: 'up' } } } }),
      result({
        metadata: { ...result().metadata, tool: 'getConfluence', source: 'confluence-engine' },
        data: { bias: 'bullish' },
      }),
    ]).length,
    0,
  )
  assert.equal(
    detectConflicts([
      result({ data: { trend: { overall: { direction: 'mixed' } } } }),
      result({
        metadata: { ...result().metadata, tool: 'getConfluence', source: 'confluence-engine' },
        data: { bias: 'bearish' },
      }),
    ]).length,
    0,
    'mixed never counts as a side against either direction',
  )
})

// --- §4 News themes -----------------------------------------------------------

test('RI14 — news items compress into honest theme lines with corroboration', () => {
  const themes = newsThemes([
    newsItem(),
    newsItem({ title: 'Second story', corroboratedBy: 3, freshness: 'breaking' }),
  ], 3)
  assert.equal(themes.length, 2)
  assert.equal(themes[0].outlet, 'reuters.com')
  assert.equal(themes[1].corroboratedBy, 3)
  assert.equal(themes[1].freshness, 'breaking')
})

test('RI15 — theme lines never carry URLs or invented dates', () => {
  const lines = themeLines([newsItem(), newsItem({ title: 'Second', corroboratedBy: 2 })], 3)
  assert.ok(lines[0].includes('reuters.com: Gold steadies'), 'outlet + headline, no URL')
  assert.ok(!lines[0].includes('reuters.com/markets'), 'no raw URL in prose')
  assert.ok(lines[1].includes('reported by 2 outlets'), 'corroboration is surfaced')
  assert.ok(!lines[1].includes('publishedAt'), 'no invented dates')
})

// --- §5 Answer compression ----------------------------------------------------

test('RI16 — the summary opens with the answer from real technical evidence', () => {
  const s = buildAnswerFirstSummary({
    label: 'Nifty 50',
    results: [result({ data: { trend: { overall: { direction: 'up', strength: 0.8 } }, price: { current: 24385, changePercent: 0.4 } } })],
  })
  assert.ok(s.startsWith("Nifty 50's overall trend is up (strength 0.8), trading at 24385 (+0.40% on the day)"), s)
  assert.ok(s.endsWith('based on the available market data.'))
})

test('RI17 — macro levels open the summary with the real level', () => {
  const s = buildAnswerFirstSummary({
    label: 'Gold',
    results: [result({
      metadata: { ...result().metadata, tool: 'getMacroContext' },
      data: { macro: [{ label: 'Gold (spot)', value: '$2,512', changePct: 0.22 }] },
    })],
  })
  assert.equal(s, 'Gold (spot) is at $2,512, +0.22% on the day, based on the available market data.')
})

test('RI18 — a qualitative direction is honest when no numbers exist', () => {
  const s = buildAnswerFirstSummary({
    label: 'Gold',
    results: [result({ data: { momentum: { bias: 'positive' } } })],
  })
  assert.equal(s, 'Gold is currently showing a positive bias, based on the available market data.')
})

test('RI19 — no evidence yields a plain, honest opening, never a guess', () => {
  const s = buildAnswerFirstSummary({ label: 'Bitcoin', results: [] })
  assert.ok(s.includes('Bitcoin'))
  assert.ok(!s.includes('tool') && !s.toLowerCase().includes('gathered in this session'), 'no machinery announcement')
})

test('RI20 — the summary never contains a suppressed tool name', () => {
  const technical = buildAnswerFirstSummary({ label: 'NIFTY 50', results: [result()] })
  assert.ok(!containsToolName(technical))
  const macro = buildAnswerFirstSummary({
    label: 'Gold',
    results: [result({
      metadata: { ...result().metadata, tool: 'getMacroContext' },
      data: { macro: [{ label: 'Gold (spot)', value: '$2,512', changePct: 0.22 }] },
    })],
  })
  assert.ok(!containsToolName(macro))
})

// --- §6 Refinement pass -------------------------------------------------------

test('RI21 — refineResponse renames raw tool-name headings', () => {
  const r = response({
    sections: [
      { heading: 'searchNews', kind: 'fact', body: 'Evidence captured.' },
      { heading: 'getMacroContext', kind: 'fact', body: 'Evidence captured.' },
      { heading: 'Real section', kind: 'inference', body: 'Substance.' },
    ],
  })
  const refined = refineResponse(r)
  assert.deepEqual(
    refined.sections?.map((s) => s.heading),
    ['News', 'Macro context', 'Real section'],
  )
})

test('RI22 — refineResponse folds exact duplicates and keeps distinct content', () => {
  const r = response({
    sections: [
      { heading: 'Trend & momentum', kind: 'fact', body: 'same' },
      { heading: 'Trend & momentum', kind: 'fact', body: 'same' },
      { heading: 'Trend & momentum', kind: 'fact', body: 'different' },
    ],
  })
  const refined = refineResponse(r)
  assert.equal(refined.sections!.length, 2)
  assert.deepEqual(refined.sections!.map((s) => s.body), ['same', 'different'])
})

test('RI23 — refineResponse drops empty sections without touching facts', () => {
  const r = response({
    sections: [
      { heading: 'Empty', kind: 'fact', body: ' ' },
      { heading: 'Substance', kind: 'fact', body: 'Real finding.' },
    ],
  })
  const refined = refineResponse(r)
  assert.deepEqual(refined.sections!.map((s) => s.heading), ['Substance'])
})

test('RI24 — refinement is deterministic and idempotent', () => {
  const r = response({
    sections: [
      { heading: 'getTechnicalAnalysis', kind: 'fact', body: 'Evidence captured.' },
      { heading: 'getTechnicalAnalysis', kind: 'fact', body: 'Evidence captured.' },
    ],
  })
  const once = refineResponse(r)
  const twice = refineResponse(once)
  assert.deepEqual(once.sections, twice.sections)
  assert.deepEqual(once, twice, 'second pass changes nothing')
})

test('RI25 — refinement preserves everything outside sections', () => {
  const r = response({
    sections: [{ heading: 'getMarketSnapshot', kind: 'fact', body: 'Evidence captured.' }],
    findings: [{ kind: 'fact', title: 'getMacroContext', detail: 'provenance is preserved' }],
    recommendations: ['A recommendation.'],
    partial: true,
    sources: [{ title: 't', url: 'https://e.com', snippet: 's', source: 'e.com', publishedAt: null, provider: 'tavily' }],
  })
  const refined = refineResponse(r)
  assert.equal(refined.sections![0].heading, 'Market snapshot')
  assert.equal(refined.findings![0].title, 'getMacroContext', 'findings are not touched by the guard')
  assert.deepEqual(refined.recommendations, ['A recommendation.'])
  assert.equal(refined.partial, true)
  assert.equal(refined.sources!.length, 1)
  assert.equal(refined.title, r.title)
})

test('RI26 — refinement is a no-op on clean responses', () => {
  const r = response({
    sections: [
      { heading: 'What the bullish source says', kind: 'fact', body: 'a' },
      { heading: 'What the bearish source says', kind: 'fact', body: 'b' },
    ],
  })
  const refined = refineResponse(r)
  assert.equal(refined, r, 'identical object returned when nothing needs fixing')
})