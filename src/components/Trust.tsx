import { IconShield, IconPulse, IconCheck } from '@/components/ui/Icon'

const principles = [
  {
    icon: IconPulse,
    title: 'Data first.',
    body: 'Every view begins with accurate, well-organized market data — not hype.',
  },
  {
    icon: IconCheck,
    title: 'Context over noise.',
    body: 'We surface the few signals that matter and explain the environment around them.',
  },
  {
    icon: IconShield,
    title: 'Evidence over hype.',
    body: 'AI explains what happened and why — it never promises guaranteed returns.',
  },
]

export function Trust() {
  return (
    <section className="relative py-20 sm:py-24 lg:py-28">
      <div className="container-page">
        <div className="reveal mx-auto max-w-3xl text-center">
          <span className="eyebrow justify-center">Our Philosophy</span>
          <h2 className="mt-4 font-display text-display-md font-semibold text-obsidian-900 text-balance">
            Built to help you understand markets — not gamble on them.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-stone-600 sm:text-lg">
            Finova is an intelligence platform. We organize data, add context
            and explain the story behind the moves — but we never pretend to
            know the future.
          </p>
        </div>

        <div className="reveal mx-auto mt-14 grid max-w-5xl gap-4 md:grid-cols-3">
          {principles.map((p) => (
            <div
              key={p.title}
              className="card-surface p-6 transition-transform duration-300 hover:-translate-y-1"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-obsidian-800/[0.07] text-obsidian-800">
                <p.icon size={21} />
              </span>
              <h3 className="mt-5 font-display text-xl font-semibold text-obsidian-900">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                {p.body}
              </p>
            </div>
          ))}
        </div>

        <div className="reveal mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-full border border-obsidian-900/[0.07] bg-white/60 px-6 py-4 text-center">
          <span className="text-xs font-semibold uppercase tracking-widest2 text-stone-400">
            We don&apos;t say
          </span>
          {['“Guaranteed returns”', '“AI picks”', '“Never lose”', '“Beat the market”'].map(
            (phrase) => (
              <span
                key={phrase}
                className="rounded-full bg-loss/[0.08] px-3 py-1 text-xs font-medium text-loss line-through decoration-loss/60"
              >
                {phrase}
              </span>
            ),
          )}
        </div>
      </div>
    </section>
  )
}
