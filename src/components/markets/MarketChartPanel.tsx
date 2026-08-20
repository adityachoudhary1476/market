import { useMemo, useState } from 'react'
import { PriceChart } from './PriceChart'
import { ChartTimeframeSelector } from './ChartTimeframeSelector'
import type { MarketIndex, Timeframe } from '@/types'
import { getIndexSeries } from '@/data/marketSeries'
import { formatINR, formatPct, formatSigned, cn } from '@/lib/format'

interface Props {
  indices: MarketIndex[]
  nonce?: number
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' | 'flat' }) {
  const color =
    tone === 'up' ? 'text-gain' : tone === 'down' ? 'text-loss' : 'text-stone-600'
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-widest2 text-stone-400">
        {label}
      </div>
      <div className={cn('mt-0.5 text-xs font-semibold tabular', color)}>{value}</div>
    </div>
  )
}

export function MarketChartPanel({ indices, nonce = 0 }: Props) {
  const [symbolId, setSymbolId] = useState<string>(indices[0]?.id ?? 'nifty-50')
  const [tf, setTf] = useState<Timeframe>('1D')

  const series = useMemo(
    () => getIndexSeries(symbolId, tf),
    // nonce intentionally included so refresh can re-derive (deterministic, but
    // leaves the hook ready for live data later).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbolId, tf, nonce],
  )

  const activeIndex = indices.find((i) => i.id === symbolId) ?? indices[0]
  const tone = series.trend

  return (
    <div className="card-surface overflow-hidden">
      {/* Header: index selector + timeframe */}
      <div className="flex flex-col gap-3 border-b border-obsidian-900/[0.06] p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            {indices.map((idx) => (
              <button
                key={idx.id}
                type="button"
                onClick={() => setSymbolId(idx.id)}
                aria-pressed={idx.id === symbolId}
                className={cn(
                  'rounded-full px-3 py-1 text-[12px] font-semibold transition-colors',
                  idx.id === symbolId
                    ? 'bg-obsidian-800 text-ivory-50'
                    : 'text-stone-600 hover:bg-obsidian-800/[0.06] hover:text-obsidian-900',
                )}
              >
                {idx.symbol}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-3xl font-semibold tabular text-obsidian-900">
              {formatINR(series.current)}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 text-sm font-semibold tabular',
                tone === 'up' ? 'text-gain' : tone === 'down' ? 'text-loss' : 'text-stone-600',
              )}
            >
              {formatSigned(series.change)}
              <span className="text-stone-400">·</span>
              {formatPct(series.changePct)}
            </span>
          </div>
          {activeIndex && (
            <p className="mt-0.5 text-xs text-stone-500">
              {activeIndex.name} · {tf} timeframe · simulated
            </p>
          )}
        </div>
        <ChartTimeframeSelector value={tf} onChange={setTf} />
      </div>

      {/* Chart */}
      <div className="px-2 pt-4 sm:px-4">
        <PriceChart series={series} height={340} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 border-t border-obsidian-900/[0.06] px-5 py-4 sm:grid-cols-6 sm:px-6">
        <Stat label="Open" value={formatINR(series.open)} tone="flat" />
        <Stat label="High" value={formatINR(series.high)} tone="up" />
        <Stat label="Low" value={formatINR(series.low)} tone="down" />
        <Stat label="Prev Close" value={formatINR(series.prevClose)} tone="flat" />
        <Stat label="Change" value={formatSigned(series.change)} tone={tone} />
        <Stat label="% Change" value={formatPct(series.changePct)} tone={tone} />
      </div>
    </div>
  )
}
