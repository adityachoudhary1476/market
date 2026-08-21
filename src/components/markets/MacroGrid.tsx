import type { MacroIndicator } from '@/types'
import { formatPct, cn } from '@/lib/format'
import { IconTrendUp, IconTrendDown, IconMinus } from '@/components/ui/Icon'

interface Props {
  indicators: MacroIndicator[]
}

export function MacroGrid({ indicators }: Props) {
  if (indicators.length === 0) {
    return <p className="py-8 text-center text-sm text-stone-500">Macro data unavailable.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {indicators.map((m) => {
        const effectiveUp = m.invertColor ? m.trend === 'down' : m.trend === 'up'
        const flat = m.trend === 'flat'
        const tone = flat
          ? 'text-stone-500'
          : effectiveUp
            ? 'text-gain'
            : 'text-loss'
        return (
          <div
            key={m.id}
            className="rounded-xl border border-obsidian-900/[0.07] bg-white/70 p-4"
          >
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
                {m.label}
              </div>
              {m.dataMode && (
                <span className="text-[9px] font-medium uppercase tracking-wider text-stone-400">
                  {m.dataMode}
                </span>
              )}
            </div>
            <div className="mt-1.5 font-display text-xl font-semibold tabular text-obsidian-900">
              {m.value}
            </div>
            <div className={cn('mt-1 inline-flex items-center gap-1 text-xs font-semibold tabular', tone)}>
              {flat ? (
                <IconMinus size={13} />
              ) : effectiveUp ? (
                <IconTrendUp size={13} />
              ) : (
                <IconTrendDown size={13} />
              )}
              {m.change != null ? (
                <>
                  {m.change > 0 ? '+' : ''}
                  {m.change}
                  <span className="text-stone-400">·</span>
                </>
              ) : null}
              {formatPct(m.changePct)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
