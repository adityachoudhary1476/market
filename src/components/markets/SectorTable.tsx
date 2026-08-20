import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  terminalSectors,
  sortSectors,
  type SectorSort,
} from '@/data/mockTerminalSectors'
import { formatPct, cn } from '@/lib/format'
import type { Sector } from '@/types'
import { IconChevronDown } from '@/components/ui/Icon'

const SORTS: { id: SectorSort; label: string }[] = [
  { id: 'best', label: 'Best performing' },
  { id: 'worst', label: 'Worst performing' },
  { id: 'alpha', label: 'Alphabetical' },
]

function SortMenu({ value, onChange }: { value: SectorSort; onChange: (s: SectorSort) => void }) {
  const [open, setOpen] = useState(false)
  const current = SORTS.find((s) => s.id === value)?.label ?? 'Sort'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full border border-obsidian-900/10 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-obsidian-800/30"
      >
        {current}
        <IconChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-obsidian-900/10 bg-white py-1 shadow-card"
        >
          {SORTS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                role="option"
                aria-selected={s.id === value}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(s.id)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-ivory-50',
                  s.id === value ? 'font-semibold text-obsidian-900' : 'text-stone-600',
                )}
              >
                {s.label}
                {s.id === value && <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SectorRow({ sector }: { sector: Sector }) {
  const navigate = useNavigate()
  const up = sector.trend === 'up'
  return (
    <button
      type="button"
      onClick={() => navigate(`/markets/sector/${sector.id}`)}
      className="group grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-ivory-50 focus-visible:bg-ivory-50"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-obsidian-900 group-hover:text-obsidian-800">
          {sector.name}
        </span>
        <span className="mt-1 block h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-stone-100">
          <span
            className={cn('block h-full rounded-full', up ? 'bg-gain' : 'bg-loss')}
            style={{ width: `${sector.strength}%` }}
          />
        </span>
      </span>
      <span className="hidden w-20 text-right text-[11px] tabular text-stone-400 sm:block">
        {sector.advancers}A · {sector.decliners}D
      </span>
      <span
        className={cn(
          'w-16 text-right text-sm font-semibold tabular',
          up ? 'text-gain' : 'text-loss',
        )}
      >
        {formatPct(sector.changePct)}
      </span>
    </button>
  )
}

export function SectorTable() {
  const [sort, setSort] = useState<SectorSort>('best')
  const rows = useMemo(() => sortSectors(terminalSectors, sort), [sort])

  return (
    <div className="card-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-obsidian-900/[0.06] px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-display text-base font-semibold text-obsidian-900">
            Sector Performance
          </h2>
          <p className="mt-0.5 text-xs text-stone-500">Relative strength across NSE sectors</p>
        </div>
        <SortMenu value={sort} onChange={setSort} />
      </div>
      <div className="p-3 sm:p-4">
        <div className="divide-y divide-obsidian-900/[0.05]">
          {rows.map((s) => (
            <SectorRow key={s.id} sector={s} />
          ))}
        </div>
      </div>
    </div>
  )
}
