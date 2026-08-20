import { Link } from 'react-router-dom'
import type { AnalystInsight } from '@/analyst/types'
import {
  IconWarning,
  IconTrendUp,
  IconTrendDown,
  IconBolt,
  IconRefresh,
  IconArrowRight,
} from '@/components/ui/Icon'
import { cn } from '@/lib/format'

const CATEGORY = {
  attention: { icon: IconWarning, chip: 'bg-loss-soft text-loss', label: 'Needs attention', ring: 'hover:border-loss/40' },
  negative: { icon: IconTrendDown, chip: 'bg-loss-soft text-loss', label: 'Declining', ring: 'hover:border-loss/40' },
  positive: { icon: IconTrendUp, chip: 'bg-gain-soft text-gain', label: 'Positive trend', ring: 'hover:border-gain/40' },
  opportunity: { icon: IconBolt, chip: 'bg-gold-500/15 text-gold-700', label: 'Opportunity', ring: 'hover:border-gold-500/40' },
  pattern: { icon: IconRefresh, chip: 'bg-obsidian-800/[0.06] text-obsidian-800', label: 'Pattern', ring: 'hover:border-obsidian-800/30' },
} as const

interface Props {
  insight: AnalystInsight
  onAction: (text: string) => void
}

export function InsightCard({ insight, onAction }: Props) {
  const c = CATEGORY[insight.category]
  const Icon = c.icon

  const actionContent = (
    <>
      {insight.action.label}
      <IconArrowRight size={13} />
    </>
  )

  return (
    <article
      className={cn(
        'group flex h-full flex-col rounded-2xl border border-obsidian-900/[0.08] bg-white/80 p-5 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-card',
        c.ring,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest2', c.chip)}>
          <Icon size={12} />
          {c.label}
        </span>
        {insight.confidence && (
          <span className="text-[10px] font-medium text-stone-400">
            {insight.confidence} confidence
          </span>
        )}
      </div>

      <h3 className="mt-3 font-display text-lg font-semibold leading-snug text-obsidian-900">
        {insight.title}
      </h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-stone-600">{insight.detail}</p>

      {insight.metric && (
        <div className="mt-4 inline-flex items-center gap-2 self-start rounded-lg bg-ivory-50 px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">Signal</span>
          <span className="font-display text-sm font-semibold tabular text-obsidian-900">{insight.metric}</span>
        </div>
      )}

      <div className="mt-4">
        {insight.action.to ? (
          <Link
            to={insight.action.to}
            className="inline-flex items-center gap-1.5 rounded-full border border-obsidian-900/15 px-3.5 py-2 text-xs font-semibold text-obsidian-900 transition-all hover:-translate-y-0.5 hover:border-obsidian-800/40 hover:bg-ivory-50"
          >
            {actionContent}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onAction(`Tell me about: ${insight.title}`)}
            className="inline-flex items-center gap-1.5 rounded-full border border-obsidian-900/15 px-3.5 py-2 text-xs font-semibold text-obsidian-900 transition-all hover:-translate-y-0.5 hover:border-obsidian-800/40 hover:bg-ivory-50"
          >
            {actionContent}
          </button>
        )}
      </div>
    </article>
  )
}
