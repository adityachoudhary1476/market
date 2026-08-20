import { tickerInstruments } from '@/data/mockMarkets'
import { formatPct, cn } from '@/lib/format'
import type { MarketIndex } from '@/types'

function TickerItem({ m }: { m: MarketIndex }) {
  const up = m.trend !== 'down'
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap px-5 text-sm">
      <span className="font-medium text-obsidian-800">{m.symbol}</span>
      <span className="tabular text-stone-600">
        {m.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </span>
      <span
        className={cn(
          'tabular inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
          up ? 'bg-gain-soft text-gain' : 'bg-loss-soft text-loss',
        )}
      >
        <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
          {up ? (
            <path d="M5 2 L8 7 L2 7 Z" fill="currentColor" />
          ) : (
            <path d="M5 8 L2 3 L8 3 Z" fill="currentColor" />
          )}
        </svg>
        {formatPct(m.changePct)}
      </span>
    </span>
  )
}

export function MarketTicker() {
  // Duplicate the list for a seamless marquee loop (translateX -50%).
  const items = [...tickerInstruments, ...tickerInstruments]

  return (
    <section
      aria-label="Live market ticker"
      className="relative border-y border-obsidian-900/[0.07] bg-white/60 backdrop-blur-sm"
    >
      <div className="ticker-wrap marquee-mask relative flex items-center overflow-hidden">
        <div className="flex shrink-0 items-center gap-1 border-r border-obsidian-900/[0.07] bg-obsidian-800/[0.04] px-5 py-3">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest2 text-obsidian-800">
            Market Pulse
          </span>
        </div>

        <div className="relative flex-1 overflow-hidden">
          <div className="marquee-track flex w-max items-center py-2.5">
            {items.map((m, i) => (
              <TickerItem key={`${m.id}-${i}`} m={m} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
