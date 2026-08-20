import { Button } from '@/components/ui/Button'
import { IconArrowRight, IconPulse } from '@/components/ui/Icon'

export function CTA() {
  return (
    <section className="relative py-20 sm:py-24 lg:py-28">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-3xl border border-obsidian-900/10 bg-obsidian-900 px-6 py-16 text-center shadow-card sm:px-12 sm:py-20 lg:py-24">
          {/* Restrained background treatment */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-dots opacity-[0.09]" />
            <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-gold-500/15 blur-3xl" />
            <div className="absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-obsidian-500/20 blur-3xl" />
            <svg
              className="absolute inset-x-0 bottom-0 w-full opacity-[0.12]"
              viewBox="0 0 1200 120"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path
                d="M0 80 C 200 20, 400 120, 600 60 S 1000 20, 1200 70 L1200 120 L0 120 Z"
                fill="#C9B27C"
              />
            </svg>
          </div>

          <div className="relative mx-auto max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-ivory-100/15 bg-ivory-100/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest2 text-ivory-100/80">
              <IconPulse size={13} className="text-gold-300" />
              Start with the Market Pulse
            </span>
            <h2 className="mt-6 font-display text-display-lg font-semibold text-ivory-50 text-balance">
              The market is already moving.
              <br />
              <span className="italic text-gold-300">
                Start understanding it.
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ivory-100/70">
              Explore a calmer, more intelligent way to follow the markets —
              data, research, news and AI, together.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button to="/markets" variant="dark" size="lg">
                Explore Finova Markets
                <IconArrowRight size={17} />
              </Button>
              <Button
                to="/#pulse"
                variant="ghost"
                size="lg"
                className="text-ivory-50 hover:bg-ivory-100/10"
              >
                <span className="inline-flex items-center gap-2">
                  <IconPulse size={16} className="text-gold-300" />
                  View Market Pulse
                </span>
              </Button>
            </div>

            <p className="mt-8 text-xs text-ivory-100/45">
              No account required for Phase 0 · Demo data for illustration only
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
