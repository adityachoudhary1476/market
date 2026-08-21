// ---------------------------------------------------------------------------
// Phase 3A — Agent layer: structured-output validation
//
// The model must produce the existing AnalystResponse schema. This module
// validates raw model output defensively: structural violations are rejected
// (never trusted blindly), safe field-level problems are coerced, and invalid
// entries are dropped. The orchestrator retries on rejection and falls back to
// deterministic synthesis when retries are exhausted.
//
// No fragile regex parsing. The validator works on already-parsed JSON values.
// ---------------------------------------------------------------------------

import type { AnalystResponse, Intent, Confidence, FactKind, AnalystAction } from '../types'

const INTENTS: readonly Intent[] = [
  'summary',
  'insights',
  'explain',
  'compare',
  'detect',
  'plan',
  'optimize',
  'next',
  'missing',
  'briefing',
  'weekly',
  'ask',
]

const CONFIDENCES: readonly Confidence[] = ['High', 'Medium', 'Low']
const FACT_KINDS: readonly FactKind[] = ['fact', 'inference', 'recommendation']
const ACTION_KINDS: readonly AnalystAction['kind'][] = [
  'explore',
  'add-watchlist',
  'set-alert',
  'analyze',
  'plan',
  'explain',
]

export interface ValidationResult {
  ok: boolean
  response?: AnalystResponse
  errors: string[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function cleanString(v: unknown, max = 4000): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (!s) return undefined
  return s.length > max ? s.slice(0, max) : s
}

/** Coerce a metric value into a display string. */
function metricValue(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined
  if (isFiniteNumber(v)) return String(v)
  return undefined
}

export function validateStructuredResponse(raw: unknown): ValidationResult {
  const errors: string[] = []

  if (!isRecord(raw)) {
    return { ok: false, errors: ['Response must be a JSON object.'] }
  }

  const title = cleanString(raw.title)
  if (!title) {
    errors.push('Missing required "title" (non-empty string).')
  }

  const rawIntent = raw.intent
  const intent = INTENTS.includes(rawIntent as Intent) ? (rawIntent as Intent) : undefined
  if (!intent) {
    errors.push(`Invalid or missing "intent". Expected one of: ${INTENTS.join(', ')}.`)
  }

  let confidence: Confidence | undefined
  if (raw.confidence !== undefined && raw.confidence !== null) {
    confidence = CONFIDENCES.includes(raw.confidence as Confidence) ? (raw.confidence as Confidence) : undefined
    if (!confidence) errors.push('"confidence" must be High, Medium or Low.')
  }

  // summary
  const answer = cleanString(raw.answer)
  const supportingPoints = Array.isArray(raw.supportingPoints)
    ? raw.supportingPoints.map((p) => cleanString(p)).filter((p): p is string => p !== undefined).slice(0, 3)
    : undefined
  const followUp = cleanString(raw.followUp, 300)
  const summary = cleanString(raw.summary)

  // metrics
  let metrics: AnalystResponse['metrics']
  if (raw.metrics === undefined || raw.metrics === null) {
    metrics = undefined
  } else if (!Array.isArray(raw.metrics)) {
    errors.push('"metrics" must be an array.')
  } else {
    const valid = raw.metrics.filter(isRecord).map((m) => {
      const label = cleanString(m.label)
      const value = metricValue(m.value)
      if (!label || value === undefined) return null
      const trend = m.trend === 'up' || m.trend === 'down' || m.trend === 'flat' ? (m.trend as 'up' | 'down' | 'flat') : undefined
      return {
        label,
        value,
        ...(metricValue(m.delta) !== undefined ? { delta: metricValue(m.delta) as string } : {}),
        ...(trend ? { trend } : {}),
        ...(m.primary === true ? { primary: true as const } : {}),
      }
    })
    const kept = valid.filter((m): m is NonNullable<typeof m> => m !== null)
    if (kept.length > 0) metrics = kept
  }

  // sections
  let sections: AnalystResponse['sections']
  if (raw.sections === undefined || raw.sections === null) {
    sections = undefined
  } else if (!Array.isArray(raw.sections)) {
    errors.push('"sections" must be an array.')
  } else {
    const valid = raw.sections.filter(isRecord).map((s) => {
      const heading = cleanString(s.heading)
      if (!heading) return null
      const kind = FACT_KINDS.includes(s.kind as FactKind) ? (s.kind as FactKind) : undefined
      const body = cleanString(s.body)
      const bullets = Array.isArray(s.bullets)
        ? s.bullets.map((b) => cleanString(b)).filter((b): b is string => b !== undefined)
        : undefined
      if (!body && (!bullets || bullets.length === 0)) {
        // A section must carry at least a body or bullets to be useful.
        if (!body && !bullets) return null
      }
      return {
        heading,
        ...(kind ? { kind } : {}),
        ...(body ? { body } : {}),
        ...(bullets && bullets.length > 0 ? { bullets } : {}),
      }
    })
    const kept = valid.filter((s): s is NonNullable<typeof s> => s !== null)
    if (kept.length > 0) sections = kept
  }

  // findings
  let findings: AnalystResponse['findings']
  if (raw.findings === undefined || raw.findings === null) {
    findings = undefined
  } else if (!Array.isArray(raw.findings)) {
    errors.push('"findings" must be an array.')
  } else {
    const valid = raw.findings.filter(isRecord).map((f) => {
      const kind = FACT_KINDS.includes(f.kind as FactKind) ? (f.kind as FactKind) : undefined
      const fTitle = cleanString(f.title)
      const detail = cleanString(f.detail)
      if (!kind || !fTitle || !detail) return null
      return { kind, title: fTitle, detail, ...(cleanString(f.metric) ? { metric: cleanString(f.metric) as string } : {}) }
    })
    const kept = valid.filter((f): f is NonNullable<typeof f> => f !== null)
    if (kept.length > 0) findings = kept
  }

  // recommendations
  let recommendations: string[] | undefined
  if (raw.recommendations !== undefined && raw.recommendations !== null) {
    if (!Array.isArray(raw.recommendations)) {
      errors.push('"recommendations" must be an array.')
    } else {
      const kept = raw.recommendations.map((r) => cleanString(r)).filter((r): r is string => r !== undefined)
      if (kept.length > 0) recommendations = kept
    }
  }

  // actions
  let actions: AnalystResponse['actions']
  if (raw.actions === undefined || raw.actions === null) {
    actions = undefined
  } else if (!Array.isArray(raw.actions)) {
    errors.push('"actions" must be an array.')
  } else {
    const valid = raw.actions.filter(isRecord).map((a) => {
      const label = cleanString(a.label)
      const kind = ACTION_KINDS.includes(a.kind as AnalystAction['kind']) ? (a.kind as AnalystAction['kind']) : undefined
      if (!label || !kind) return null
      return { label, kind, ...(cleanString(a.to) ? { to: cleanString(a.to) as string } : {}) }
    })
    const kept = valid.filter((a): a is NonNullable<typeof a> => a !== null)
    if (kept.length > 0) actions = kept
  }

  // chart
  let chart: AnalystResponse['chart']
  if (raw.chart !== undefined && raw.chart !== null) {
    if (!isRecord(raw.chart)) {
      errors.push('"chart" must be an object.')
    } else {
      const cTitle = cleanString(raw.chart.title)
      const type = raw.chart.type === 'bar' || raw.chart.type === 'line' ? raw.chart.type : undefined
      const points = Array.isArray(raw.chart.points)
        ? raw.chart.points
            .filter(isRecord)
            .map((p) => ({ label: cleanString(p.label), value: isFiniteNumber(p.value) ? p.value : undefined }))
            .filter((p): p is { label: string; value: number } => Boolean(p.label) && p.value !== undefined)
        : []
      if (cTitle && type && points.length > 0) {
        chart = {
          title: cTitle,
          type,
          ...(cleanString(raw.chart.unit) ? { unit: cleanString(raw.chart.unit) as string } : {}),
          points,
          ...(raw.chart.highlightLast === true ? { highlightLast: true as const } : {}),
        }
      }
    }
  }

  // table
  let table: AnalystResponse['table']
  if (raw.table !== undefined && raw.table !== null) {
    if (!isRecord(raw.table)) {
      errors.push('"table" must be an object.')
    } else {
      const headers = Array.isArray(raw.table.headers)
        ? raw.table.headers.map((h) => cleanString(h)).filter((h): h is string => h !== undefined)
        : []
      const rows = Array.isArray(raw.table.rows)
        ? raw.table.rows
            .filter((r) => Array.isArray(r))
            .map((r) =>
              (r as unknown[]).map((cell) => {
                if (typeof cell === 'string') return cell
                if (isFiniteNumber(cell)) return cell
                return cleanString(cell)
              }).filter((c): c is string | number => c !== undefined),
            )
        : []
      if (headers.length > 0 && rows.length > 0) {
        table = { headers, rows, ...(cleanString(raw.table.caption) ? { caption: cleanString(raw.table.caption) as string } : {}) }
      }
    }
  }

  // plan
  let plan: AnalystResponse['plan']
  if (raw.plan !== undefined && raw.plan !== null) {
    if (!Array.isArray(raw.plan)) {
      errors.push('"plan" must be an array.')
    } else {
      const valid = raw.plan.filter(isRecord).map((p) => {
        const time = cleanString(p.time)
        const pTitle = cleanString(p.title)
        if (!time || !pTitle) return null
        return { time, title: pTitle, ...(cleanString(p.detail) ? { detail: cleanString(p.detail) as string } : {}) }
      })
      const kept = valid.filter((p): p is NonNullable<typeof p> => p !== null)
      if (kept.length > 0) plan = kept
    }
  }

  // followUps
  let followUps: string[] | undefined
  if (raw.followUps !== undefined && raw.followUps !== null) {
    if (!Array.isArray(raw.followUps)) {
      errors.push('"followUps" must be an array.')
    } else {
      const kept = raw.followUps.map((f) => cleanString(f)).filter((f): f is string => f !== undefined)
      if (kept.length > 0) followUps = kept
    }
  }

  // partial
  const partial = raw.partial === true

  // A response with no substance is useless.
  const hasSubstance = Boolean(answer || summary || supportingPoints?.length || sections?.length || findings?.length || recommendations?.length || table || plan || chart)

  if (!title || !intent || errors.length > 0 || !hasSubstance) {
    if (!hasSubstance && errors.length === 0) {
      errors.push('Response has no substance: provide answer or supporting analytical content.')
    }
    return { ok: false, errors }
  }

  const response: AnalystResponse = {
    id: `ai-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`,
    intent,
    title,
    ...(answer ? { answer } : {}),
    ...(supportingPoints && supportingPoints.length > 0 ? { supportingPoints } : {}),
    ...(followUp ? { followUp } : {}),
    ...(summary ? { summary } : {}),
    ...(metrics ? { metrics } : {}),
    ...(sections ? { sections } : {}),
    ...(findings ? { findings } : {}),
    ...(recommendations ? { recommendations } : {}),
    ...(actions ? { actions } : {}),
    ...(chart ? { chart } : {}),
    ...(table ? { table } : {}),
    ...(plan ? { plan } : {}),
    ...(confidence ? { confidence } : {}),
    ...(followUps ? { followUps } : {}),
    ...(partial ? { partial: true } : {}),
    generatedAt: new Date().toISOString(),
  }

  return { ok: true, response, errors: [] }
}