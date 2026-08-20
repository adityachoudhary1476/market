import { IconRefresh } from '@/components/ui/Icon'
import { cn } from '@/lib/format'

interface TerminalHeaderProps {
  marketState: 'Open' | 'Closed'
  lastUpdated: string
  refreshing: boolean
  onRefresh: () => void
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

export function TerminalHeader({
  marketState,
  lastUpdated,
  refreshing,
  onRefresh,
}: TerminalHeaderProps) {
  const open = marketState === 'Open'

  return (
    <div className="flex flex-col gap-6 border-b border-obsidian-900/[0.07] pb-8 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[11px] font-bold uppercase tracking-widest2 text-gold-600">
            Indian Markets
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
              open ? 'bg-gain-soft text-gain' : 'bg-stone-100 text-stone-600',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                open ? 'animate-pulse-dot bg-gain' : 'bg-stone-400',
              )}
            />
            Market {marketState.toLowerCase()}
          </span>
        </div>
        <h1 className="mt-3 font-display text-display-md font-semibold text-obsidian-900">
          Markets
        </h1>
        <p className="mt-2 text-sm text-stone-600 sm:text-base">
          Track the signals moving Indian equities today.
        </p>
        <p className="mt-1 text-xs text-stone-400">{todayLabel()} · Regular session</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-widest2 text-stone-400">
            Updated {lastUpdated} IST
          </div>
          <div className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-stone-500">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
            Demo market data
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh market data"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-obsidian-900/10 bg-white text-obsidian-800 transition-all duration-300 hover:border-obsidian-800/30 hover:bg-ivory-50 disabled:opacity-60"
        >
          <IconRefresh size={18} className={cn(refreshing && 'animate-spin')} />
        </button>
      </div>
    </div>
  )
}
