import type { GlobalMarket } from '@/types'
import { Sparkline } from '@/components/ui/Sparkline'
import { formatPct, cn } from '@/lib/format'

interface Props {
  markets: GlobalMarket[]
}

export function GlobalMarketGrid({ markets }: Props) {
  if (markets.length === 0) {
    return <p className="py-8 text-center text-sm text-stone-500">Global markets unavailable.</p>
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {markets.map((m) => {
        const up = m.trend !== 'down'
        return (
          <article
            key={m.id}
            className="rounded-xl border border-obsidian-900/[0.07] bg-white/70 p-4 transition-colors hover:border-obsidian-800/20"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-obsidian-900">{m.name}</h3>
                <p className="truncate text-[11px] text-stone-500">
                  {m.region} · {m.exchange}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                  m.marketState === 'open'
                    ? 'bg-gain-soft text-gain'
                    : 'bg-stone-100 text-stone-500',
                )}
              >
                {m.marketState}
              </span>
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <span className="font-display text-lg font-semibold tabular text-obsidian-900">
                {m.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </span>
              <Sparkline data={m.spark} trend={m.trend} width={72} height={28} filled={false} strokeWidth={1.5} animate={false} />
            </div>
            <div className="mt-2 text-right">
              <span
                className={cn(
                  'text-xs font-semibold tabular',
                  up ? 'text-gain' : 'text-loss',
                )}
              >
                {formatPct(m.changePct)}
              </span>
            </div>
          </article>
        )
      })}
    </div>
  )
}
