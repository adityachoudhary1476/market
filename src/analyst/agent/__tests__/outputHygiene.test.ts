// ---------------------------------------------------------------------------
// Phase 3N.4 — Final output hygiene tests (BUG 3)
//
// Internal/debug markers must NEVER reach user-facing output, no matter which
// path produced the response. The live model can echo icon/label
// concatenations ("svgFact", "svgSources"), "ConfidenceLow", turn identifiers
// and raw JSON fragments; the memory recap once rendered tool names and
// "(turn N)" identifiers. This suite locks in the final hygiene gate:
//   - the sanitizer strips every known marker from every rendered text field;
//   - the gate runs at the ENGINE choke point (hostile model output E2E);
//   - the assertion is made against the FINAL rendered text, exactly what the
//     UI displays.
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AnalystResponse } from '../../types'
import { applyOutputHygiene, naturalToolNote, renderedResponseText, sanitizeUserFacingText } from '../responseIntelligence'
import { createAgentAnalystEngine } from '../agentEngine'
import { createRuleMockProvider } from '../mockProvider'
import { createDefaultAnalystToolRegistry } from '../../tools/registry'
import { createDefaultToolContext } from '../../tools/context'
import { buildAnalystContext } from '../../buildContext'
import { createConversationSession } from '../../conversation/session'
import { toolCall } from '../mockProvider'
import { SUPPRESSED_TOOL_NAMES } from '../responseIntelligence'

const NOW = 1_720_000_000_000
const REGISTRY = createDefaultAnalystToolRegistry()
const TOOL_CTX = createDefaultToolContext(NOW)
const CONTEXT = buildAnalystContext()

/** A response carrying every known internal marker in rendered text fields. */
function hostileResponse(): AnalystResponse {
  return {
    id: 'hostile-1',
    intent: 'ask',
    title: 'Oil svgFact update',
    summary:
      'The move is up — ConfidenceLow — and (turn 2) the data was available=false. getMacroContext said ok:true. svgInference',
    sections: [
      { heading: 'svgSources', kind: 'fact', body: 'raw "metadata": "web-search" [truncated] (turn 3)' },
      { heading: 'Real section', kind: 'fact', body: 'Brent is at $76.84, +0.81% on the day.' },
    ],
    findings: [
      { kind: 'inference', title: 'Read (turn 1)', detail: 'ConfidenceMedium signal from the data' },
      { kind: 'fact', title: 'Level', detail: '$76.84 measured.' },
    ],
    recommendations: ['ask again svgRecommendations'],
    confidence: 'Low',
    generatedAt: new Date().toISOString(),
  }
}

function internalMarkersIn(text: string): string[] {
  const markers: string[] = []
  if (/\bsvg\b/i.test(text)) markers.push('svg')
  if (/ConfidenceLow|ConfidenceHigh|ConfidenceMedium/.test(text)) markers.push('Confidence<level>')
  if (/\bturn\s+\d+\b/i.test(text)) markers.push('turn identifier')
  if (/available\s*[=:]\s*(false|true)/i.test(text)) markers.push('available flag')
  if (/ok\s*[=:]\s*(true|false)/i.test(text)) markers.push('ok flag')
  if (/\[truncated\]/.test(text)) markers.push('truncation marker')
  if (/"metadata"\s*:/.test(text)) markers.push('raw JSON fragment')
  for (const tool of SUPPRESSED_TOOL_NAMES) {
    if (new RegExp(`\\b${tool}\\b`).test(text)) markers.push(tool)
  }
  return markers
}

test('H1 — sanitizeUserFacingText removes every known internal marker from one field', () => {
  const out = sanitizeUserFacingText(
    'svg svgFact svgInference svgRecommendations svgSources ConfidenceLow (turn 4) available=false ok:true [truncated] "metadata": getMacroContext',
  )
  assert.deepEqual(internalMarkersIn(out), [], `markers survived: ${out}`)
  assert.ok(out.includes('Macro context'), 'a suppressed tool name is translated to analyst vocabulary')
})

test('H2 — applyOutputHygiene cleans a hostile response end to end; real content survives', () => {
  const cleaned = applyOutputHygiene(hostileResponse())
  const text = renderedResponseText(cleaned)
  const markers = internalMarkersIn(text)
  assert.deepEqual(markers, [], `internal markers reached the rendered text: ${markers.join(', ')}`)
  assert.ok(text.includes('The move is up'), 'real summary content survives')
  assert.ok(text.includes('Brent is at $76.84, +0.81% on the day.'), 'real section content survives')
  assert.ok(text.includes('Level'), 'real findings survive')
  assert.ok(cleaned.sections?.[0].heading === 'Evidence', 'a heading that was only a marker gets a neutral label')
})

test('H3 — E2E: a hostile model response is scrubbed before it reaches the UI', async () => {
  const hostile = JSON.stringify({
    intent: 'explain',
    title: 'Oil svgFact update',
    summary:
      'The move is up — ConfidenceLow — and (turn 2) the data was available=false. getMacroContext said ok:true. svgInference',
    sections: [
      { heading: 'svgSources', kind: 'fact', body: 'raw "metadata": "web-search" [truncated] (turn 3)' },
      { heading: 'Real section', kind: 'fact', body: 'Brent is at $76.84, +0.81% on the day.' },
    ],
    findings: [{ kind: 'inference', title: 'Read (turn 1)', detail: 'ConfidenceMedium signal' }],
    recommendations: ['ask again svgRecommendations'],
    confidence: 'Low',
  })
  const engine = createAgentAnalystEngine({
    provider: createRuleMockProvider(() => ({ kind: 'final', content: hostile })),
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    conversation: null,
  })
  const r = await engine.generate({ text: 'Why is oil up?', context: CONTEXT })
  const text = renderedResponseText(r)
  const markers = internalMarkersIn(text)
  assert.deepEqual(markers, [], `the LLM path leaked internal markers: ${markers.join(', ')}`)
  assert.ok(text.includes('Brent is at $76.84, +0.81% on the day.'), 'the real evidence still renders')
})

test('H4 — memory notes are natural text, never raw tool JSON', () => {
  const macroNote = naturalToolNote('getMacroContext', {
    macro: [{ id: 'brent', label: 'Brent Crude', value: '$76.84', changePct: 0.81, unit: '$' }],
  })
  assert.ok(macroNote.includes('Brent Crude: $76.84 (+0.81%)'), `macro note: ${macroNote}`)
  assert.ok(!macroNote.includes('{'), `macro note leaked JSON: ${macroNote}`)

  const newsNote = naturalToolNote('searchNews', {
    subject: 'oil',
    items: [
      { title: 'Crude slides on demand fears', url: 'https://x.example/a' },
      { title: 'Brent rebounds', url: 'https://x.example/b' },
    ],
  })
  assert.ok(newsNote.includes('Crude slides on demand fears'), `news note: ${newsNote}`)
  assert.ok(!newsNote.includes('{'), `news note leaked JSON: ${newsNote}`)

  const technicalNote = naturalToolNote('getTechnicalAnalysis', {
    instrument: 'brent',
    timeframe: 'daily',
    price: { current: 76.84, changePercent: 0.81 },
    trend: { overall: { direction: 'up', strength: 0.7 } },
  })
  assert.ok(technicalNote.includes('up trend'), `technical note: ${technicalNote}`)

  const hostileNote = naturalToolNote('getMarketSnapshot', { generatedAt: 'x', depth: [{ a: 1 }, { b: 2 }] })
  assert.ok(!hostileNote.includes('{'), `unknown shape leaked JSON: ${hostileNote}`)
})

test('H5 — E2E: a hostile LLM response is clean in session memory AND in the recap that quotes it', async () => {
  const hostile = JSON.stringify({
    intent: 'explain',
    title: 'Oil svgFact update (turn 2)',
    summary:
      'The move is up — ConfidenceLow — and the data was available=false. getMacroContext said ok:true. svgInference',
    sections: [
      { heading: 'svgSources', kind: 'fact', body: 'raw "metadata": "web-search" [truncated]' },
      { heading: 'Real section', kind: 'fact', body: 'Brent is at $76.84, +0.81% on the day.' },
    ],
    findings: [{ kind: 'inference', title: 'Read (turn 1)', detail: 'ConfidenceMedium signal' }],
    recommendations: ['ask again svgRecommendations'],
    confidence: 'Low',
  })
  // Turn 1: round 1 requests evidence (getMacroContext), round 2 answers with
  // the hostile (valid) JSON — so real evidence lands in session memory. Every
  // later call fails, so the follow-up falls through to the deterministic
  // memory recap — which quotes what was RECORDED, so the stored title/summary
  // must already be clean and the evidence note must be natural text.
  const engine = createAgentAnalystEngine({
    provider: createRuleMockProvider(({ callCount }) => {
      if (callCount <= 1) return { kind: 'tool-calls', calls: [toolCall('getMacroContext', {})] }
      if (callCount === 2) return { kind: 'final', content: hostile }
      return { kind: 'error', errorKind: 'unavailable' }
    }),
    registry: REGISTRY,
    toolContext: TOOL_CTX,
    conversation: createConversationSession(),
  })

  const first = await engine.generate({ text: 'Why is oil up?', context: CONTEXT })
  const firstText = renderedResponseText(first)
  assert.deepEqual(internalMarkersIn(firstText), [], `first response leaked markers: ${internalMarkersIn(firstText).join(', ')}`)

  const recap = await engine.generate({ text: 'What did you say about oil?', context: CONTEXT })
  const recapText = renderedResponseText(recap)
  const markers = internalMarkersIn(recapText)
  assert.deepEqual(markers, [], `recap leaked markers: ${markers.join(', ')}`)
  assert.ok(recap.title.includes('What we know so far'), `expected a memory recap, got: ${recap.title}`)
  assert.ok(!recapText.includes('svgFact'), 'the hostile title marker was never quoted by the recap')
  assert.ok(!recapText.includes('(turn 2)'), 'the hostile turn marker was never quoted by the recap')
  assert.ok(recapText.includes('Macro context'), 'the recorded evidence note still survives in the recap')
})