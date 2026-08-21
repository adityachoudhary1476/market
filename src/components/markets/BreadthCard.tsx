import type { MarketBreadth } from '@/types'
import { formatNumber, cn } from '@/lib/format'

interface Props {
  breadth: MarketBreadth
}

export function BreadthCard({ breadth }: Props) {
  const total = breadth.advancing + breadth.declining + breadth.unchanged || 1
  const a = (breadth.advancing / total) * 100
  const u = (breadth.unchanged / total) * 100
  const d = (breadth.declining / total) * 100
  const ratio = breadth.advancing / Math.max(1, breadth.declining)

  const rows = [
    { label: 'Advancing', value: breadth.advancing, pct: a, color: 'bg-gain', text: 'text-gain' },
    { label: 'Unchanged', value: breadth.unchanged, pct: u, color: 'bg-stone-300', text: 'text-stone-600' },
    { label: 'Declining', value: breadth.declining, pct: d, color: 'bg-loss', text: 'text-loss' },
  ]

  return (
    <div className="flex h-full flex-col">
      {breadth.dataMode && (
        <div className="mb-3">
          <span className="inline-flex items-center rounded-full border border-obsidian-900/10 bg-ivory-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            {breadth.dataMode}
          </span>
        </div>
      )}
      <div className="flex h-3 overflow-hidden rounded-full bg-stone-100">
        <div className="bg-gain transition-all duration-700" style={{ width: `${a}%` }} />
        <div className="bg-stone-300" style={{ width: `${u}%` }} />
        <div className="bg-loss" style={{ width: `${d}%` }} />
      </div>

      <ul className="mt-5 space-y-3">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between">
            <span className="flex items-center gap-2.5 text-sm text-stone-700">
              <span className={cn('h-2.5 w-2.5 rounded-sm', r.color)} />
              {r.label}
            </span>
            <span className="flex items-center gap-4">
              <span className="w-16 text-right text-sm font-semibold tabular text-obsidian-900">
                {formatNumber(r.value)}
              </span>
              <span className={cn('w-12 text-right text-xs tabular', r.text)}>
                {r.pct.toFixed(1)}%
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-obsidian-900/[0.06] pt-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
            Advance / Decline
          </div>
          <div className="mt-1 font-display text-xl font-semibold tabular text-obsidian-900">
            {ratio.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
            52W Highs / Lows
          </div>
          <div className="mt-1 font-display text-xl font-semibold tabular">
            <span className="text-gain">{breadth.newHighs}</span>
            <span className="text-stone-300"> / </span>
            <span className="text-loss">{breadth.newLows}</span>
          </div>
        </div>
      </div>

      <p className="mt-auto pt-4 text-[11px] italic leading-relaxed text-stone-400">
        Market breadth measures how broadly gains or losses are distributed
        across listed stocks.
      </p>
    </div>
  )
}
