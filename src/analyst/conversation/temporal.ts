// ---------------------------------------------------------------------------
// Phase 3D.1 — Conversation & Context Intelligence: temporal references
//
// Normalizes temporal language ("today", "this week", "since Monday", "over
// the last few days") into bounded, deterministic labels driven by the
// injected clock. It NEVER invents dates: weekdays resolve to their relative
// position ("Monday of the current week") and periods stay relative — no
// fabricated absolute calendar dates are emitted.
// ---------------------------------------------------------------------------

import type { ReferenceConfidence, TemporalContext } from './types'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const PERIOD_PATTERNS: Array<{ re: RegExp; label: (m: RegExpMatchArray) => string; conf: ReferenceConfidence }> = [
  { re: /\btoday\b/i, label: () => 'today (the current session)', conf: 'high' },
  { re: /\byesterday\b/i, label: () => 'yesterday (the previous session)', conf: 'high' },
  { re: /\bthis week\b/i, label: () => 'this week', conf: 'high' },
  { re: /\blast week\b/i, label: () => 'last week', conf: 'high' },
  { re: /\bthis month\b/i, label: () => 'this month', conf: 'high' },
  { re: /\blast month\b/i, label: () => 'last month', conf: 'high' },
  { re: /\bthis quarter\b/i, label: () => 'this quarter', conf: 'high' },
  { re: /\blast quarter\b/i, label: () => 'last quarter', conf: 'high' },
  { re: /\bthis year\b/i, label: () => 'this year', conf: 'high' },
  { re: /\blast year\b/i, label: () => 'last year', conf: 'high' },
  { re: /\bover the last (few|two|three|several) (days|weeks|months)\b/i, label: (m) => `the last ${m[1]} ${m[2]}`, conf: 'medium' },
  { re: /\bthe past (few|two|three|several) (days|weeks|months)\b/i, label: (m) => `the past ${m[1]} ${m[2]}`, conf: 'medium' },
  { re: /\b(last|past) (few|two|three|several) (days|weeks|months)\b/i, label: (m) => `the ${m[1]} ${m[2]} ${m[3]}`, conf: 'medium' },
  { re: /\b(lately|recently|in recent days|in recent weeks)\b/i, label: () => 'recently', conf: 'medium' },
  { re: /\b(earlier|previously)\b/i, label: () => 'earlier in the session', conf: 'medium' },
  { re: /\b(currently|right now|as of now|at the moment)\b/i, label: () => 'now (the current moment)', conf: 'high' },
]

const WEEKDAY_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i

const SINCE_RE = /\bsince (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i

/**
 * Detect and normalize a temporal reference in the user's text. Returns null
 * when the text carries no temporal signal. Deterministic given `now`.
 */
export function detectTemporalReference(text: string, now: number): TemporalContext | null {
  if (!text) return null

  for (const { re, label, conf } of PERIOD_PATTERNS) {
    const m = text.match(re)
    if (m) {
      return {
        raw: m[0],
        normalized: label(m),
        kind: 'relative-period',
        confidence: conf,
        turn: 0,
      }
    }
  }

  const since = text.match(SINCE_RE)
  if (since) {
    return {
      raw: since[0],
      normalized: `${capitalize(since[1])} of the current week (relative)`,
      kind: 'day-of-week',
      confidence: 'medium',
      turn: 0,
    }
  }

  const weekday = text.match(WEEKDAY_RE)
  if (weekday) {
    const dayIndex = DAY_NAMES.indexOf(weekday[1].toLowerCase())
    const nowDay = new Date(now).getDay()
    const relative = dayIndex > nowDay ? 'next week' : dayIndex < nowDay ? 'this week' : 'today'
    return {
      raw: weekday[0],
      normalized: `${capitalize(weekday[1])} of ${relative === 'today' ? 'this week' : relative} (relative to the current clock)`,
      kind: 'day-of-week',
      confidence: 'medium',
      turn: 0,
    }
  }

  return null
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}