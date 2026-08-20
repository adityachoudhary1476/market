import { useParams, Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'
import { IconArrowRight, IconLayers } from '@/components/ui/Icon'
import { findSector } from '@/data/mockTerminalSectors'
import { terminalStocks } from '@/data/mockTerminalStocks'
import { formatPct, cn } from '@/lib/format'

export default function SectorPage() {
  const { sectorId } = useParams<{ sectorId: string }>()
  const sector = sectorId ? findSector(sectorId) : undefined
  const constituents = sector
    ? terminalStocks.filter((s) => s.sector.toLowerCase() === sector.name.toLowerCase())
    : []

  const displayName = sector?.name ?? (sectorId ? sectorId.replace(/-/g, ' ') : 'Sector')

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 pt-24 pb-16">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-50" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-gold-500/[0.08] blur-3xl" />

      <div className="w-full max-w-2xl text-center">
        <Logo withTagline className="justify-center" />

        <span className="mt-10 inline-flex items-center gap-2 rounded-full border border-obsidian-900/10 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest2 text-stone-500">
          <IconLayers size={13} className="text-gold-600" />
          Sector view · Phase 2
        </span>

        <h1 className="mt-5 font-display text-display-md font-semibold text-obsidian-900 text-balance">
          {displayName}
        </h1>

        {sector ? (
          <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-obsidian-900/[0.07] bg-white/80 px-6 py-5 shadow-soft">
            <div className="flex items-center justify-center gap-6">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
                  Today
                </div>
                <div
                  className={cn(
                    'mt-1 font-display text-2xl font-semibold tabular',
                    sector.trend === 'up' ? 'text-gain' : 'text-loss',
                  )}
                >
                  {formatPct(sector.changePct)}
                </div>
              </div>
              <div className="h-12 w-px bg-obsidian-900/10" />
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
                  Breadth
                </div>
                <div className="mt-1 text-sm font-semibold tabular text-obsidian-900">
                  {sector.advancers}A · {sector.decliners}D
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-stone-500">
            We couldn&apos;t find that sector in the current demo dataset.
          </p>
        )}

        {constituents.length > 0 && (
          <div className="mx-auto mt-6 max-w-md">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
              Example constituents
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {constituents.slice(0, 6).map((s) => (
                <Link
                  key={s.id}
                  to={`/research/${s.symbol}`}
                  className="rounded-full border border-obsidian-900/10 bg-white px-3 py-1.5 text-xs font-semibold text-obsidian-900 transition-colors hover:border-gold-500/40"
                >
                  {s.symbol}
                </Link>
              ))}
            </div>
          </div>
        )}

        <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-stone-600">
          The dedicated sector view — with constituent performance, flows and
          thematic analysis — arrives in Phase 2.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button to="/markets" size="lg">
            Back to Markets
            <IconArrowRight size={16} />
          </Button>
        </div>
      </div>
    </section>
  )
}
