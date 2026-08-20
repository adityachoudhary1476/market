import { mockAlerts } from '@/data/mockAlerts'
import { IconBell, IconArrowUpRight } from '@/components/ui/Icon'
import { cn } from '@/lib/format'
import type { AlertSeverity } from '@/types'

const severityStyles: Record<
  AlertSeverity,
  { dot: string; chip: string; label: string }
> = {
  signal: {
    dot: 'bg-gain',
    chip: 'bg-gain-soft text-gain',
    label: 'Signal',
  },
  risk: {
    dot: 'bg-loss',
    chip: 'bg-loss-soft text-loss',
    label: 'Risk',
  },
  info: {
    dot: 'bg-obsidian-500',
    chip: 'bg-obsidian-800/[0.08] text-obsidian-800',
    label: 'Info',
  },
  news: {
    dot: 'bg-gold-500',
    chip: 'bg-gold-500/10 text-gold-700',
    label: 'News',
  },
}

function AlertCard({
  alert,
  index,
}: {
  alert: (typeof mockAlerts)[number]
  index: number
}) {
  const s = severityStyles[alert.severity]
  return (
    <article
      className="card-surface group flex gap-4 p-4 sm:p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div className="relative mt-0.5">
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-full', s.chip)}>
          <IconBell size={16} />
        </span>
        <span className={cn('absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-ivory-100', s.dot)}>
          <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', s.dot)} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {alert.symbol && (
            <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-stone-700">
              {alert.symbol}
            </span>
          )}
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', s.chip)}>
            {s.label}
          </span>
          <span className="ml-auto text-[11px] text-stone-400">{alert.time}</span>
        </div>
        <h3 className="mt-2 text-sm font-semibold leading-snug text-obsidian-900">
          {alert.title}
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-600">
          {alert.detail}
        </p>
      </div>
    </article>
  )
}

export function AlertPreview() {
  return (
    <section id="alerts" className="relative overflow-hidden py-20 sm:py-24 lg:py-28">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-ivory-50/60" />
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="reveal lg:col-span-4">
            <span className="eyebrow">Smart Alerts</span>
            <h2 className="mt-4 font-display text-display-md font-semibold text-obsidian-900 text-balance">
              Know when something changes.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-stone-600">
              Finova watches price, volume, technicals and news — so you
              don&apos;t have to stare at the screen. Get only the alerts that
              matter.
            </p>

            <ul className="mt-8 space-y-4">
              {[
                { t: 'Price & technicals', d: 'Moving averages, breakouts, volatility.' },
                { t: 'Volume & flow', d: 'Unusual activity and institutional flow.' },
                { t: 'News & events', d: 'Material headlines tagged to your watchlist.' },
              ].map((x) => (
                <li key={x.t} className="flex gap-3">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
                  <div>
                    <div className="text-sm font-semibold text-obsidian-900">{x.t}</div>
                    <div className="text-sm text-stone-500">{x.d}</div>
                  </div>
                </li>
              ))}
            </ul>

            <a
              href="/watchlist"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-obsidian-900 link-underline"
            >
              Preview alert center
              <IconArrowUpRight size={15} className="text-gold-500" />
            </a>
          </div>

          <div className="reveal lg:col-span-8">
            <div className="grid gap-3 sm:grid-cols-2">
              {mockAlerts.map((a, i) => (
                <AlertCard key={a.id} alert={a} index={i} />
              ))}
            </div>
            <p className="mt-4 text-center text-xs italic text-stone-400 sm:text-left">
              Demo alerts shown for illustration only.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
