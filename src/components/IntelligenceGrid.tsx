import { IntelligenceCard } from './IntelligenceCard'
import { intelligenceFeatures } from '@/data/mockAI'

export function IntelligenceGrid() {
  return (
    <section className="relative py-20 sm:py-24 lg:py-28">
      <div className="container-page">
        <div className="reveal flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <span className="eyebrow">Market Intelligence</span>
            <h2 className="mt-4 font-display text-display-lg font-semibold text-obsidian-900 text-balance">
              Everything happening around the market.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-stone-600 md:text-right">
            One workspace for price, fundamentals, technicals, news and AI —
            designed to filter signal from noise.
          </p>
        </div>

        <div className="reveal mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {intelligenceFeatures.map((f, i) => (
            <div
              key={f.id}
              style={{ transitionDelay: `${i * 60}ms` }}
              className="h-full"
            >
              <IntelligenceCard feature={f} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
