import { MarketCard } from './MarketCard'
import { SectorPerformance } from './SectorPerformance'
import { MarketBreadth } from './MarketBreadth'
import { mockIndices } from '@/data/mockMarkets'

export function MarketOverview() {
  const featured = mockIndices.filter((m) =>
    ['nifty-50', 'sensex', 'bank-nifty', 'nifty-it'].includes(m.id),
  )

  return (
    <section id="markets" className="relative py-20 sm:py-24 lg:py-28">
      <div className="container-page">
        <div className="reveal mx-auto max-w-2xl text-center">
          <span className="eyebrow justify-center">Market Overview</span>
          <h2 className="mt-4 font-display text-display-lg font-semibold text-obsidian-900 text-balance">
            The market, at a glance.
          </h2>
          <p className="mt-4 text-base text-stone-600 sm:text-lg">
            See the signals that matter without drowning in noise.
          </p>
        </div>

        {/* Index cards */}
        <div className="reveal mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((m) => (
            <MarketCard key={m.id} market={m} featured={m.id === 'nifty-50'} />
          ))}
        </div>

        {/* Sectors + breadth */}
        <div className="reveal mt-4 grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <SectorPerformance />
          </div>
          <div className="lg:col-span-2">
            <MarketBreadth />
          </div>
        </div>
      </div>
    </section>
  )
}
