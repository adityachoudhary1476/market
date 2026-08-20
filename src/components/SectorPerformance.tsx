import { mockSectors } from '@/data/mockSectors'
import { formatPct, cn } from '@/lib/format'

export function SectorPerformance() {
  return (
    <div className="card-surface p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-obsidian-900">
          Sector Performance
        </h3>
        <span className="text-xs text-stone-500">Today</span>
      </div>

      <ul className="mt-5 space-y-4">
        {mockSectors.map((s) => {
          const up = s.trend === 'up'
          return (
            <li key={s.id}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-obsidian-800">{s.name}</span>
                <span
                  className={cn(
                    'tabular font-semibold',
                    up ? 'text-gain' : 'text-loss',
                  )}
                >
                  {formatPct(s.changePct)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                  {/* center-anchored bar: positive grows right, negative left */}
                  <div
                    className={cn(
                      'absolute top-0 h-full rounded-full transition-all duration-700',
                      up ? 'left-1/2 bg-gain' : 'right-1/2 bg-loss',
                    )}
                    style={{ width: `${Math.abs(s.strength - 50) * 2}%` }}
                  />
                  <span className="absolute left-1/2 top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2 bg-stone-300" />
                </div>
                <span className="w-16 text-right text-[11px] tabular text-stone-400">
                  {s.advancers}A · {s.decliners}D
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
