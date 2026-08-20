import { Link } from 'react-router-dom'
import type { AnalystResponse, AnalystAction } from '@/analyst/types'
import type { NewsItem } from '@/analyst/websearch/types'
import { AnalystBarChart } from './AnalystBarChart'
import { IconArrowRight, IconBell, IconBrain, IconCompass, IconNews, IconPlus, IconTarget } from '@/components/ui/Icon'
import { cn } from '@/lib/format'

const FRESHNESS: Record<string, { label: string; cls: string }> = {
  breaking: { label: 'Breaking', cls: 'bg-loss-soft text-loss' },
  today: { label: 'Today', cls: 'bg-gold-500/15 text-gold-700' },
  recent: { label: 'Recent', cls: 'bg-gain-soft text-gain' },
  older: { label: 'Older', cls: 'bg-stone-100 text-stone-600' },
  unknown: { label: 'Date unknown', cls: 'bg-stone-100 text-stone-500' },
}

function isNewsItem(value: unknown): value is NewsItem {
  return typeof value === 'object' && value !== null && 'freshness' in (value as Record<string, unknown>)
}

function ActionButton({ action }: { action: AnalystAction }) {
  const cls = action.kind === 'explore' || action.kind === 'plan'
    ? 'bg-obsidian-800 text-ivory-50 hover:bg-obsidian-900'
    : action.kind === 'analyze'
      ? 'border border-obsidian-900/15 text-obsidian-900 hover:bg-ivory-50'
      : 'border border-gold-500/40 bg-gold-500/[0.06] text-gold-700 hover:bg-gold-500/[0.12]'
  const icon = action.kind === 'add-watchlist' ? <IconPlus size={14} />
    : action.kind === 'set-alert' ? <IconBell size={14} />
    : action.kind === 'plan' ? <IconTarget size={14} />
    : action.kind === 'analyze' ? <IconCompass size={14} />
    : <IconArrowRight size={14} />
  const content = <>{icon}{action.label}</>
  const className = cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all hover:-translate-y-0.5', cls)
  return action.to ? <Link to={action.to} className={className}>{content}</Link> : <button type="button" className={className}>{content}</button>
}

function Metrics({ response }: { response: AnalystResponse }) {
  if (!response.metrics?.length) return null
  return (
    <div className="my-3 flex flex-wrap gap-x-5 gap-y-1.5">
      {response.metrics.map((m, i) => {
        const tone = m.trend === 'up' ? 'text-gain' : m.trend === 'down' ? 'text-loss' : 'text-stone-500'
        return <div key={i} className="flex items-baseline gap-1.5 text-sm">
          <span className="text-xs text-stone-400">{m.label}</span>
          <span className="font-semibold tabular text-obsidian-900">{m.value}</span>
          {m.delta && <span className={cn('text-xs font-semibold tabular', tone)}>{m.delta}</span>}
        </div>
      })}
    </div>
  )
}

function Sources({ sources }: { sources: NonNullable<AnalystResponse['sources']> }) {
  return (
    <details className="mt-5 border-t border-obsidian-900/[0.06] pt-3 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-stone-500 hover:text-obsidian-900">
        <IconNews size={13} /> {sources.length} source{sources.length === 1 ? '' : 's'}
      </summary>
      <ul className="mt-3 space-y-2 pl-5">
        {sources.map((s, i) => {
          const news = isNewsItem(s) ? s : null
          const freshness = news ? FRESHNESS[news.freshness] : null
          return <li key={i} className="leading-relaxed">
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-obsidian-900 underline underline-offset-2 hover:text-gold-700">{s.title}</a>
            <span className="text-stone-500"> — {s.source}</span>
            {freshness && <span className={cn('ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest2', freshness.cls)}>{freshness.label}</span>}
            {news && news.corroboratedBy >= 2 && <span className="ml-2 text-[10px] font-medium text-gain">{news.corroboratedBy} outlets</span>}
          </li>
        })}
      </ul>
    </details>
  )
}

function isDeepResponse(response: AnalystResponse, sectionCount: number) {
  return response.intent === 'briefing' || response.intent === 'weekly' || response.intent === 'plan' || sectionCount > 2 || Boolean(response.table || response.chart || response.plan)
}

/**
 * ChatGPT-style conversational renderer.
 * The model can still return rich structured evidence, but the default visual
 * language is a message: answer first, whitespace between ideas, and details
 * only when they add value. Structured widgets are reserved for genuinely
 * complex analysis.
 */
export function AnalystResponseCard({ response }: { response: AnalystResponse }) {
  const sections = response.sections ?? []
  const deep = isDeepResponse(response, sections.length)
  const singleSection = sections.length === 1

  return (
    <article className="animate-fade-up px-1 py-2 sm:px-2">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-obsidian-800 text-gold-300"><IconBrain size={15} /></span>
        <div className="min-w-0 flex-1">
          {deep && response.title && <h3 className="mb-2 font-display text-base font-semibold text-obsidian-900">{response.title}</h3>}

          {response.summary && <p className="text-[15px] leading-7 text-obsidian-900 sm:text-base">{response.summary}</p>}
          {response.partial && <p className="mt-2 text-[11px] italic text-stone-400">Some live evidence was unavailable, so this is based on the data that was available.</p>}

          <Metrics response={response} />

          {sections.length > 0 && <div className={cn('space-y-4', response.summary ? 'mt-3' : 'mt-1')}>
            {sections.map((section, i) => {
              const showHeading = deep || !singleSection
              return <section key={i}>
                {showHeading && section.heading && <h4 className="mb-1 text-sm font-semibold text-obsidian-900">{section.heading}</h4>}
                {section.body && <p className="text-sm leading-6 text-stone-700">{section.body}</p>}
                {section.bullets?.length ? <ul className="mt-1.5 space-y-1.5">{section.bullets.map((bullet, j) => <li key={j} className="flex gap-2 text-sm leading-6 text-stone-700"><span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-stone-300" /><span>{bullet}</span></li>)}</ul> : null}
              </section>
            })}
          </div>}

          {response.findings?.length ? <div className="mt-3 space-y-1.5">{response.findings.map((f, i) => <p key={i} className="text-sm leading-6 text-stone-700"><span className="font-semibold text-obsidian-900">{f.title}:</span> {f.detail}{f.metric ? <span className="ml-1 font-semibold text-gold-700">{f.metric}</span> : null}</p>)}</div> : null}

          {response.chart && <div className="mt-4"><AnalystBarChart chart={response.chart} /></div>}

          {response.table && <div className="mt-4 overflow-x-auto rounded-xl border border-obsidian-900/[0.07]">
            <table className="w-full border-collapse text-left text-sm">
              <thead><tr className="bg-ivory-50 text-[10px] font-bold uppercase tracking-widest2 text-stone-500">{response.table.headers.map((h, i) => <th key={i} className={cn('px-3 py-2', i > 0 && 'text-right')}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-obsidian-900/[0.05]">{response.table.rows.map((row, i) => <tr key={i} className="tabular-nums">{row.map((cell, j) => <td key={j} className={cn('px-3 py-2.5', j === 0 ? 'font-medium text-obsidian-900' : 'text-right text-stone-700')}>{cell}</td>)}</tr>)}</tbody>
            </table>
            {response.table.caption && <p className="border-t border-obsidian-900/[0.05] px-3 py-2 text-[11px] italic text-stone-500">{response.table.caption}</p>}
          </div>}

          {response.plan?.length ? <ol className="mt-4 space-y-3 border-l border-gold-500/30 pl-4">{response.plan.map((step, i) => <li key={i}>
            <div className="text-[10px] font-bold uppercase tracking-widest2 text-gold-700">{step.time}</div>
            <div className="text-sm font-semibold text-obsidian-900">{step.title}</div>
            {step.detail && <p className="mt-0.5 text-xs leading-5 text-stone-600">{step.detail}</p>}
            {step.action && <div className="mt-2"><ActionButton action={step.action} /></div>}
          </li>)}</ol> : null}

          {response.recommendations?.length ? <div className="mt-3 space-y-1 text-sm leading-6 text-stone-700">{response.recommendations.map((r, i) => <p key={i}><span className="mr-2 text-gold-600">→</span>{r}</p>)}</div> : null}
          {response.actions?.length ? <div className="mt-3 flex flex-wrap gap-2">{response.actions.map((a, i) => <ActionButton key={i} action={a} />)}</div> : null}

          {/* Confidence is useful for deep research, but noisy on ordinary chat. */}
          {deep && response.confidence && <p className="mt-4 text-[11px] text-stone-400">Confidence: <span className="font-medium text-stone-500">{response.confidence}</span></p>}
          {response.sources?.length ? <Sources sources={response.sources} /> : null}
        </div>
      </div>
    </article>
  )
}
