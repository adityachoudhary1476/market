import { Sparkline } from '@/components/ui/Sparkline'
import { IconGlobe } from '@/components/ui/Icon'
import { globalIndices, macroIndicators } from '@/data/mockMarkets'
import { formatPct, cn } from '@/lib/format'
import type { MarketIndex, MacroIndicator } from '@/types'

const regionLabels: Record<MarketIndex['region'], string> = {
  india: 'India',
  us: 'United States',
  asia: 'Asia',
  europe: 'Europe',
  commodity: 'Commodity',
  fx: 'FX',
}

function GlobalRow({ m, index }: { m: MarketIndex; index: number }) {
  const up = m.trend !== 'down'
  return (
    <div
      className="group grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-xl border border-transparent px-4 py-3 transition-all duration-300 hover:border-obsidian-900/[0.08] hover:bg-white/70"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-obsidian-900">{m.symbol}</span>
          <span className="hidden text-[10px] uppercase tracking-wider text-stone-400 sm:inline">
            {regionLabels[m.region]}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-stone-400">{m.name}</div>
      </div>
      <Sparkline
        data={m.spark}
        trend={m.trend}
        width={88}
        height={30}
        filled={false}
        strokeWidth={1.5}
      />
      <div className="text-right">
        <div className="font-display text-sm font-semibold tabular text-obsidian-900">
          {m.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
        </div>
        <div
          className={cn(
            'text-[11px] font-semibold tabular',
            up ? 'text-gain' : 'text-loss',
          )}
        >
          {formatPct(m.changePct)}
        </div>
      </div>
    </div>
  )
}

function MacroCard({ macro }: { macro: MacroIndicator }) {
  const up = macro.trend !== 'down'
  return (
    <div className="rounded-xl border border-obsidian-900/[0.07] bg-white/70 p-4 transition-colors hover:border-obsidian-800/20">
      <div className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
        {macro.label}
      </div>
      <div className="mt-1.5 flex items-end justify-between">
        <div className="font-display text-lg font-semibold tabular text-obsidian-900">
          {macro.value}
        </div>
        <div
          className={cn(
            'text-xs font-semibold tabular',
            up ? 'text-gain' : 'text-loss',
          )}
        >
          {formatPct(macro.changePct)}
        </div>
      </div>
    </div>
  )
}

export function GlobalMarkets() {
  return (
    <section id="global" className="relative py-20 sm:py-24 lg:py-28">
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          {/* Copy */}
          <div className="reveal lg:col-span-4">
            <span className="eyebrow">
              <IconGlobe size={13} className="text-gold-500" />
              Global Markets
            </span>
            <h2 className="mt-4 font-display text-display-md font-semibold text-obsidian-900 text-balance">
              India doesn&apos;t trade in isolation.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-stone-600">
              Track how moves in US equities, Asian markets, currencies and
              commodities ripple through Indian indices — all in one view.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-3">
              {macroIndicators.map((m) => (
                <MacroCard key={m.id} macro={m} />
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="reveal lg:col-span-8">
            <div className="card-surface p-2 sm:p-3">
              <div className="px-3 py-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold text-obsidian-900">
                    World Indices
                  </h3>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-500">
                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-gain" />
                    Live (demo)
                  </span>
                </div>
              </div>
              <div className="divide-y divide-obsidian-900/[0.05]">
                {globalIndices.map((m, i) => (
                  <GlobalRow key={m.id} m={m} index={i} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
