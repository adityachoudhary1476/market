import { useParams, Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'
import { IconArrowRight, IconResearch } from '@/components/ui/Icon'
import { findStock } from '@/data/mockTerminalStocks'
import { formatINR, formatPct, formatMarketCap, cn } from '@/lib/format'

export default function ResearchSymbol() {
  const { symbol } = useParams<{ symbol: string }>()
  const stock = symbol ? findStock(symbol) : undefined
  const displayName = stock?.name ?? (symbol ? symbol.toUpperCase() : 'Stock')

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 pt-24 pb-16">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-50" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-gold-500/[0.08] blur-3xl" />

      <div className="w-full max-w-2xl text-center">
        <Logo withTagline className="justify-center" />

        <span className="mt-10 inline-flex items-center gap-2 rounded-full border border-obsidian-900/10 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest2 text-stone-500">
          <IconResearch size={13} className="text-gold-600" />
          Stock Research · Phase 2
        </span>

        <h1 className="mt-5 font-display text-display-md font-semibold text-obsidian-900 text-balance">
          {displayName}
        </h1>

        {stock ? (
          <div className="mx-auto mt-6 flex max-w-sm items-center justify-center gap-6 rounded-2xl border border-obsidian-900/[0.07] bg-white/80 px-6 py-5 shadow-soft">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
                Price
              </div>
              <div className="mt-1 font-display text-2xl font-semibold tabular text-obsidian-900">
                ₹{formatINR(stock.price)}
              </div>
              <div
                className={cn(
                  'mt-0.5 text-sm font-semibold tabular',
                  stock.trend === 'up' ? 'text-gain' : 'text-loss',
                )}
              >
                {formatPct(stock.changePct)}
              </div>
            </div>
            <div className="h-12 w-px bg-obsidian-900/10" />
            <div className="text-left">
              <div className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
                Mkt Cap
              </div>
              <div className="mt-1 text-sm font-semibold tabular text-obsidian-900">
                {formatMarketCap(stock.marketCapCr)}
              </div>
              <div className="mt-0.5 text-xs text-stone-500">{stock.sector}</div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-stone-500">
            We couldn&apos;t find a stock with symbol &ldquo;{symbol}&rdquo; in
            the current demo dataset.
          </p>
        )}

        <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-stone-600">
          The full research experience — fundamentals, technicals, ownership,
          news and AI analysis — arrives in Phase 2. The navigation architecture
          is already in place.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button to="/markets" size="lg">
            Back to Markets
            <IconArrowRight size={16} />
          </Button>
          <Link
            to="/"
            className="text-sm font-semibold text-obsidian-900 link-underline"
          >
            Return home
          </Link>
        </div>
      </div>
    </section>
  )
}
