import { Link } from 'react-router-dom'
import type { StockQuote } from '@/types'
import { formatINR, formatPct, formatSigned, formatCompactIN, formatMarketCap, cn } from '@/lib/format'
import { IconArrowUpRight, IconTrendUp, IconTrendDown, IconMinus } from '@/components/ui/Icon'

type Variant = 'gainers' | 'losers' | 'active'

interface Props {
  stocks: StockQuote[]
  variant: Variant
  /** Show the relative-volume column (for "most active"). */
  showRelativeVolume?: boolean
  emptyMessage?: string
}

function relVolume(s: StockQuote): number {
  return s.volume / Math.max(1, s.avgVolume)
}

function MobileCard({ s, active }: { s: StockQuote; active?: boolean }) {
  const up = s.trend !== 'down'
  return (
    <Link
      to={`/research/${s.symbol}`}
      className="block rounded-xl border border-obsidian-900/[0.07] bg-white p-4 transition-colors hover:border-gold-500/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-obsidian-900">{s.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-stone-500">
            <span className="font-semibold">{s.symbol}</span>
            <span>·</span>
            <span className="truncate">{s.sector}</span>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-1 text-xs font-semibold tabular',
            up ? 'bg-gain-soft text-gain' : 'bg-loss-soft text-loss',
          )}
        >
          {formatPct(s.changePct)}
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div className="font-display text-lg font-semibold tabular text-obsidian-900">
          ₹{formatINR(s.price)}
        </div>
        <div className="text-right text-[11px] text-stone-500">
          <div className="tabular">Vol {formatCompactIN(s.volume)}</div>
          {active && (
            <div className={cn('font-semibold tabular', up ? 'text-gain' : 'text-loss')}>
              {relVolume(s).toFixed(2)}× avg
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

export function StockTable({
  stocks,
  variant: _variant,
  showRelativeVolume = false,
  emptyMessage = 'No stocks to display.',
}: Props) {
  if (stocks.length === 0) {
    return <p className="py-10 text-center text-sm text-stone-500">{emptyMessage}</p>
  }

  return (
    <div>
      {/* Desktop / tablet table (horizontally scroll-safe internally) */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
              <th className="py-2.5 pr-4 font-semibold">Stock</th>
              <th className="px-4 py-2.5 text-right font-semibold">Price</th>
              <th className="px-4 py-2.5 text-right font-semibold">Change</th>
              <th className="px-4 py-2.5 text-right font-semibold">Change %</th>
              <th className="px-4 py-2.5 text-right font-semibold">Volume</th>
              {showRelativeVolume && (
                <th className="px-4 py-2.5 text-right font-semibold">Rel. Vol</th>
              )}
              <th className="pl-4 py-2.5 text-right font-semibold">Mkt Cap</th>
              <th className="w-8" aria-hidden />
            </tr>
          </thead>
          <tbody className="divide-y divide-obsidian-900/[0.06]">
            {stocks.map((s) => {
              const up = s.trend !== 'down'
              const flat = s.trend === 'flat'
              return (
                <tr key={s.id} className="group transition-colors hover:bg-ivory-50">
                  <td className="py-3 pr-4">
                    <Link
                      to={`/research/${s.symbol}`}
                      className="flex items-center gap-3"
                      aria-label={`View research for ${s.name}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-obsidian-800/[0.06] text-[10px] font-bold text-obsidian-800">
                        {s.symbol.slice(0, 4)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-obsidian-900 group-hover:text-obsidian-800">
                          {s.name}
                        </span>
                        <span className="block text-[11px] text-stone-500">
                          {s.symbol} · {s.sector}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold tabular text-obsidian-900">
                    ₹{formatINR(s.price)}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-3 text-right text-sm font-medium tabular',
                      up ? 'text-gain' : flat ? 'text-stone-500' : 'text-loss',
                    )}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      {up ? <IconTrendUp size={13} /> : flat ? <IconMinus size={13} /> : <IconTrendDown size={13} />}
                      {formatSigned(s.change)}
                    </span>
                  </td>
                  <td
                    className={cn(
                      'px-4 py-3 text-right text-sm font-semibold tabular',
                      up ? 'text-gain' : flat ? 'text-stone-500' : 'text-loss',
                    )}
                  >
                    {formatPct(s.changePct)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular text-stone-600">
                    {formatCompactIN(s.volume)}
                  </td>
                  {showRelativeVolume && (
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          'inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular',
                          relVolume(s) >= 1.3 ? 'bg-gold-500/15 text-gold-700' : 'bg-stone-100 text-stone-600',
                        )}
                      >
                        {relVolume(s).toFixed(2)}×
                      </span>
                    </td>
                  )}
                  <td className="pl-4 py-3 text-right text-sm tabular text-stone-600">
                    {formatMarketCap(s.marketCapCr)}
                  </td>
                  <td className="py-3 text-right text-stone-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gold-600">
                    <IconArrowUpRight size={16} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {stocks.map((s) => (
          <MobileCard key={s.id} s={s} active={showRelativeVolume} />
        ))}
      </div>
    </div>
  )
}
