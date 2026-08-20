import { Link } from 'react-router-dom'
import type { AnalystResponse, AnalystAction, FactKind } from '@/analyst/types'
import type { NewsItem } from '@/analyst/websearch/types'
import { AnalystBarChart } from './AnalystBarChart'
import {
  IconArrowRight,
  IconCheck,
  IconBolt,
  IconScale,
  IconBrain,
  IconNews,
  IconPlus,
  IconBell,
  IconTarget,
  IconCompass,
} from '@/components/ui/Icon'
import { cn } from '@/lib/format'

const KIND_STYLES: Record<FactKind, { label: string; icon: typeof IconCheck; tone: string; dot: string }> = {
  fact: { label: 'Fact', icon: IconCheck, tone: 'text-obsidian-800 bg-obsidian-800/[0.06]', dot: 'bg-obsidian-700' },
  inference: { label: 'Inference', icon: IconBrain, tone: 'text-gold-700 bg-gold-500/10', dot: 'bg-gold-500' },
  recommendation: { label: 'Recommendation', icon: IconBolt, tone: 'text-gain bg-gain-soft', dot: 'bg-gain' },
}

function KindTag({ kind }: { kind: FactKind }) {
  const s = KIND_STYLES[kind]
  const Icon = s.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest2', s.tone)}>
      <Icon size={11} />
      {s.label}
    </span>
  )
}

function ActionButton({ action }: { action: AnalystAction }) {
  const cls =
    action.kind === 'explore' || action.kind === 'plan'
      ? 'bg-obsidian-800 text-ivory-50 hover:bg-obsidian-900'
      : action.kind === 'analyze'
        ? 'border border-obsidian-900/15 text-obsidian-900 hover:border-obsidian-800/40 hover:bg-ivory-50'
        : 'border border-gold-500/40 bg-gold-500/[0.06] text-gold-700 hover:bg-gold-500/[0.12]'

  const icon =
    action.kind === 'add-watchlist' ? (
      <IconPlus size={14} />
    ) : action.kind === 'set-alert' ? (
      <IconBell size={14} />
    ) : action.kind === 'plan' ? (
      <IconTarget size={14} />
    ) : action.kind === 'analyze' ? (
      <IconCompass size={14} />
    ) : (
      <IconArrowRight size={14} />
    )

  const content = (
    <>
      {icon}
      {action.label}
    </>
  )

  if (action.to) {
    return (
      <Link to={action.to} className={cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5', cls)}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" className={cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5', cls)}>
      {content}
    </button>
  )
}

function MetricTile({ m }: { m: NonNullable<AnalystResponse['metrics']>[number] }) {
  const tone =
    m.trend === 'up' ? 'text-gain' : m.trend === 'down' ? 'text-loss' : 'text-stone-600'
  return (
    <div className={cn('rounded-xl border p-3', m.primary ? 'border-obsidian-800/15 bg-ivory-50' : 'border-obsidian-900/[0.07] bg-white/60')}>
      <div className="text-[9px] font-bold uppercase tracking-widest2 text-stone-400">{m.label}</div>
      <div className={cn('mt-1 font-display text-lg font-semibold tabular text-obsidian-900', m.primary && 'text-xl')}>{m.value}</div>
      {m.delta && <div className={cn('mt-0.5 text-[11px] font-semibold tabular', tone)}>{m.delta}</div>}
    </div>
  )
}

const FRESHNESS_LABELS: Record<string, { label: string; cls: string }> = {
  breaking: { label: 'Breaking', cls: 'bg-loss-soft text-loss' },
  today: { label: 'Today', cls: 'bg-gold-500/15 text-gold-700' },
  recent: { label: 'Recent', cls: 'bg-gain-soft text-gain' },
  older: { label: 'Older', cls: 'bg-stone-100 text-stone-600' },
  unknown: { label: 'Date unknown', cls: 'bg-stone-100 text-stone-500' },
}

function isNewsItem(s: unknown): s is NewsItem {
  return typeof s === 'object' && s !== null && 'freshness' in (s as Record<string, unknown>)
}

/** Phase 3N.1 — every source the answer actually cites, with news signals. */
function SourceList({ sources }: { sources: NonNullable<AnalystResponse['sources']> }) {
  return (
    <div className="rounded-xl border border-obsidian-900/[0.07] p-4">
      <div className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest2 text-stone-500">
        <IconNews size={13} /> Sources ({sources.length})
      </div>
      <ul className="space-y-2.5">
        {sources.map((s, i) => {
          const news = isNewsItem(s) ? s : null
          const freshness = news ? FRESHNESS_LABELS[news.freshness] : null
          return (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-obsidian-900 underline decoration-obsidian-900/20 underline-offset-2 hover:text-gold-700 hover:decoration-gold-500/50">
                {s.title}
              </a>
              <span className="text-stone-500">— {s.source}</span>
              {news && freshness && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest2', freshness.cls)}>
                  {freshness.label}
                </span>
              )}
              {news && news.corroboratedBy >= 2 && (
                <span className="rounded-full bg-gain-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest2 text-gain">
                  {news.corroboratedBy} outlets
                </span>
              )}
              {s.publishedAt && <span className="tabular text-stone-400">{new Date(s.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function AnalystResponseCard({ response }: { response: AnalystResponse }) {
  return (
    <article className="rounded-2xl border border-obsidian-900/[0.08] bg-white/80 shadow-soft animate-fade-up">
      <div className="flex items-start gap-3 border-b border-obsidian-900/[0.06] p-5 sm:p-6">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-obsidian-800 text-gold-300">
          <IconBrain size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold text-obsidian-900">{response.title}</h3>
          {response.summary && <p className="mt-1 text-sm leading-relaxed text-stone-600">{response.summary}</p>}
          {response.partial && (
            <p className="mt-2 inline-flex items-center gap-1 rounded bg-stone-100 px-2 py-0.5 text-[10px] font-medium italic text-stone-500">
              Based on current session data only
            </p>
          )}
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {/* Metrics */}
        {response.metrics && response.metrics.length > 0 && (
          <div className={cn('grid gap-2.5', response.metrics.length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4')}>
            {response.metrics.map((m, i) => (
              <MetricTile key={i} m={m} />
            ))}
          </div>
        )}

        {/* Sections */}
        {response.sections?.map((sec, i) => {
          const s = sec.kind ? KIND_STYLES[sec.kind] : null
          return (
            <div key={i}>
              <div className="mb-2 flex items-center gap-2">
                {s && <KindTag kind={sec.kind!} />}
                <h4 className="font-display text-sm font-semibold text-obsidian-900">{sec.heading}</h4>
              </div>
              {sec.body && <p className="text-sm leading-relaxed text-stone-700">{sec.body}</p>}
              {sec.bullets && (
                <ul className="mt-2 space-y-1.5">
                  {sec.bullets.map((b, j) => (
                    <li key={j} className="flex gap-2.5 text-sm leading-relaxed text-stone-700">
                      {s ? <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', s.dot)} /> : <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-300" />}
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}

        {/* Findings */}
        {response.findings && response.findings.length > 0 && (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {response.findings.map((f, i) => (
              <div key={i} className="rounded-xl border border-obsidian-900/[0.07] bg-ivory-50/60 p-3">
                <KindTag kind={f.kind} />
                <div className="mt-2 text-sm font-semibold text-obsidian-900">{f.title}</div>
                <div className="text-xs text-stone-600">{f.detail}</div>
                {f.metric && <div className="mt-1 text-xs font-semibold tabular text-gold-700">{f.metric}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        {response.chart && <AnalystBarChart chart={response.chart} />}

        {/* Comparison table */}
        {response.table && (
          <div className="overflow-x-auto rounded-xl border border-obsidian-900/[0.07]">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-ivory-50 text-[10px] font-bold uppercase tracking-widest2 text-stone-500">
                  {response.table.headers.map((h, i) => (
                    <th key={i} className={cn('px-3 py-2 font-bold', i > 0 && 'text-right')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-obsidian-900/[0.05]">
                {response.table.rows.map((row, i) => (
                  <tr key={i} className="tabular-nums">
                    {row.map((cell, j) => (
                      <td key={j} className={cn('px-3 py-2.5', j === 0 ? 'font-medium text-obsidian-900' : 'text-right text-stone-700')}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {response.table.caption && <p className="border-t border-obsidian-900/[0.05] bg-ivory-50/50 px-3 py-2 text-[11px] italic text-stone-500">{response.table.caption}</p>}
          </div>
        )}

        {/* Plan */}
        {response.plan && (
          <ol className="relative space-y-3 border-l-2 border-gold-500/30 pl-5">
            {response.plan.map((step, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[27px] top-1 flex h-5 w-5 items-center justify-center rounded-full bg-obsidian-800 text-[9px] font-bold text-ivory-50">{i + 1}</span>
                <div className="rounded-xl border border-obsidian-900/[0.07] bg-white/70 p-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest2 text-gold-700">{step.time}</span>
                    <span className="text-sm font-semibold text-obsidian-900">{step.title}</span>
                  </div>
                  {step.detail && <p className="mt-1 text-xs leading-relaxed text-stone-600">{step.detail}</p>}
                  {step.action && (
                    <div className="mt-2.5">
                      <ActionButton action={step.action} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        {/* Recommendations summary */}
        {response.recommendations && response.recommendations.length > 0 && (
          <div className="rounded-xl border border-gain/20 bg-gain-soft/50 p-4">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest2 text-gain">
              <IconScale size={13} /> Recommendations
            </div>
            <ul className="space-y-1.5">
              {response.recommendations.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm text-stone-700">
                  <IconArrowRight size={14} className="mt-0.5 shrink-0 text-gain" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Confidence */}
        {response.confidence && (
          <div className="flex items-center gap-2 border-t border-obsidian-900/[0.06] pt-3 text-xs text-stone-500">
            <span className="font-semibold uppercase tracking-widest2 text-[10px]">Confidence</span>
            <span className={cn('rounded-full px-2 py-0.5 font-semibold', response.confidence === 'High' ? 'bg-gain-soft text-gain' : response.confidence === 'Medium' ? 'bg-gold-500/15 text-gold-700' : 'bg-stone-100 text-stone-600')}>
              {response.confidence}
            </span>
            <span className="ml-auto italic">Based on available market data</span>
          </div>
        )}

        {/* Phase 3N.1 — cited web/news evidence */}
        {response.sources && response.sources.length > 0 && <SourceList sources={response.sources} />}

        {/* Actions */}
        {response.actions && response.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-obsidian-900/[0.06] pt-4">
            {response.actions.map((a, i) => (
              <ActionButton key={i} action={a} />
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
