import type {
  AnalystContext,
  AnalystResponse,
  AnalystInsight,
  Intent,
  AnalystAction,
  Confidence,
} from './types'

// ---------------------------------------------------------------------------
// Finova Analyst Engine
//
// A deterministic, evidence-driven local engine. It NEVER invents numbers —
// every metric is read from the AnalystContext. Each response is STRUCTURED
// (metrics / sections / findings / actions / chart / plan / table) so the UI
// renders a rich analysis, not a paragraph.
//
// The `AnalystEngine` interface is the seam for a future LLM: a remote engine
// can return the same AnalystResponse shape (after validation) and the UI and
// context layer need no changes.
// ---------------------------------------------------------------------------

export interface AnalystEngine {
  generate(input: { text: string; context: AnalystContext; history?: AnalystResponse[] }): Promise<AnalystResponse>
  insights(context: AnalystContext): AnalystInsight[]
  suggest(context: AnalystContext): string[]
}

const STAGE_LABELS = [
  'Reviewing market context…',
  'Comparing trends across sectors…',
  'Looking for patterns…',
  'Preparing analysis…',
]

/**
 * Phase 3N — stage-aware loading statuses. The same deterministic default
 * list as before when no hint is given; with an intent/subject hint the
 * statuses describe what the analyst is actually doing, so the UI feels
 * responsive and honest about the work in progress.
 */
export interface LoadingHint {
  /** The structured understanding intent of the pending question. */
  intent?: string
  /** A human-readable subject label (e.g. "NIFTY 50", "Crude Oil (Brent)"). */
  subject?: string
}

const STAGE_BY_INTENT: Record<string, string[]> = {
  explain_move: [
    "Reading the tape for {subject}…",
    'Checking the likely drivers…',
    'Tying it to the evidence…',
  ],
  compare: [
    'Pulling up the comparison…',
    'Scoring each side…',
    'Framing the read…',
  ],
  news: [
    'Scanning recent developments…',
    'Validating sources…',
    'Summarizing the news…',
  ],
  forecast_outlook: [
    'Mapping what the data covers…',
    'Weighing the scenarios…',
    'Separating fact from inference…',
  ],
  technical: [
    `Reading the {subject} structure…`,
    'Cross-checking signals…',
    'Confirming the levels…',
  ],
  impact: [
    'Tracing the knock-on effects…',
    'Checking related sectors…',
    'Framing the implications…',
  ],
  current_market_status: [
    'Checking the session…',
    'Reading breadth and leadership…',
    'Preparing the read…',
  ],
}

export function loadingStages(hint?: LoadingHint): string[] {
  if (!hint) return STAGE_LABELS
  const base = hint.intent && STAGE_BY_INTENT[hint.intent] ? STAGE_BY_INTENT[hint.intent] : STAGE_LABELS
  if (!hint.subject) return base
  return base.map((s) => s.split('{subject}').join(hint.subject!))
}

let counter = 0
function rid(prefix: string) {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}

function confidenceFrom(score: number): Confidence {
  if (score >= 0.75) return 'High'
  if (score >= 0.45) return 'Medium'
  return 'Low'
}

const actions = {
  explore: (to: string, label = 'Open in terminal'): AnalystAction => ({
    label,
    kind: 'explore',
    to,
  }),
  analyze: (to: string, label = 'Analyze'): AnalystAction => ({
    label,
    kind: 'analyze',
    to,
  }),
  watch: (symbol: string): AnalystAction => ({
    label: `Add ${symbol} to watchlist`,
    kind: 'add-watchlist',
    payload: { symbol },
  }),
  alert: (symbol: string): AnalystAction => ({
    label: `Set alert on ${symbol}`,
    kind: 'set-alert',
    payload: { symbol },
  }),
}

// ---------------------------------------------------------------------------
// Intent classification — keyword scoring, transparent and deterministic.
// ---------------------------------------------------------------------------

const INTENT_PATTERNS: Array<{ intent: Intent; test: (q: string) => boolean }> = [
  { intent: 'next', test: (q) => /\b(what should i do next|do now|next action|next step)\b/.test(q) },
  { intent: 'missing', test: (q) => /\bwhat am i missing|what am i overlooking|miss(ing)?\b/.test(q) },
  { intent: 'briefing', test: (q) => /\b(briefing|today'?s? (brief|agenda)|morning|good (morning|afternoon|evening))\b/.test(q) },
  { intent: 'weekly', test: (q) => /\b(weekly (review|report)|this week|week in review)\b/.test(q) },
  { intent: 'plan', test: (q) => /\b(plan|build me a plan|schedule|agenda|tomorrow)\b/.test(q) },
  { intent: 'compare', test: (q) => /\b(compar(e|ison)|versus|vs\.?|this (week|month) vs|relative)\b/.test(q) },
  { intent: 'detect', test: (q) => /\b(anomal|unusual|risk|bottleneck|abnormal|outlier|spike|surge)\b/.test(q) },
  { intent: 'explain', test: (q) => /\b(why|explain|reason|cause|what (caused|drove|is driving))\b/.test(q) },
  { intent: 'optimize', test: (q) => /\b(optimize|improve|how (can|do) i|best way|reduce)\b/.test(q) },
  { intent: 'insights', test: (q) => /\b(what do you notice|noticed|insights?|patterns?|what'?s happening)\b/.test(q) },
]

export function classifyIntent(text: string): Intent {
  const q = text.toLowerCase().trim()
  for (const p of INTENT_PATTERNS) {
    if (p.test(q)) return p.intent
  }
  if (q.length < 3 || /\b(hi|hello|hey)\b/.test(q)) return 'summary'
  return 'ask'
}

// ---------------------------------------------------------------------------
// Helpers that read facts from context
// ---------------------------------------------------------------------------

function topSector(ctx: AnalystContext) {
  return [...ctx.sectors].sort((a, b) => b.changePct - a.changePct)[0]
}
function bottomSector(ctx: AnalystContext) {
  return [...ctx.sectors].sort((a, b) => a.changePct - b.changePct)[0]
}
function topGainer(ctx: AnalystContext) {
  return ctx.gainers[0]
}
function topLoser(ctx: AnalystContext) {
  return ctx.losers[0]
}
function findInstrument(ctx: AnalystContext, q: string) {
  const s = q.toUpperCase().replace(/[^A-Z0-9 ]/g, '')
  const byIndex = ctx.indices.find(
    (i) => i.symbol.includes(s) || i.name.toLowerCase().includes(q.toLowerCase()),
  )
  if (byIndex) return { kind: 'index' as const, item: byIndex }
  const all = [...ctx.gainers, ...ctx.losers, ...ctx.active]
  const byStock = all.find(
    (x) =>
      x.symbol.includes(s.replace(/\s/g, '')) ||
      x.name.toLowerCase().includes(q.toLowerCase()),
  )
  if (byStock) return { kind: 'stock' as const, item: byStock }
  const bySector = ctx.sectors.find(
    (x) => x.name.toLowerCase().includes(q.toLowerCase()) || x.id.includes(q.toLowerCase()),
  )
  if (bySector) return { kind: 'sector' as const, item: bySector }
  return null
}

// ---------------------------------------------------------------------------
// Response builders (one per intent)
// ---------------------------------------------------------------------------

function summaryResponse(ctx: AnalystContext, _q: string): AnalystResponse {
  const lead = topSector(ctx)
  const lag = bottomSector(ctx)
  const g = topGainer(ctx)
  const nifty = ctx.indices.find((i) => i.id === 'nifty-50')!

  return {
    id: rid('sum'),
    intent: 'summary',
    title: 'Market summary',
    summary: `Indian equities are trading ${nifty.trend === 'up' ? 'higher' : nifty.trend === 'down' ? 'lower' : 'mixed'} in a ${ctx.regime.replace('-', ' ')} session, led by ${lead.name}.`,
    metrics: [
      { label: 'NIFTY 50', value: nifty.value.toLocaleString('en-IN'), delta: `${nifty.changePct >= 0 ? '+' : ''}${nifty.changePct.toFixed(2)}%`, trend: nifty.trend, primary: true },
      { label: 'Advance / Decline', value: `${ctx.breadth.advancing.toLocaleString('en-IN')} / ${ctx.breadth.declining.toLocaleString('en-IN')}`, delta: `${ctx.breadth.ratio}×` },
      { label: 'Leading sector', value: lead.name, delta: `${lead.changePct >= 0 ? '+' : ''}${lead.changePct.toFixed(2)}%`, trend: lead.changePct >= 0 ? 'up' : 'down' },
      { label: 'Lagging sector', value: lag.name, delta: `${lag.changePct >= 0 ? '+' : ''}${lag.changePct.toFixed(2)}%`, trend: lag.changePct >= 0 ? 'up' : 'down' },
    ],
    sections: [
      {
        heading: 'What is driving the session',
        kind: 'fact',
        bullets: [
          `${lead.name} is the strongest sector at ${lead.changePct >= 0 ? '+' : ''}${lead.changePct.toFixed(2)}%, with ${lead.advancers} advancers against ${lead.decliners} decliners.`,
          `Market breadth is ${ctx.breadth.advPct}% advancing, an advance/decline ratio of ${ctx.breadth.ratio}×.`,
          g
            ? `${g.name} (${g.symbol}) leads large-cap movers at ${g.changePct >= 0 ? '+' : ''}${g.changePct.toFixed(2)}%.`
            : 'No single large-cap name is dominating the tape.',
        ],
      },
      {
        heading: 'Analyst read',
        kind: 'inference',
        body:
          ctx.regime === 'risk-on'
            ? 'Participation is broad rather than concentrated, which typically supports the move more than a narrow index rally would.'
            : ctx.regime === 'risk-off'
              ? 'Breadth is soft; treat the move cautiously until participation broadens.'
              : 'The tape is mixed — sector selectivity matters more than index direction here.',
      },
    ],
    findings: [
      { kind: 'fact', title: 'Leading sector', detail: `${lead.name} ${lead.changePct >= 0 ? '+' : ''}${lead.changePct.toFixed(2)}%` },
      { kind: 'fact', title: 'Market breadth', detail: `${ctx.breadth.advPct}% advancing · ${ctx.breadth.ratio}× A/D` },
      { kind: 'inference', title: 'Regime', detail: ctx.regime.replace('-', ' ') },
    ],
    actions: [actions.explore('/markets', 'Open the terminal'), actions.analyze('/markets')],
    confidence: confidenceFrom(0.82),
    followUps: [
      'Why is the market moving today?',
      'What am I missing?',
      'Compare sectors',
      'Find unusual activity',
    ],
    generatedAt: ctx.generatedAt,
  }
}

function explainResponse(ctx: AnalystContext, q: string): AnalystResponse {
  const match = findInstrument(ctx, q)
  const lead = topSector(ctx)
  const lag = bottomSector(ctx)
  const vix = ctx.macro.find((m) => m.id === 'indiavix')
  const fiiPositive = true // derived from mockStatus snapshot

  if (match && match.kind === 'index') {
    const idx = match.item
    return {
      id: rid('exp'),
      intent: 'explain',
      title: `Why ${idx.symbol} is moving`,
      summary: `${idx.symbol} is ${idx.trend === 'up' ? 'up' : idx.trend === 'down' ? 'down' : 'flat'} ${Math.abs(idx.changePct).toFixed(2)}% today.`,
      metrics: [
        { label: 'Current', value: idx.value.toLocaleString('en-IN'), delta: `${idx.changePct >= 0 ? '+' : ''}${idx.changePct.toFixed(2)}%`, trend: idx.trend, primary: true },
        { label: 'Prev close', value: idx.prevClose.toLocaleString('en-IN') },
        { label: 'Day high', value: idx.dayHigh.toLocaleString('en-IN') },
        { label: 'Day low', value: idx.dayLow.toLocaleString('en-IN') },
      ],
      sections: [
        {
          heading: 'Likely drivers',
          kind: 'inference',
          bullets: [
            `Financials are the strongest sector (${lead.changePct >= 0 ? '+' : ''}${lead.changePct.toFixed(2)}%), the largest weight in ${idx.symbol}.`,
            fiiPositive ? 'FII flows are positive, supporting large-cap demand.' : 'FII flows are cautious, limiting large-cap upside.',
            vix ? `India VIX is ${vix.value} (${vix.changePct.toFixed(1)}% on the day), indicating ${Number(vix.value) < 15 ? 'subdued' : 'elevated'} volatility.` : '',
          ].filter(Boolean),
        },
        {
          heading: 'Evidence',
          kind: 'fact',
          bullets: [
            `Advance/decline ratio is ${ctx.breadth.ratio}× across the broad market.`,
            `${lead.advancers} of ${lead.advancers + lead.decliners} ${lead.name.toLowerCase()} constituents are advancing.`,
            `${ctx.global.filter((g) => g.trend === 'up').length} of ${ctx.global.length} global indices tracked are higher.`,
          ],
        },
      ],
      actions: [actions.explore('/markets', 'See it in the terminal'), actions.alert(idx.symbol)],
      confidence: confidenceFrom(0.7),
      followUps: ['What am I missing?', 'Which stocks are leading?', 'Compare sectors'],
      generatedAt: ctx.generatedAt,
    }
  }

  // Generic "why is the market moving"
  return {
    id: rid('exp'),
    intent: 'explain',
    title: 'Why the market is moving today',
    summary: `The market is ${ctx.regime === 'risk-on' ? 'bid' : ctx.regime === 'risk-off' ? 'offered' : 'mixed'}, driven primarily by sector rotation and participation.`,
    metrics: [
      { label: 'Leading', value: lead.name, delta: `${lead.changePct >= 0 ? '+' : ''}${lead.changePct.toFixed(2)}%`, trend: lead.changePct >= 0 ? 'up' : 'down', primary: true },
      { label: 'Lagging', value: lag.name, delta: `${lag.changePct >= 0 ? '+' : ''}${lag.changePct.toFixed(2)}%`, trend: lag.changePct >= 0 ? 'up' : 'down' },
      { label: 'Breadth', value: `${ctx.breadth.advPct}% up`, trend: ctx.breadth.advPct >= 50 ? 'up' : 'down' },
      { label: 'A/D ratio', value: `${ctx.breadth.ratio}×` },
    ],
    sections: [
      {
        heading: 'What changed',
        kind: 'fact',
        bullets: [
          `${lead.name} is leading with ${lead.changePct >= 0 ? '+' : ''}${lead.changePct.toFixed(2)}%, while ${lag.name} ${lag.changePct >= 0 ? 'gained' : 'lost'} ${Math.abs(lag.changePct).toFixed(2)}%.`,
          `${ctx.breadth.advancing.toLocaleString('en-IN')} stocks are advancing versus ${ctx.breadth.declining.toLocaleString('en-IN')} declining.`,
        ],
      },
      {
        heading: 'Likely explanation',
        kind: 'inference',
        body:
          ctx.regime === 'risk-on'
            ? 'Gains are broad-based and supported by firm global cues and positive flows. This is a participation-led move rather than a handful of large caps lifting the index.'
            : 'The move is narrow — strength is concentrated in specific sectors while breadth lags, which makes the index more fragile than the headline suggests.',
      },
      {
        heading: 'What to watch',
        kind: 'recommendation',
        bullets: [
          `Whether ${lead.name} holds its gains into the close.`,
          vix ? `India VIX (currently ${vix.value}) — a sharp rise would signal de-risking.` : '',
          'Any reversal in advance/decline ratio below 1.0×.',
        ].filter(Boolean),
      },
    ],
    actions: [actions.explore('/markets'), actions.analyze('/markets')],
    confidence: confidenceFrom(0.68),
    followUps: ['Find unusual activity', 'What am I missing?', 'Which sectors should I watch?'],
    generatedAt: ctx.generatedAt,
  }
}

function detectResponse(ctx: AnalystContext): AnalystResponse {
  const unusual = ctx.active.filter((s) => s.relVolume >= 1.3)
  const vix = ctx.macro.find((m) => m.id === 'indiavix')
  const highFliers = ctx.gainers.filter((g) => g.changePct >= 1.5)

  return {
    id: rid('det'),
    intent: 'detect',
    title: 'Anomaly & risk scan',
    summary: `Scanned ${ctx.gainers.length + ctx.losers.length + ctx.active.length} active names and ${ctx.sectors.length} sectors for unusual behavior.`,
    metrics: [
      { label: 'High-volume names', value: String(unusual.length), trend: unusual.length >= 2 ? 'up' : 'flat', primary: true },
      { label: 'Big movers', value: String(highFliers.length) },
      { label: 'New highs / lows', value: `${ctx.breadth.newHighs} / ${ctx.breadth.newLows}` },
      { label: 'India VIX', value: vix?.value ?? '—', delta: vix ? `${vix.changePct.toFixed(1)}%` : undefined, trend: vix && vix.changePct > 0 ? 'up' : 'down' },
    ],
    sections: [
      {
        heading: 'Unusual volume',
        kind: 'fact',
        bullets:
          unusual.length > 0
            ? unusual.map((s) => `${s.symbol} is trading at ${s.relVolume}× its average volume, ${s.changePct >= 0 ? 'up' : 'down'} ${Math.abs(s.changePct).toFixed(2)}%.`)
            : ['No stocks in the active set are trading above 1.3× average volume.'],
      },
      {
        heading: 'Risks to monitor',
        kind: 'inference',
        bullets: [
          ctx.breadth.newLows > ctx.breadth.newHighs
            ? `New lows (${ctx.breadth.newLows}) exceed new highs (${ctx.breadth.newHighs}) — underlying weakness beneath the index.`
            : `New highs (${ctx.breadth.newHighs}) outnumber new lows (${ctx.breadth.newLows}) — broad participation.`,
          vix && Number(vix.value) > 15
            ? `Volatility is elevated at ${vix.value}; position sizing matters more than usual.`
            : 'Volatility is subdued, which can precede sharper moves on unexpected news.',
        ],
      },
    ],
    chart: {
      title: 'Relative volume — most active',
      type: 'bar',
      unit: '× avg',
      points: ctx.active.slice(0, 6).map((s) => ({ label: s.symbol, value: s.relVolume })),
      highlightLast: false,
    },
    actions: unusual.length
      ? [actions.alert(unusual[0].symbol), actions.explore('/markets')]
      : [actions.explore('/markets')],
    confidence: confidenceFrom(0.74),
    followUps: ['Why is volume surging?', 'What should I do next?', 'Explain the market'],
    generatedAt: ctx.generatedAt,
  }
}

function compareResponse(ctx: AnalystContext): AnalystResponse {
  const sorted = [...ctx.sectors].sort((a, b) => b.changePct - a.changePct)
  const top3 = sorted.slice(0, 3)
  const bot3 = sorted.slice(-3).reverse()

  return {
    id: rid('cmp'),
    intent: 'compare',
    title: 'Sector comparison',
    summary: 'Performance and strength across sectors today.',
    table: {
      headers: ['Sector', 'Change', 'Strength', 'Advancers', 'Decliners'],
      rows: sorted.map((s) => [
        s.name,
        `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`,
        `${s.strength}`,
        s.advancers,
        s.decliners,
      ]),
      caption: 'Sorted by daily performance',
    },
    sections: [
      {
        heading: 'Leading vs lagging',
        kind: 'fact',
        bullets: [
          `Leaders: ${top3.map((s) => `${s.name} (${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%)`).join(', ')}.`,
          `Laggards: ${bot3.map((s) => `${s.name} (${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%)`).join(', ')}.`,
        ],
      },
      {
        heading: 'Analyst conclusion',
        kind: 'inference',
        body: `The spread between best (${top3[0].name}, ${top3[0].changePct.toFixed(2)}%) and worst (${bot3[0].name}, ${bot3[0].changePct.toFixed(2)}%) is ${(top3[0].changePct - bot3[0].changePct).toFixed(2)} percentage points — ${top3[0].changePct - bot3[0].changePct > 1.5 ? 'a wide, selective tape' : 'a relatively unified session'}.`,
      },
    ],
    chart: {
      title: 'Sector performance (%)',
      type: 'bar',
      unit: '%',
      points: sorted.map((s) => ({ label: s.name.split(' ')[0], value: s.changePct })),
    },
    actions: [actions.explore('/markets')],
    confidence: confidenceFrom(0.8),
    followUps: ['Explain the leading sector', 'What am I missing?'],
    generatedAt: ctx.generatedAt,
  }
}

function planResponse(ctx: AnalystContext): AnalystResponse {
  const lead = topSector(ctx)
  const g = topGainer(ctx)
  const now = new Date()
  const t = (h: number, m: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    })

  return {
    id: rid('plan'),
    intent: 'plan',
    title: 'Your market check-in plan',
    summary: 'A focused 25-minute session to understand today’s session without getting lost in noise.',
    plan: [
      {
        time: t(15, 45),
        title: 'Confirm the regime',
        detail: `Check NIFTY trend, breadth (${ctx.breadth.advPct}% advancing) and the A/D ratio (${ctx.breadth.ratio}×).`,
        action: actions.explore('/markets', 'Open terminal'),
      },
      {
        time: t(15, 52),
        title: `Review the leader — ${lead.name}`,
        detail: `Read why ${lead.name} is ${lead.changePct >= 0 ? 'up' : 'down'} ${Math.abs(lead.changePct).toFixed(2)}% and whether participation is broad.`,
        action: actions.analyze(`/markets/sector/${lead.id}`, 'Open sector'),
      },
      {
        time: t(15, 59),
        title: g ? `Check ${g.symbol}` : 'Scan top movers',
        detail: g
          ? `Verify whether ${g.name}’s ${Math.abs(g.changePct).toFixed(2)}% move has volume support.`
          : 'Review the top gainer/loser tables for confirmation.',
        action: g ? actions.alert(g.symbol) : actions.explore('/markets'),
      },
      {
        time: t(16, 5),
        title: 'Run the anomaly scan',
        detail: 'Look for unusual volume and elevated VIX before the close.',
        action: { label: 'Run scan', kind: 'analyze', to: '/analyst' },
      },
      { time: t(16, 10), title: 'Set one alert', detail: 'Pick a single name or level worth monitoring tomorrow.' },
    ],
    actions: [actions.explore('/markets', 'Start in terminal')],
    confidence: confidenceFrom(0.6),
    followUps: ['What should I do next?', 'What am I missing?'],
    generatedAt: ctx.generatedAt,
  }
}

function optimizeResponse(ctx: AnalystContext): AnalystResponse {
  const lag = bottomSector(ctx)
  return {
    id: rid('opt'),
    intent: 'optimize',
    title: 'How to improve your market read',
    summary: 'Three evidence-based adjustments to how you follow the session.',
    sections: [
      {
        heading: 'Recommendations',
        kind: 'recommendation',
        bullets: [
          `Weight breadth over the headline index. At ${ctx.breadth.advPct}% advancing and ${ctx.breadth.ratio}× A/D, participation tells you more than NIFTY alone.`,
          `Don't chase ${lag.name} weakness without a catalyst — it is the laggard at ${lag.changePct.toFixed(2)}%.`,
          'Use one alert per theme rather than alerts on every name; signal beats noise.',
        ],
      },
      {
        heading: 'Why',
        kind: 'inference',
        body: 'The fastest way to lose the thread of a session is to track too many instruments. A compact regime + breadth + one-leader view is more decision-useful than a screen full of ticks.',
      },
    ],
    actions: [actions.explore('/markets'), actions.analyze('/markets')],
    confidence: confidenceFrom(0.66),
    followUps: ['What should I do next?', 'Build me a plan'],
    generatedAt: ctx.generatedAt,
  }
}

function nextResponse(ctx: AnalystContext): AnalystResponse {
  const g = topGainer(ctx)
  const lead = topSector(ctx)
  const vix = ctx.macro.find((m) => m.id === 'indiavix')
  // Choose ONE action — the whole point of this intent.
  const one =
    ctx.breadth.advPct >= 55 && g
      ? {
          title: `Review ${g.name} (${g.symbol})`,
          detail: `It is the strongest large-cap mover at +${g.changePct.toFixed(2)}% in a broad, risk-on session with ${ctx.breadth.advPct}% advancing. Confirming volume would support the move.`,
          eta: '~6 minutes',
          action: actions.alert(g.symbol),
        }
      : vix && Number(vix.value) > 15
        ? {
            title: 'Check volatility exposure',
            detail: `India VIX is elevated at ${vix.value}. Review position sizing before adding risk.`,
            eta: '~4 minutes',
            action: actions.explore('/markets'),
          }
        : {
            title: `Read the ${lead.name} move`,
            detail: `${lead.name} is leading at ${lead.changePct >= 0 ? '+' : ''}${lead.changePct.toFixed(2)}%. Confirm whether it is broad within the sector before acting.`,
            eta: '~5 minutes',
            action: actions.analyze(`/markets/sector/${lead.id}`),
          }

  return {
    id: rid('next'),
    intent: 'next',
    title: 'Do this now',
    summary: one.title,
    metrics: [
      { label: 'Estimated time', value: one.eta, primary: true },
      { label: 'Breadth', value: `${ctx.breadth.advPct}% advancing` },
      { label: 'A/D ratio', value: `${ctx.breadth.ratio}×` },
    ],
    sections: [
      { heading: 'Why this now', kind: 'fact', body: one.detail },
      {
        heading: 'After that',
        kind: 'recommendation',
        bullets: ['Set a single alert at a meaningful level.', 'Re-check breadth near the close.'],
      },
    ],
    actions: [one.action, actions.explore('/markets', 'Open terminal')],
    confidence: confidenceFrom(0.72),
    followUps: ['What am I missing?', 'Find unusual activity', 'Explain the market'],
    generatedAt: ctx.generatedAt,
  }
}

function missingResponse(ctx: AnalystContext): AnalystResponse {
  const lag = bottomSector(ctx)
  const unusual = ctx.active.filter((s) => s.relVolume >= 1.3)
  const vix = ctx.macro.find((m) => m.id === 'indiavix')

  return {
    id: rid('miss'),
    intent: 'missing',
    title: 'What you may be missing',
    summary: 'Three things the headline index isn’t telling you.',
    sections: [
      {
        heading: 'Beneath the surface',
        kind: 'inference',
        bullets: [
          `${lag.name} is ${lag.changePct >= 0 ? 'up' : 'down'} ${Math.abs(lag.changePct).toFixed(2)}% — dispersion under the index.`,
          unusual.length
            ? `${unusual[0].symbol} is trading at ${unusual[0].relVolume}× average volume — quietly active.`
            : 'No extreme volume spikes in the active set.',
          vix && Number(vix.value) < 14
            ? `Volatility is very subdued (${vix.value}); complacency can precede sharp moves.`
            : 'Volatility is within a normal range.',
          `${ctx.breadth.newLows} stocks hit 52-week lows against ${ctx.breadth.newHighs} highs.`,
        ],
      },
      {
        heading: 'Recommended check',
        kind: 'recommendation',
        bullets: ['Open the breadth panel and verify the A/D trend.', 'Scan the most-active table for confirmation.'],
      },
    ],
    actions: [actions.explore('/markets'), actions.analyze('/markets')],
    confidence: confidenceFrom(0.64),
    followUps: ['Explain the market', 'What should I do next?', 'Find anomalies'],
    generatedAt: ctx.generatedAt,
  }
}

function briefingResponse(ctx: AnalystContext): AnalystResponse {
  const nifty = ctx.indices.find((i) => i.id === 'nifty-50')!
  const lead = topSector(ctx)
  const risk = bottomSector(ctx)
  const quick = ctx.gainers.find((g) => Math.abs(g.changePct) < 1)
  const g = topGainer(ctx)

  return {
    id: rid('brief'),
    intent: 'briefing',
    title: 'Today’s briefing',
    summary: 'The five things that matter in this session.',
    sections: [
      {
        heading: '1 · Priority',
        kind: 'fact',
        body: `NIFTY 50 is ${nifty.trend} ${Math.abs(nifty.changePct).toFixed(2)}% at ${nifty.value.toLocaleString('en-IN')} — confirm the trend with breadth.`,
      },
      {
        heading: '2 · Risk',
        kind: 'inference',
        body: `${risk.name} is the laggard at ${risk.changePct.toFixed(2)}%; a continued drag there could cap the index.`,
      },
      {
        heading: '3 · Opportunity',
        kind: 'recommendation',
        body: quick
          ? `${quick.name} is constructive (+${quick.changePct.toFixed(2)}%) without an extreme move — a calmer, higher-conviction read than chasing ${g?.symbol ?? 'the top gainer'}.`
          : 'No low-volatility leadership stands out; wait for a cleaner setup.',
      },
      {
        heading: '4 · Trend',
        kind: 'fact',
        body: `${lead.name} leads at ${lead.changePct >= 0 ? '+' : ''}${lead.changePct.toFixed(2)}%; breadth is ${ctx.breadth.advPct}% advancing (${ctx.breadth.ratio}× A/D).`,
      },
      {
        heading: '5 · Recommendation',
        kind: 'recommendation',
        body: 'Start with “Do this now,” then set one alert. Avoid overtrading a mixed/neutral regime.',
      },
    ],
    actions: [actions.explore('/markets', 'Open terminal'), { label: 'Do this now', kind: 'analyze', to: '/analyst' }],
    confidence: confidenceFrom(0.7),
    followUps: ['What should I do next?', 'What am I missing?', 'Explain the market'],
    generatedAt: ctx.generatedAt,
  }
}

function weeklyResponse(ctx: AnalystContext): AnalystResponse {
  const lead = topSector(ctx)
  const lag = bottomSector(ctx)
  return {
    id: rid('week'),
    intent: 'weekly',
    title: 'Weekly intelligence report',
    summary: 'A structured read of the week’s market behavior (illustrative — based on current session data).',
    metrics: [
      { label: 'NIFTY (week)', value: ctx.indices.find((i) => i.id === 'nifty-50')!.value.toLocaleString('en-IN'), delta: `${ctx.indices.find((i) => i.id === 'nifty-50')!.changePct >= 0 ? '+' : ''}${ctx.indices.find((i) => i.id === 'nifty-50')!.changePct.toFixed(2)}%`, trend: 'up', primary: true },
      { label: 'Best sector', value: lead.name, delta: `${lead.changePct >= 0 ? '+' : ''}${lead.changePct.toFixed(2)}%` },
      { label: 'Worst sector', value: lag.name, delta: `${lag.changePct >= 0 ? '+' : ''}${lag.changePct.toFixed(2)}%` },
      { label: 'Avg breadth', value: `${ctx.breadth.advPct}% up` },
    ],
    sections: [
      { heading: 'Wins', kind: 'fact', bullets: [`${lead.name} led with broad participation (${lead.advancers} advancers).`, `New highs (${ctx.breadth.newHighs}) outpaced new lows (${ctx.breadth.newLows}).`] },
      { heading: 'Problems', kind: 'fact', bullets: [`${lag.name} lagged at ${lag.changePct.toFixed(2)}%.`, 'Dispersion across sectors remained elevated.'] },
      { heading: 'Recurring pattern', kind: 'inference', body: 'Leadership rotated into financials while defensives lagged — a pro-risk, cyclical tilt.' },
      { heading: 'Next week priorities', kind: 'recommendation', bullets: ['Watch whether breadth holds above 55% advancing.', 'Track follow-through in the leading sector.', 'Keep one volatility alert set.'] },
    ],
    actions: [actions.explore('/markets')],
    confidence: confidenceFrom(0.6),
    partial: true,
    followUps: ['Compare sectors', 'What am I missing?', "What's next?"],
    generatedAt: ctx.generatedAt,
  }
}

function askFallback(ctx: AnalystContext, q: string): AnalystResponse {
  const match = findInstrument(ctx, q)
  if (match) {
    // Re-route instrument mentions into an explanation.
    return explainResponse(ctx, match.kind === 'sector' ? match.item.name : match.kind === 'index' ? match.item.symbol : match.item.symbol)
  }
  // Honest fallback — no invented data.
  return {
    id: rid('ask'),
    intent: 'ask',
    title: 'I can help with a few things',
    summary: `I couldn’t map “${q}” to a specific instrument in the current data. Here’s what I can analyze from the market context I have.`,
    sections: [
      {
        heading: 'Try asking about',
        kind: 'recommendation',
        bullets: [
          '“Why is NIFTY moving?” — explain an index or stock',
          '“Compare sectors” — see relative performance',
          '“Find unusual activity” — volume/risk scan',
          '“What should I do next?” — one prioritized action',
          '“What am I missing?” — things beneath the headline',
        ],
      },
    ],
    actions: [actions.explore('/markets', 'Open terminal')],
    confidence: confidenceFrom(0.4),
    followUps: ['Why is the market moving today?', 'Compare sectors', 'Find anomalies'],
    generatedAt: ctx.generatedAt,
  }
}

// ---------------------------------------------------------------------------
// Engine export
// ---------------------------------------------------------------------------

export const localAnalystEngine: AnalystEngine = {
  async generate({ text, context }) {
    const intent = classifyIntent(text)
    // Simulate thoughtful latency — kept short, with staged UI in the component.
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 500))
    switch (intent) {
      case 'summary':
      case 'insights':
        return summaryResponse(context, text)
      case 'explain':
        return explainResponse(context, text)
      case 'detect':
        return detectResponse(context)
      case 'compare':
        return compareResponse(context)
      case 'plan':
        return planResponse(context)
      case 'optimize':
        return optimizeResponse(context)
      case 'next':
        return nextResponse(context)
      case 'missing':
        return missingResponse(context)
      case 'briefing':
        return briefingResponse(context)
      case 'weekly':
        return weeklyResponse(context)
      default:
        return askFallback(context, text)
    }
  },

  insights(ctx: AnalystContext): AnalystInsight[] {
    const out: AnalystInsight[] = []
    const lead = topSector(ctx)
    const lag = bottomSector(ctx)
    const g = topGainer(ctx)
    const l = topLoser(ctx)
    const unusual = ctx.active.find((s) => s.relVolume >= 1.3)
    const vix = ctx.macro.find((m) => m.id === 'indiavix')

    if (ctx.breadth.advPct >= 55) {
      out.push({
        id: 'ins-breadth',
        category: 'positive',
        title: 'Broad market participation',
        detail: `${ctx.breadth.advancing.toLocaleString('en-IN')} stocks are advancing (${ctx.breadth.advPct}%) against ${ctx.breadth.declining.toLocaleString('en-IN')} declining. Gains are not limited to a few names.`,
        metric: `${ctx.breadth.ratio}× A/D`,
        trend: 'up',
        confidence: 'High',
        action: actions.explore('/markets', 'Show me why'),
      })
    }

    if (lead && lead.changePct >= 0.7) {
      out.push({
        id: 'ins-lead',
        category: 'pattern',
        title: `${lead.name} is leading the session`,
        detail: `The sector is ${lead.changePct >= 0 ? 'up' : 'down'} ${Math.abs(lead.changePct).toFixed(2)}% with ${lead.advancers} advancers versus ${lead.decliners} decliners.`,
        metric: `${lead.changePct >= 0 ? '+' : ''}${lead.changePct.toFixed(2)}%`,
        trend: lead.changePct >= 0 ? 'up' : 'down',
        confidence: 'High',
        action: actions.analyze(`/markets/sector/${lead.id}`, 'Analyze this'),
      })
    }

    if (unusual) {
      out.push({
        id: 'ins-vol',
        category: 'attention',
        title: `Unusual volume in ${unusual.symbol}`,
        detail: `${unusual.name} is trading at ${unusual.relVolume}× its 20-day average volume, ${unusual.changePct >= 0 ? 'up' : 'down'} ${Math.abs(unusual.changePct).toFixed(2)}%.`,
        metric: `${unusual.relVolume}× volume`,
        trend: unusual.changePct >= 0 ? 'up' : 'down',
        confidence: 'Medium',
        action: actions.alert(unusual.symbol),
      })
    }

    if (g && g.changePct >= 1.2) {
      out.push({
        id: 'ins-gainer',
        category: 'positive',
        title: `${g.name} is the top large-cap mover`,
        detail: `Up ${g.changePct.toFixed(2)}% on the day. Verify volume before treating it as a trend.`,
        metric: `+${g.changePct.toFixed(2)}%`,
        trend: 'up',
        confidence: 'High',
        action: actions.watch(g.symbol),
      })
    }

    if (lag && lag.changePct <= -0.3) {
      out.push({
        id: 'ins-lag',
        category: 'negative',
        title: `${lag.name} is lagging`,
        detail: `The sector is down ${Math.abs(lag.changePct).toFixed(2)}%, a drag beneath the headline index.`,
        metric: `${lag.changePct.toFixed(2)}%`,
        trend: 'down',
        confidence: 'Medium',
        action: actions.analyze(`/markets/sector/${lag.id}`, 'Show me why'),
      })
    }

    if (vix && Number(vix.value) > 15) {
      out.push({
        id: 'ins-vix',
        category: 'attention',
        title: 'Volatility is elevated',
        detail: `India VIX is at ${vix.value} (${vix.changePct.toFixed(1)}% on the day). Consider smaller position sizes.`,
        metric: vix.value,
        trend: vix.changePct > 0 ? 'up' : 'down',
        confidence: 'High',
        action: actions.explore('/markets', 'Review risk'),
      })
    }

    if (l && out.length < 5) {
      out.push({
        id: 'ins-loser',
        category: 'negative',
        title: `${l.name} is under pressure`,
        detail: `Down ${Math.abs(l.changePct).toFixed(2)}%. Check whether the move is stock-specific or sector-wide.`,
        metric: `${l.changePct.toFixed(2)}%`,
        trend: 'down',
        confidence: 'Medium',
        action: actions.alert(l.symbol),
      })
    }

    return out.slice(0, 5)
  },

  suggest(ctx: AnalystContext): string[] {
    const base = [
      'Why is the market moving today?',
      'What should I do next?',
      'What am I missing?',
      'Compare sectors',
      'Find unusual activity',
      'Give me today’s briefing',
    ]
    // Surface a leader-specific prompt when there is a clear one.
    const lead = topSector(ctx)
    if (lead && lead.changePct >= 0.7) {
      base.unshift(`Why is ${lead.name.toLowerCase()} leading?`)
    }
    return base.slice(0, 6)
  },
}
