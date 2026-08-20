import { IconSpark, IconArrowUpRight } from '@/components/ui/Icon'
import { aiConversation, aiEvidence } from '@/data/mockAI'
import { cn } from '@/lib/format'
import type { AIEvidence } from '@/types'

function EvidenceCard({ e, index }: { e: AIEvidence; index: number }) {
  const up = e.trend === 'up'
  return (
    <div
      className="group rounded-xl border border-obsidian-900/[0.07] bg-white p-3 transition-all duration-300 hover:border-gold-500/30 hover:shadow-soft"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
        {e.label}
      </div>
      <div
        className={cn(
          'mt-1 flex items-center gap-1 font-display text-lg font-semibold tabular',
          up ? 'text-gain' : e.trend === 'down' ? 'text-loss' : 'text-stone-700',
        )}
      >
        {e.value}
        {e.value.includes('%') && (
          <span className="text-xs font-medium opacity-70">
            {up ? '↑' : '↓'}
          </span>
        )}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 pl-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-ivory-100/60"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: '1s' }}
        />
      ))}
    </span>
  )
}

export function AIAnalystPreview() {
  return (
    <section id="analyst" className="relative overflow-hidden py-20 sm:py-24 lg:py-32">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-obsidian-900" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-dots opacity-[0.08]" />
      <div className="pointer-events-none absolute -left-32 top-0 h-[400px] w-[400px] rounded-full bg-gold-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-[400px] w-[400px] rounded-full bg-obsidian-500/20 blur-3xl" />

      <div className="container-page">
        <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-12">
          {/* Copy */}
          <div className="lg:col-span-5">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest2 text-gold-300">
              <IconSpark size={14} />
              AI Analysis
            </span>
            <h2 className="mt-4 font-display text-display-lg font-semibold text-ivory-50 text-balance">
              Ask the market <span className="italic text-gold-300">why</span>.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-ivory-100/70 sm:text-lg">
              Numbers tell you what happened. Finova helps you understand why —
              by tying price action to evidence, context and news rather than
              pretending to predict the future.
            </p>

            <ul className="mt-8 space-y-3">
              {[
                'Evidence over guesswork — every claim links to data',
                'Context across sectors, flows and global markets',
                'Honest about uncertainty, never promising returns',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-ivory-100/80">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-gold-300">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path d="M2.5 6.2 5 8.7 9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <a
              href="/analyst"
              className="mt-9 inline-flex items-center gap-2 text-sm font-semibold text-ivory-50 link-underline"
            >
              Try the AI Analyst
              <IconArrowUpRight size={15} className="text-gold-300" />
            </a>
          </div>

          {/* Conversation mockup */}
          <div className="lg:col-span-7">
            <div className="relative mx-auto w-full max-w-[600px]">
              {/* window */}
              <div className="overflow-hidden rounded-2xl border border-ivory-100/10 bg-obsidian-950/60 shadow-2xl backdrop-blur">
                <div className="flex items-center justify-between border-b border-ivory-100/10 px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gold-500/20 text-gold-300">
                      <IconSpark size={15} />
                    </span>
                    <div>
                      <div className="text-xs font-semibold text-ivory-50">Finova Analyst</div>
                      <div className="text-[10px] text-ivory-100/50">Evidence-based · not advice</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-ivory-100/50">
                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-gold-300" />
                    analyzing
                  </span>
                </div>

                <div className="space-y-5 p-5 sm:p-6">
                  {/* User message */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-ivory-50/[0.08] px-4 py-3 text-sm text-ivory-50">
                      {aiConversation[0].content}
                    </div>
                  </div>

                  {/* Analyst message */}
                  <div className="flex gap-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-obsidian-700 text-gold-300">
                      <IconSpark size={16} />
                    </span>
                    <div className="max-w-[90%]">
                      <div className="rounded-2xl rounded-tl-sm border border-ivory-100/10 bg-ivory-50/[0.04] px-4 py-3 text-sm leading-relaxed text-ivory-100/85">
                        {aiConversation[1].content}
                        <TypingDots />
                      </div>

                      {/* Evidence */}
                      <div className="mt-3">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest2 text-ivory-100/45">
                          Supporting evidence
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {aiEvidence.map((e, i) => (
                            <EvidenceCard key={e.id} e={e} index={i} />
                          ))}
                        </div>
                      </div>

                      <p className="mt-3 text-[11px] italic text-ivory-100/40">
                        Analysis reflects available data and is not a recommendation or forecast.
                      </p>
                    </div>
                  </div>

                  {/* Prompt suggestions */}
                  <div className="flex flex-wrap gap-2 border-t border-ivory-100/10 pt-4">
                    {['What is driving banking today?', 'Summarize Reliance results', 'Any unusual volume?'].map(
                      (q) => (
                        <button
                          key={q}
                          type="button"
                          className="rounded-full border border-ivory-100/15 px-3 py-1.5 text-[11px] text-ivory-100/70 transition-colors hover:border-gold-300/40 hover:text-ivory-50"
                        >
                          {q}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>

              {/* floating confidence chip */}
              <div className="absolute -right-3 -top-3 hidden rounded-xl border border-ivory-100/10 bg-obsidian-800 px-3 py-2 shadow-card sm:block">
                <div className="text-[9px] uppercase tracking-widest2 text-ivory-100/50">
                  Confidence
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ivory-100/15">
                    <div className="h-full w-[72%] rounded-full bg-gold-400" />
                  </div>
                  <span className="text-xs font-semibold tabular text-ivory-50">72%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
