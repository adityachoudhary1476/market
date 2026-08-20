import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'
import { IconArrowRight } from '@/components/ui/Icon'
import { primaryNav } from '@/config/nav'

interface PlaceholderProps {
  title: string
  description?: string
}

/**
 * Placeholder page for routes that will be built in later phases.
 * Keeps navigation intact and gives OpenCode a clear extension point.
 */
export default function Placeholder({ title, description }: PlaceholderProps) {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 pt-24 pb-16">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-50" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-gold-500/[0.08] blur-3xl" />

      <div className="w-full max-w-2xl text-center">
        <Logo withTagline className="justify-center" />

        <span className="mt-10 inline-flex items-center rounded-full border border-obsidian-900/10 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest2 text-stone-500">
          Coming in a later phase
        </span>

        <h1 className="mt-5 font-display text-display-md font-semibold text-obsidian-900 text-balance">
          {title}
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-stone-600">
          {description ??
            'This area of Finova Markets is being built. Phase 0 establishes the design system and homepage foundation for the full platform.'}
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button to="/" size="lg">
            Back to homepage
            <IconArrowRight size={16} />
          </Button>
        </div>

        <nav className="mx-auto mt-14 max-w-md" aria-label="Other sections">
          <p className="text-xs font-semibold uppercase tracking-widest2 text-stone-400">
            Explore
          </p>
          <ul className="mt-4 flex flex-wrap justify-center gap-2">
            {primaryNav.map((l) => (
              <li key={l.to}>
                <a
                  href={l.to}
                  className="inline-flex rounded-full border border-obsidian-900/10 bg-white/60 px-4 py-2 text-sm font-medium text-obsidian-900 transition-colors hover:border-obsidian-800/30 hover:bg-white"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  )
}
