import { useState } from 'react'
import { CandleChart } from '@/components/ui/CandleChart'
import { IconArrowUpRight, IconTrendUp, IconTrendDown } from '@/components/ui/Icon'
import { featuredStock } from '@/data/mockStocks'
import { mockNews } from '@/data/mockNews'
import { formatPct, cn } from '@/lib/format'

const tabs = ['Overview', 'Technicals', 'Fundamentals', 'News', 'AI Analysis'] as const
type Tab = (typeof tabs)[number]

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-obsidian-900/[0.06] bg-ivory-50/60 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
        {label}
      </div>
      <div className="mt-1 font-display text-lg font-semibold tabular text-obsidian-900">
        {value}
      </div>
      {sub && <div className="text-[11px] text-stone-500">{sub}</div>}
    </div>
  )
}

export function StockPreview() {
  const [active, setActive] = useState<Tab>('Overview')
  const stock = featuredStock
  const up = stock.trend === 'up'
  const relatedNews = mockNews.slice(0, 2)

  return (
    <section id="research" className="relative py-20 sm:py-24 lg:py-28">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-px bg-obsidian-900/[0.06]" />
      </div>
      <div className="container-page">
        <div className="reveal mx-auto max-w-2xl text-center">
          <span className="eyebrow justify-center">Stock Research</span>
          <h2 className="mt-4 font-display text-display-lg font-semibold text-obsidian-900 text-balance">
            Understand companies beyond their price.
          </h2>
          <p className="mt-4 text-base text-stone-600 sm:text-lg">
            Financials, technicals, news and AI context — assembled into one
            calm research view.
          </p>
        </div>

        <div className="reveal mt-12">
          <div className="card-surface overflow-hidden">
            {/* Header */}
            <div className="flex flex-col gap-4 border-b border-obsidian-900/[0.06] p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-obsidian-800 font-display text-sm font-bold text-ivory-50">
                  RIL
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-xl font-semibold text-obsidian-900">
                      {stock.name}
                    </h3>
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      NSE
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">{stock.sector}</p>
                </div>
              </div>

              <div className="flex items-end gap-5 lg:flex-col lg:items-end">
                <div className="font-display text-3xl font-semibold tabular text-obsidian-900">
                  ₹{stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div
                  className={cn(
                    'flex items-center gap-1.5 text-sm font-semibold tabular',
                    up ? 'text-gain' : 'text-loss',
                  )}
                >
                  {up ? <IconTrendUp size={15} /> : <IconTrendDown size={15} />}
                  {formatPct(stock.changePct)}
                  <span className="font-normal text-stone-400">
                    ({up ? '+' : ''}
                    {stock.change.toFixed(2)})
                  </span>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div
              className="flex gap-1 overflow-x-auto border-b border-obsidian-900/[0.06] px-3 sm:px-5"
              role="tablist"
              aria-label="Stock research tabs"
            >
              {tabs.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={active === t}
                  onClick={() => setActive(t)}
                  className={cn(
                    'relative whitespace-nowrap px-3 py-3 text-[13px] font-medium transition-colors',
                    active === t
                      ? 'text-obsidian-900'
                      : 'text-stone-500 hover:text-obsidian-800',
                  )}
                >
                  {t}
                  {active === t && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold-500" />
                  )}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-3">
              {/* Chart */}
              <div className="lg:col-span-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-stone-500">Intraday · 15m candles (demo)</div>
                  <div className="flex gap-1">
                    {['1D', '1W', '1M', '1Y'].map((r, i) => (
                      <span
                        key={r}
                        className={cn(
                          'rounded-md px-2 py-1 text-[11px] font-medium',
                          i === 0
                            ? 'bg-obsidian-800 text-ivory-50'
                            : 'text-stone-500 hover:bg-stone-100',
                        )}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-3">
                  <CandleChart candles={stock.intraday} trend={stock.trend} height={240} />
                </div>

                {/* Mini metrics row */}
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="Market Cap" value={stock.marketCap} />
                  <Metric label="P/E" value={stock.pe.toFixed(1)} sub="TTM" />
                  <Metric label="ROE" value={`${stock.roe}%`} sub="TTM" />
                  <Metric
                    label="Rev. Growth"
                    value={`${stock.revenueGrowth}%`}
                    sub="YoY"
                  />
                </div>
              </div>

              {/* Side panel */}
              <aside className="space-y-4">
                <div className="rounded-xl border border-obsidian-900/[0.07] bg-ivory-50/60 p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
                    AI Snapshot
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-stone-700">
                    Reliance is trading above its short-term averages with
                    above-average volume. Diversified revenue and steady digital
                    growth support the move; watch crude sensitivity.
                  </p>
                  <button
                    type="button"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gold-600 hover:text-gold-700"
                  >
                    Read full analysis
                    <IconArrowUpRight size={13} />
                  </button>
                </div>

                <div className="rounded-xl border border-obsidian-900/[0.07] bg-ivory-50/60 p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
                    Related News
                  </div>
                  <ul className="mt-2 space-y-3">
                    {relatedNews.map((n) => (
                      <li key={n.id} className="border-b border-obsidian-900/[0.06] pb-3 last:border-0 last:pb-0">
                        <div className="flex items-center gap-2 text-[10px] text-stone-400">
                          <span className="font-semibold text-stone-600">{n.source}</span>
                          <span>·</span>
                          <span>{n.time}</span>
                        </div>
                        <p className="mt-1 text-[13px] font-medium leading-snug text-obsidian-900">
                          {n.headline}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-gold-500/20 bg-gold-500/[0.05] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-widest2 text-gold-700">
                    Risk Note
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-stone-700">
                    Data shown is illustrative. Always verify with official
                    disclosures and do your own research.
                  </p>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
