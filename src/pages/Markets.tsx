import { useMemo } from 'react'
import { TerminalHeader } from '@/components/markets/TerminalHeader'
import { MarketStatusBar } from '@/components/markets/MarketStatusBar'
import { IndexCard } from '@/components/markets/IndexCard'
import { MarketChartPanel } from '@/components/markets/MarketChartPanel'
import { MarketSnapshot } from '@/components/markets/MarketSnapshot'
import { SectorTable } from '@/components/markets/SectorTable'
import { BreadthCard } from '@/components/markets/BreadthCard'
import { StockTable } from '@/components/markets/StockTable'
import { MarketMovers } from '@/components/markets/MarketMovers'
import { GlobalMarketGrid } from '@/components/markets/GlobalMarketGrid'
import { MacroGrid } from '@/components/markets/MacroGrid'
import { MarketInsight } from '@/components/markets/MarketInsight'
import { SectionCard } from '@/components/markets/SectionCard'
import { useMarketIndices } from '@/hooks/useMarketIndices'
import { useReveal } from '@/hooks/useReveal'
import { usePageMeta } from '@/hooks/usePageMeta'
import { marketStatus, marketSnapshot, marketInsight } from '@/data/mockTerminal'
import { marketBreadth } from '@/data/mockMarkets'
import { topGainers, topLosers, mostActive } from '@/data/mockTerminalStocks'
import { globalMarkets } from '@/data/mockGlobalMarkets'
import { terminalMacro } from '@/data/mockMacro'

export default function Markets() {
  useReveal()
  usePageMeta(
    'Finova Markets — Indian Market Intelligence',
    'Track Indian markets, indices, sectors, market breadth, global cues and market intelligence with Finova.',
  )
  const { indices, lastUpdatedLabel, refreshing, refresh, error } = useMarketIndices()

  const gainers = useMemo(() => topGainers(8), [])
  const losers = useMemo(() => topLosers(8), [])
  const active = useMemo(() => mostActive(8), [])

  return (
    <div className="bg-ivory-100 pt-24 sm:pt-28">
      <div className="container-page pb-20 sm:pb-28">
        {/* Header */}
        <TerminalHeader
          marketState="Open"
          lastUpdated={lastUpdatedLabel}
          refreshing={refreshing}
          onRefresh={refresh}
        />

        {/* Session status rail */}
        <div className="reveal mt-6">
          <MarketStatusBar status={marketStatus} />
        </div>

        {/* Major indices */}
        <section aria-labelledby="major-indices" className="reveal mt-8">
          <h2 id="major-indices" className="sr-only">
            Major indices
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {indices.map((idx) => (
              <IndexCard key={idx.id} index={idx} />
            ))}
          </div>
        </section>

        {/* Main chart + snapshot */}
        <section className="reveal mt-6 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <MarketChartPanel indices={indices} nonce={0} />
          </div>
          <MarketSnapshot snapshot={marketSnapshot} />
        </section>

        {/* Sector performance + breadth */}
        <section className="reveal mt-6 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SectorTable />
          </div>
          <SectionCard title="Market Breadth" subtitle="Advance / decline participation">
            <BreadthCard breadth={marketBreadth} />
          </SectionCard>
        </section>

        {/* Top gainers / losers / most active */}
        <section className="reveal mt-6 grid gap-4 xl:grid-cols-3">
          <SectionCard title="Top Gainers" subtitle="Best percentage performers today">
            <StockTable stocks={gainers} variant="gainers" />
          </SectionCard>
          <SectionCard title="Top Losers" subtitle="Worst percentage performers today">
            <StockTable stocks={losers} variant="losers" />
          </SectionCard>
          <SectionCard title="Most Active" subtitle="Highest traded volume today">
            <StockTable stocks={active} variant="active" showRelativeVolume />
          </SectionCard>
        </section>

        {/* Market movers (tabs) */}
        <div className="reveal mt-6">
          <MarketMovers />
        </div>

        {/* Global markets */}
        <section className="reveal mt-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="eyebrow">Global context</span>
              <h2 className="mt-3 font-display text-2xl font-semibold text-obsidian-900">
                Global markets
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-stone-600">
                Global markets provide context for Indian risk sentiment, but do
                not determine domestic market direction on their own.
              </p>
            </div>
          </div>
          <GlobalMarketGrid markets={globalMarkets} />
        </section>

        {/* Macro indicators */}
        <section className="reveal mt-10">
          <div className="mb-4">
            <span className="eyebrow">Macro</span>
            <h2 className="mt-3 font-display text-2xl font-semibold text-obsidian-900">
              Macro indicators
            </h2>
          </div>
          <MacroGrid indicators={terminalMacro} />
        </section>

        {/* Finova market insight */}
        <section className="reveal mt-12">
          <MarketInsight insight={marketInsight} />
        </section>

        {/* Trust line */}
        <p className="mx-auto mt-10 max-w-3xl text-center text-xs leading-relaxed text-stone-400">
          {error ? (
            <>
              Live market data is currently unavailable ({error}). Showing illustrative
              values.
            </>
          ) : (
            <>
              Market data shown is delayed (Yahoo Finance) and refreshes automatically.
              Finova provides market information and analysis for informational and
              educational purposes only. It is not investment advice.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
