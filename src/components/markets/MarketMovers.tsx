import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { StockQuote, MoverCategory } from '@/types'
import {
  topGainers,
  topLosers,
  mostActive,
  nearWeekHigh,
  nearWeekLow,
} from '@/data/mockTerminalStocks'
import { formatINR, formatPct, formatCompactIN, formatMarketCap, cn } from '@/lib/format'
import { IconArrowUpRight } from '@/components/ui/Icon'
import { SectionCard } from './SectionCard'

const TABS: { id: MoverCategory; label: string }[] = [
  { id: 'gainers', label: 'Biggest Gainers' },
  { id: 'losers', label: 'Biggest Losers' },
  { id: 'active', label: 'Most Active' },
  { id: 'highs', label: '52-Week Highs' },
  { id: 'lows', label: '52-Week Lows' },
]

function useMovers(cat: MoverCategory): StockQuote[] {
  return useMemo(() => {
    switch (cat) {
      case 'gainers':
        return topGainers(8)
      case 'losers':
        return topLosers(8)
      case 'active':
        return mostActive(8)
      case 'highs':
        return nearWeekHigh(8)
      case 'lows':
        return nearWeekLow(8)
    }
  }, [cat])
}

function distFromHigh(s: StockQuote): number {
  return ((s.week52High - s.price) / s.week52High) * 100
}
function distFromLow(s: StockQuote): number {
  return ((s.price - s.week52Low) / s.week52Low) * 100
}

export function MarketMovers() {
  const [cat, setCat] = useState<MoverCategory>('gainers')
  const rows = useMovers(cat)

  const showHighLow = cat === 'highs' || cat === 'lows'
  const showVolume = cat === 'active'

  return (
    <SectionCard
      title="Market Movers"
      subtitle="The stocks shaping today's session"
      action={
        <div className="hidden sm:flex flex-wrap justify-end gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === cat}
              onClick={() => setCat(t.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                t.id === cat
                  ? 'bg-obsidian-800 text-ivory-50'
                  : 'text-stone-600 hover:bg-obsidian-800/[0.06] hover:text-obsidian-900',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
      bodyClassName="p-0"
    >
      {/* Mobile tab scroller */}
      <div className="flex gap-1 overflow-x-auto border-b border-obsidian-900/[0.06] px-3 py-2 sm:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setCat(t.id)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              t.id === cat ? 'bg-obsidian-800 text-ivory-50' : 'text-stone-600',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="hidden md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
              <th className="px-6 py-3 font-semibold">Stock</th>
              <th className="px-4 py-3 text-right font-semibold">Price</th>
              {showHighLow ? (
                <>
                  <th className="px-4 py-3 text-right font-semibold">
                    {cat === 'highs' ? '52W High' : '52W Low'}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    {cat === 'highs' ? 'Below high' : 'Above low'}
                  </th>
                </>
              ) : (
                <>
                  <th className="px-4 py-3 text-right font-semibold">Change %</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    {showVolume ? 'Volume' : 'Mkt Cap'}
                  </th>
                </>
              )}
              <th className="w-8 pr-6" aria-hidden />
            </tr>
          </thead>
          <tbody className="divide-y divide-obsidian-900/[0.06]">
            {rows.map((s) => {
              const up = s.trend !== 'down'
              return (
                <tr key={s.id} className="group transition-colors hover:bg-ivory-50">
                  <td className="px-6 py-3">
                    <Link to={`/research/${s.symbol}`} className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-obsidian-800/[0.06] text-[10px] font-bold text-obsidian-800">
                        {s.symbol.slice(0, 4)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-obsidian-900">
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
                  {showHighLow ? (
                    <>
                      <td className="px-4 py-3 text-right text-sm tabular text-stone-600">
                        ₹{formatINR(cat === 'highs' ? s.week52High : s.week52Low)}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right text-sm font-semibold tabular',
                          cat === 'highs' ? 'text-gold-700' : 'text-gold-700',
                        )}
                      >
                        {cat === 'highs'
                          ? `${distFromHigh(s).toFixed(1)}%`
                          : `${distFromLow(s).toFixed(1)}%`}
                      </td>
                    </>
                  ) : (
                    <>
                      <td
                        className={cn(
                          'px-4 py-3 text-right text-sm font-semibold tabular',
                          up ? 'text-gain' : 'text-loss',
                        )}
                      >
                        {formatPct(s.changePct)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular text-stone-600">
                        {showVolume ? formatCompactIN(s.volume) : formatMarketCap(s.marketCapCr)}
                      </td>
                    </>
                  )}
                  <td className="pr-6 text-right text-stone-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gold-600">
                    <IconArrowUpRight size={16} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile list */}
      <ul className="divide-y divide-obsidian-900/[0.06] md:hidden">
        {rows.map((s) => {
          const up = s.trend !== 'down'
          return (
            <li key={s.id}>
              <Link
                to={`/research/${s.symbol}`}
                className="flex items-center justify-between gap-3 px-5 py-3.5 active:bg-ivory-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-obsidian-900">
                    {s.name}
                  </span>
                  <span className="block text-[11px] text-stone-500">{s.symbol}</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular text-obsidian-900">
                    ₹{formatINR(s.price)}
                  </span>
                  <span
                    className={cn(
                      'block text-xs font-semibold tabular',
                      up ? 'text-gain' : 'text-loss',
                    )}
                  >
                    {showHighLow
                      ? cat === 'highs'
                        ? `${distFromHigh(s).toFixed(1)}% below`
                        : `${distFromLow(s).toFixed(1)}% above`
                      : formatPct(s.changePct)}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}
