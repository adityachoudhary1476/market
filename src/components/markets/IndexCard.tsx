import { Sparkline } from '@/components/ui/Sparkline'
import { IconTrendUp, IconTrendDown, IconMinus } from '@/components/ui/Icon'
import { formatINR, formatPct, formatSigned, cn } from '@/lib/format'
import type { MarketIndex } from '@/types'

interface IndexCardProps {
  index: MarketIndex
  active?: boolean
  onSelect?: (id: string) => void
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-widest2 text-stone-400">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-medium tabular text-stone-700">{value}</div>
    </div>
  )
}

export function IndexCard({ index, active = false, onSelect }: IndexCardProps) {
  const up = index.trend === 'up'
  const flat = index.trend === 'flat'
  const tone = flat ? 'text-stone-500' : up ? 'text-gain' : 'text-loss'
  const chip = up ? 'bg-gain-soft text-gain' : flat ? 'bg-stone-100 text-stone-600' : 'bg-loss-soft text-loss'

  const interactive = Boolean(onSelect)
  const Wrapper = interactive ? 'button' : 'div'

  return (
    <Wrapper
      type={interactive ? 'button' : undefined}
      onClick={interactive ? () => onSelect?.(index.id) : undefined}
      aria-pressed={interactive ? active : undefined}
      className={cn(
        'card-surface group relative w-full overflow-hidden p-5 text-left transition-all duration-300',
        interactive && 'cursor-pointer hover:-translate-y-1 hover:shadow-card',
        active && 'ring-2 ring-gold-500/60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-obsidian-900">{index.symbol}</h3>
            {index.marketState === 'open' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gain-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gain">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-gain" />
                Open
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-stone-500">{index.name}</p>
        </div>
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold tabular', chip)}>
          {up ? <IconTrendUp size={12} /> : flat ? <IconMinus size={12} /> : <IconTrendDown size={12} />}
          {formatPct(index.changePct)}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="font-display text-2xl font-semibold tabular text-obsidian-900">
            {formatINR(index.value)}
          </div>
          <div className={cn('mt-0.5 text-xs font-medium tabular', tone)}>
            {formatSigned(index.change)} <span className="text-stone-400">pts</span>
          </div>
        </div>
        <Sparkline data={index.spark} trend={index.trend} width={96} height={40} filled={false} strokeWidth={1.75} animate={false} />
      </div>

      {(index.dayHigh != null || index.prevClose != null) && (
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-obsidian-900/[0.06] pt-3">
          <Stat label="High" value={formatINR(index.dayHigh ?? 0)} />
          <Stat label="Low" value={formatINR(index.dayLow ?? 0)} />
          <Stat label="Prev Close" value={formatINR(index.prevClose ?? 0)} />
        </dl>
      )}
    </Wrapper>
  )
}
