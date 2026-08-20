import { Button } from '@/components/ui/Button'
import { Sparkline } from '@/components/ui/Sparkline'
import { IconArrowRight, IconSpark, IconTrendUp, IconTrendDown } from '@/components/ui/Icon'
import { mockIndices, marketBreadth } from '@/data/mockMarkets'
import { mockSectors } from '@/data/mockSectors'
import { formatPct, cn } from '@/lib/format'
import type { MarketIndex } from '@/types'

function MiniIndex({ m, delay }: { m: MarketIndex; delay: number }) {
  const up = m.trend !== 'down'
  return (
    <div
      className="animate-fade-up rounded-xl border border-obsidian-900/[0.07] bg-white/80 p-3.5 shadow-soft"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          {m.symbol}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 text-[11px] font-semibold tabular',
            up ? 'text-gain' : 'text-loss',
          )}
        >
          {up ? <IconTrendUp size={12} /> : <IconTrendDown size={12} />}
          {formatPct(m.changePct)}
        </span>
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="font-display text-lg font-semibold text-obsidian-900 tabular">
          {m.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </span>
        <Sparkline data={m.spark} trend={m.trend} width={72} height={26} filled={false} strokeWidth={1.5} />
      </div>
    </div>
  )
}

function AIInsight() {
  return (
    <div className="animate-fade-up rounded-xl border border-gold-500/25 bg-gradient-to-br from-obsidian-800 to-obsidian-900 p-4 text-ivory-50 shadow-glow" style={{ animationDelay: '520ms' }}>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gold-500/20 text-gold-300">
          <IconSpark size={14} />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest2 text-ivory-100/70">
          AI Analysis
        </span>
        <span className="ml-auto text-[10px] text-ivory-100/50">just now</span>
      </div>
      <p className="mt-2.5 text-[13px] leading-relaxed text-ivory-100/90">
        Financials are leading broad-based gains, supported by positive FII
        flows and steady global risk sentiment.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { l: 'Banking', v: '+1.2%', up: true },
          { l: 'FII Flow', v: 'Positive', up: true },
          { l: 'VIX', v: '−6.1%', up: false },
        ].map((e) => (
          <div key={e.l} className="rounded-lg bg-ivory-50/[0.06] px-2.5 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-ivory-100/55">{e.l}</div>
            <div className={cn('text-xs font-semibold tabular', e.up ? 'text-green-300' : 'text-ivory-100/80')}>
              {e.v}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectorChips() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {mockSectors.slice(0, 6).map((s) => (
        <span
          key={s.id}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
            s.trend === 'up'
              ? 'border-gain/20 bg-gain-soft/60 text-gain'
              : 'border-loss/20 bg-loss-soft/60 text-loss',
          )}
        >
          {s.name}
          <span className="tabular">{formatPct(s.changePct)}</span>
        </span>
      ))}
    </div>
  )
}

function BreadthBar() {
  const total = marketBreadth.advancing + marketBreadth.declining + marketBreadth.unchanged
  const a = (marketBreadth.advancing / total) * 100
  const d = (marketBreadth.declining / total) * 100
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-stone-500">
        <span>Advancing</span>
        <span className="tabular">{marketBreadth.advancing.toLocaleString('en-IN')}</span>
      </div>
      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-stone-100">
        <div className="bg-gain" style={{ width: `${a}%` }} />
        <div className="bg-stone-300" style={{ width: `${100 - a - d}%` }} />
        <div className="bg-loss" style={{ width: `${d}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-stone-500">
        <span className="text-loss tabular">{marketBreadth.declining.toLocaleString('en-IN')} declining</span>
        <span className="tabular">{marketBreadth.unchanged} unchanged</span>
      </div>
    </div>
  )
}

export function Hero() {
  const nifty = mockIndices.find((m) => m.id === 'nifty-50')!
  const sensex = mockIndices.find((m) => m.id === 'sensex')!
  const bankNifty = mockIndices.find((m) => m.id === 'bank-nifty')!

  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-32 lg:pt-36 lg:pb-24">
      {/* Background treatment: grid + soft wash, no flashy gradients */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid opacity-60" />
        <div className="absolute -top-24 right-0 h-[520px] w-[520px] rounded-full bg-gold-500/[0.07] blur-3xl" />
        <div className="absolute top-40 -left-24 h-[420px] w-[420px] rounded-full bg-obsidian-800/[0.07] blur-3xl" />
      </div>

      <div className="container-page grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
        {/* Copy */}
        <div className="lg:col-span-6 xl:col-span-6">
          <span className="eyebrow animate-fade-up">
            AI-Powered Market Intelligence
          </span>
          <h1 className="mt-5 font-display text-display-xl font-semibold text-obsidian-900 text-balance">
            Understand the market.
            <br />
            <span className="relative italic text-gold-600">
              Don&apos;t just watch it.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-stone-600 sm:text-lg">
            Finova Markets combines live market data, research, news and
            AI-powered analysis to help you understand what&apos;s happening —
            and why.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button to="/markets" size="lg">
              Explore Markets
              <IconArrowRight size={17} />
            </Button>
            <Button to="/analyst" variant="secondary" size="lg">
              <span className="inline-flex items-center gap-2">
                <IconSpark size={16} className="text-gold-500" />
                Meet the AI Analyst
              </span>
            </Button>
          </div>

          <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-obsidian-900/10 pt-8">
            {[
              { k: 'Indices tracked', v: '50+' },
              { k: 'Data points', v: '2,000+' },
              { k: 'News sources', v: '100+' },
            ].map((s) => (
              <div key={s.k}>
                <dt className="font-display text-2xl font-semibold text-obsidian-900 tabular">
                  {s.v}
                </dt>
                <dd className="mt-1 text-xs text-stone-500">{s.k}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Terminal composition */}
        <div className="relative lg:col-span-6 xl:col-span-6">
          <div
            className="relative mx-auto w-full max-w-[560px] animate-fade-up"
            style={{ animationDelay: '200ms' }}
          >
            {/* Window chrome */}
            <div className="card-surface overflow-hidden">
              <div className="flex items-center justify-between border-b border-obsidian-900/[0.06] bg-ivory-50/80 px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-loss/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-ivory-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-gain/70" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
                  Finova Terminal
                </span>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-gain">
                  <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-gain" />
                  Live
                </span>
              </div>

              <div className="space-y-3 p-4 sm:p-5">
                {/* Featured index + chart */}
                <div className="rounded-xl border border-obsidian-900/[0.07] bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                        NIFTY 50
                      </div>
                      <div className="mt-1 font-display text-2xl font-semibold tabular text-obsidian-900">
                        {nifty.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs">
                        <span className="font-semibold tabular text-gain">
                          {formatPct(nifty.changePct)}
                        </span>
                        <span className="text-stone-400 tabular">
                          +{nifty.change.toFixed(2)} pts
                        </span>
                      </div>
                    </div>
                    <Sparkline data={nifty.spark} trend="up" width={132} height={48} strokeWidth={2} />
                  </div>
                  {/* mini volume bars */}
                  <div className="mt-3 flex items-end gap-[3px] opacity-70" aria-hidden>
                    {Array.from({ length: 32 }).map((_, i) => (
                      <span
                        key={i}
                        className="w-1 rounded-sm bg-obsidian-700/30"
                        style={{
                          height: `${6 + Math.abs(Math.sin(i * 0.7)) * 18}px`,
                          opacity: i > 24 ? 0.9 : 0.5,
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Two mini indices */}
                <div className="grid grid-cols-2 gap-3">
                  <MiniIndex m={sensex} delay={320} />
                  <MiniIndex m={bankNifty} delay={400} />
                </div>

                {/* Sectors + breadth */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-obsidian-900/[0.07] bg-white p-3.5">
                    <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                      Sectors
                    </div>
                    <SectorChips />
                  </div>
                  <div className="rounded-xl border border-obsidian-900/[0.07] bg-white p-3.5">
                    <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                      Market Breadth
                    </div>
                    <BreadthBar />
                  </div>
                </div>

                {/* AI insight */}
                <AIInsight />
              </div>
            </div>

            {/* Floating accent card */}
            <div className="absolute -bottom-5 -left-5 hidden rounded-xl border border-obsidian-900/[0.07] bg-white px-4 py-3 shadow-card sm:block">
              <div className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
                News Signal
              </div>
              <div className="mt-1 max-w-[180px] text-xs font-medium text-obsidian-900">
                Financials lead gains as credit outlook improves
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
