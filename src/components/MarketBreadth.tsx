import { marketBreadth as breadth } from '@/data/mockMarkets'

export function MarketBreadth() {
  const total = breadth.advancing + breadth.declining + breadth.unchanged
  const aPct = (breadth.advancing / total) * 100
  const dPct = (breadth.declining / total) * 100
  const uPct = (breadth.unchanged / total) * 100

  const rows = [
    { label: 'Advancing', value: breadth.advancing, pct: aPct, color: 'bg-gain', text: 'text-gain' },
    { label: 'Declining', value: breadth.declining, pct: dPct, color: 'bg-loss', text: 'text-loss' },
    { label: 'Unchanged', value: breadth.unchanged, pct: uPct, color: 'bg-stone-300', text: 'text-stone-500' },
  ]

  return (
    <div className="card-surface p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-obsidian-900">
          Market Breadth
        </h3>
        <span className="text-xs text-stone-500">NSE all-cap</span>
      </div>

      {breadth.dataMode && (
        <div className="mt-3">
          <span className="inline-flex items-center rounded-full border border-obsidian-900/10 bg-ivory-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            {breadth.dataMode}
          </span>
        </div>
      )}

      {/* Stacked bar */}
      <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-stone-100">
        <div className="bg-gain transition-all duration-700" style={{ width: `${aPct}%` }} />
        <div className="bg-stone-300 transition-all duration-700" style={{ width: `${uPct}%` }} />
        <div className="bg-loss transition-all duration-700" style={{ width: `${dPct}%` }} />
      </div>

      <ul className="mt-5 space-y-4">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between">
            <span className="flex items-center gap-2.5 text-sm text-stone-700">
              <span className={`h-2.5 w-2.5 rounded-sm ${r.color}`} />
              {r.label}
            </span>
            <span className="flex items-center gap-4">
              <span className="w-12 text-right text-sm tabular font-semibold text-obsidian-900">
                {r.value.toLocaleString('en-IN')}
              </span>
              <span className={`w-12 text-right text-xs tabular ${r.text}`}>
                {r.pct.toFixed(1)}%
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid grid-cols-2 gap-3 border-t border-obsidian-900/[0.07] pt-5">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-stone-400">52-wk Highs</div>
          <div className="mt-1 font-display text-xl font-semibold text-gain tabular">
            {breadth.newHighs}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-stone-400">52-wk Lows</div>
          <div className="mt-1 font-display text-xl font-semibold text-loss tabular">
            {breadth.newLows}
          </div>
        </div>
      </div>
    </div>
  )
}
