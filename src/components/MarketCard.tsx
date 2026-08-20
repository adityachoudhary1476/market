import { Sparkline } from '@/components/ui/Sparkline'
import { IconTrendUp, IconTrendDown, IconMinus } from '@/components/ui/Icon'
import { formatPct } from '@/lib/format'
import { cn } from '@/lib/format'
import type { MarketIndex } from '@/types'

interface MarketCardProps {
  market: MarketIndex
  featured?: boolean
}

export function MarketCard({ market, featured = false }: MarketCardProps) {
  const up = market.trend === 'up'
  const flat = market.trend === 'flat'
  const tone = flat ? 'text-stone-500' : up ? 'text-gain' : 'text-loss'
  const soft = up ? 'bg-gain-soft text-gain' : flat ? 'bg-stone-100 text-stone-600' : 'bg-loss-soft text-loss'

  return (
    <article
      className={cn(
        'card-surface group relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-card',
        featured && 'sm:col-span-2 lg:col-span-1',
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-obsidian-900">{market.symbol}</h3>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
                market.marketState === 'open'
                  ? 'bg-gain-soft text-gain'
                  : 'bg-stone-100 text-stone-500',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  market.marketState === 'open' ? 'animate-pulse-dot bg-gain' : 'bg-stone-400',
                )}
              />
              {market.marketState === 'open' ? 'Open' : 'Closed'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-stone-500">{market.exchange}</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold tabular',
            soft,
          )}
        >
          {up ? <IconTrendUp size={12} /> : flat ? <IconMinus size={12} /> : <IconTrendDown size={12} />}
          {formatPct(market.changePct)}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="font-display text-2xl font-semibold tabular text-obsidian-900 sm:text-3xl">
            {market.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div className={cn('mt-1 text-xs tabular font-medium', tone)}>
            {up ? '+' : ''}
            {market.change.toFixed(2)}{' '}
            <span className="text-stone-400">pts today</span>
          </div>
        </div>
        <Sparkline
          data={market.spark}
          trend={market.trend}
          width={featured ? 150 : 104}
          height={featured ? 52 : 40}
          strokeWidth={featured ? 2 : 1.75}
          className="opacity-90"
        />
      </div>
    </article>
  )
}
