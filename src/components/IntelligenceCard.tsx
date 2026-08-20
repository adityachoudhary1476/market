import { FeatureIcon } from '@/components/ui/Icon'
import { IconArrowUpRight } from '@/components/ui/Icon'
import { cn } from '@/lib/format'
import type { IntelligenceFeature } from '@/types'

const accents = {
  forest: {
    iconWrap: 'bg-obsidian-800/[0.08] text-obsidian-800',
    bar: 'bg-obsidian-800',
    glow: 'group-hover:shadow-[0_18px_48px_-22px_rgba(18,59,44,0.35)]',
  },
  terracotta: {
    iconWrap: 'bg-gold-500/[0.12] text-gold-600',
    bar: 'bg-gold-500',
    glow: 'group-hover:shadow-[0_18px_48px_-22px_rgba(196,98,45,0.35)]',
  },
  neutral: {
    iconWrap: 'bg-obsidian-800/[0.08] text-obsidian-800',
    bar: 'bg-stone-700',
    glow: 'group-hover:shadow-[0_18px_48px_-22px_rgba(43,43,39,0.3)]',
  },
} as const

// Small decorative data glyph per card — keeps visuals lively without images.
function DataGlyph({ accent }: { accent: IntelligenceFeature['accent'] }) {
  const a = accents[accent]
  return (
    <div className="mt-5 flex h-12 items-end gap-1" aria-hidden>
      {[40, 65, 50, 80, 55, 90, 70].map((h, i) => (
        <span
          key={i}
          className={cn('w-2 rounded-sm', a.bar)}
          style={{ height: `${h}%`, opacity: 0.18 + i * 0.09 }}
        />
      ))}
    </div>
  )
}

export function IntelligenceCard({ feature }: { feature: IntelligenceFeature }) {
  const a = accents[feature.accent]
  return (
    <article
      className={cn(
        'group card-surface relative flex flex-col p-6 transition-all duration-300 hover:-translate-y-1',
        a.glow,
      )}
    >
      <div className="flex items-start justify-between">
        <span
          className={cn(
            'inline-flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105',
            a.iconWrap,
          )}
        >
          <FeatureIcon name={feature.icon} size={21} />
        </span>
        <IconArrowUpRight
          size={18}
          className="text-stone-300 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-obsidian-800"
        />
      </div>

      <h3 className="mt-5 font-display text-xl font-semibold text-obsidian-900">
        {feature.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">
        {feature.description}
      </p>

      <DataGlyph accent={feature.accent} />
    </article>
  )
}
