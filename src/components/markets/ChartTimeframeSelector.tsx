import type { Timeframe } from '@/types'
import { cn } from '@/lib/format'

const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', '1Y', '5Y']

interface Props {
  value: Timeframe
  onChange: (tf: Timeframe) => void
  className?: string
}

export function ChartTimeframeSelector({ value, onChange, className }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Chart timeframe"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-obsidian-900/10 bg-ivory-50 p-0.5',
        className,
      )}
    >
      {TIMEFRAMES.map((tf) => {
        const active = tf === value
        return (
          <button
            key={tf}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tf)}
            className={cn(
              'min-w-[40px] rounded-full px-2.5 py-1 text-[12px] font-semibold tabular transition-colors duration-200',
              active
                ? 'bg-obsidian-800 text-ivory-50 shadow-soft'
                : 'text-stone-600 hover:text-obsidian-900',
            )}
          >
            {tf}
          </button>
        )
      })}
    </div>
  )
}
