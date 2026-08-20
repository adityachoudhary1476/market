import type { MarketInsightData } from '@/data/mockTerminal'
import { IconSpark, IconArrowUpRight } from '@/components/ui/Icon'
import { cn } from '@/lib/format'

export function MarketInsight({ insight }: { insight: MarketInsightData }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-obsidian-900/10 bg-obsidian-900 px-6 py-10 text-ivory-50 shadow-card sm:px-10 sm:py-12">
      <div className="pointer-events-none absolute inset-0 bg-dots opacity-[0.08]" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-gold-500/15 blur-3xl" />

      <div className="relative mx-auto max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-ivory-50/10 bg-ivory-50/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-widest2 text-gold-300">
          <IconSpark size={13} />
          Finova Market Insight
        </span>

        <h2 className="mt-5 font-display text-display-md font-semibold text-ivory-50 text-balance">
          {insight.title}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ivory-50/75 sm:text-lg">
          {insight.body}
        </p>

        {/* Evidence chips: DATA → CONTEXT */}
        <div className="mt-6 flex flex-wrap gap-2">
          {insight.evidence.map((e) => {
            const up = e.trend === 'up'
            return (
              <span
                key={e.id}
                className="inline-flex items-center gap-2 rounded-full border border-ivory-50/10 bg-ivory-50/[0.05] px-3 py-1.5 text-xs"
              >
                <span className="text-ivory-50/60">{e.label}</span>
                <span
                  className={cn(
                    'font-semibold tabular',
                    up ? 'text-green-300' : e.trend === 'down' ? 'text-red-300' : 'text-ivory-50/80',
                  )}
                >
                  {e.value}
                </span>
              </span>
            )
          })}
        </div>

        {/* How to read this: ANALYSIS */}
        <div className="mt-8 rounded-xl border border-ivory-50/10 bg-ivory-50/[0.04] p-5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest2 text-gold-300">
            How to read this
            <IconArrowUpRight size={13} />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ivory-50/75">
            {insight.howToRead}
          </p>
        </div>

        <p className="mt-6 text-[11px] italic text-ivory-50/40">
          {insight.disclaimer}
        </p>
      </div>
    </section>
  )
}
