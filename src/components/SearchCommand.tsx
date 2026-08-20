import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SearchResult } from '@/types'
import { searchMarket } from '@/data/mockTerminal'
import { terminalStocks } from '@/data/mockTerminalStocks'
import { mockIndices } from '@/data/mockMarkets'
import { terminalSectors } from '@/data/mockTerminalSectors'
import { IconSearch, IconCommand, IconArrowRight } from '@/components/ui/Icon'
import { formatINR, formatPct, cn } from '@/lib/format'

interface SearchCommandProps {
  open: boolean
  onClose: () => void
}

const TYPE_LABEL: Record<SearchResult['type'], string> = {
  stock: 'Stocks',
  index: 'Indices',
  sector: 'Sectors',
}

function ResultRow({
  result,
  active,
  onSelect,
  onHover,
}: {
  result: SearchResult
  active: boolean
  onSelect: () => void
  onHover: () => void
}) {
  // Pull a live-ish price for stocks for extra polish
  const stock = result.type === 'stock' ? terminalStocks.find((s) => s.symbol === result.title.toUpperCase() || s.id === result.id.replace('stk-', '')) : null
  const idx = result.type === 'index' ? mockIndices.find((i) => i.symbol === result.title) : null

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
        active ? 'bg-ivory-50' : 'hover:bg-ivory-50',
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold uppercase tracking-wider',
            result.type === 'stock'
              ? 'bg-obsidian-800/[0.07] text-obsidian-800'
              : result.type === 'index'
                ? 'bg-gold-500/15 text-gold-700'
                : 'bg-gain-soft text-gain',
          )}
        >
          {result.type === 'stock' ? 'STK' : result.type === 'index' ? 'IDX' : 'SEC'}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-obsidian-900">
            {result.title}
          </span>
          <span className="block truncate text-[11px] text-stone-500">{result.subtitle}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {stock && (
          <span className="hidden text-right sm:block">
            <span className="block text-xs font-semibold tabular text-obsidian-900">
              ₹{formatINR(stock.price)}
            </span>
            <span
              className={cn(
                'block text-[10px] font-semibold tabular',
                stock.trend === 'up' ? 'text-gain' : 'text-loss',
              )}
            >
              {formatPct(stock.changePct)}
            </span>
          </span>
        )}
        {idx && (
          <span
            className={cn(
              'hidden text-xs font-semibold tabular sm:inline',
              idx.trend === 'up' ? 'text-gain' : 'text-loss',
            )}
          >
            {formatPct(idx.changePct)}
          </span>
        )}
        <IconArrowRight size={15} className={cn('text-stone-300', active && 'text-gold-600')} />
      </span>
    </button>
  )
}

export function SearchCommand({ open, onClose }: SearchCommandProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    if (query.trim()) return searchMarket(query, 10)
    // Default view: a few stocks + indices + sectors
    const stocks = terminalStocks.slice(0, 5).map<SearchResult>((s) => ({
      id: `stk-${s.id}`,
      type: 'stock',
      title: s.name,
      subtitle: `${s.symbol} · ${s.sector}`,
      to: `/research/${s.symbol}`,
    }))
    const indices = mockIndices
      .filter((i) => i.region === 'india')
      .slice(0, 4)
      .map<SearchResult>((i) => ({
        id: `idx-${i.id}`,
        type: 'index',
        title: i.symbol,
        subtitle: `Index · ${i.exchange}`,
        to: '/markets',
      }))
    const sectors = terminalSectors.slice(0, 3).map<SearchResult>((s) => ({
      id: `sec-${s.id}`,
      type: 'sector',
      title: s.name,
      subtitle: 'Sector',
      to: `/markets/sector/${s.id}`,
    }))
    return [...stocks, ...indices, ...sectors]
  }, [query])

  // Reset / focus on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      const t = window.setTimeout(() => inputRef.current?.focus(), 60)
      return () => window.clearTimeout(t)
    }
  }, [open])

  // Body scroll lock while open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const go = useCallback(
    (r: SearchResult) => {
      onClose()
      navigate(r.to)
    },
    [navigate, onClose],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(results.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = results[active]
      if (r) go(r)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Keep active row in view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search Finova Markets"
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 -z-0 bg-obsidian-900/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-obsidian-900/10 bg-ivory-100 shadow-card animate-fade-up">
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-obsidian-900/[0.07] px-4">
          <IconSearch size={20} className="shrink-0 text-stone-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder="Search stocks, indices, sectors…"
            className="h-14 flex-1 bg-transparent text-sm text-obsidian-900 placeholder:text-stone-400 focus:outline-none"
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center gap-1 rounded-md border border-obsidian-900/10 px-2 py-1 text-[10px] font-semibold text-stone-500"
          >
            ESC
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-obsidian-900">No results for “{query}”</p>
              <p className="mt-1 text-xs text-stone-500">
                Try a company name, symbol like RELIANCE, or “Nifty”.
              </p>
            </div>
          ) : (
            groupResults(results, active, go, setActive)
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between gap-3 border-t border-obsidian-900/[0.07] bg-ivory-50/60 px-4 py-2.5 text-[10px] text-stone-500">
          <span className="flex items-center gap-1.5">
            <IconCommand size={13} />
            Type a symbol or company
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-obsidian-900/10 px-1.5 py-0.5 font-sans">↑</kbd>
              <kbd className="rounded border border-obsidian-900/10 px-1.5 py-0.5 font-sans">↓</kbd>
              navigate
            </span>
            <kbd className="rounded border border-obsidian-900/10 px-1.5 py-0.5 font-sans">↵</kbd>
          </span>
        </div>
      </div>
    </div>
  )
}

function groupResults(
  results: SearchResult[],
  active: number,
  go: (r: SearchResult) => void,
  setActive: (n: number) => void,
) {
  const groups: SearchResult['type'][] = ['stock', 'index', 'sector']
  return (
    <>
      {groups.map((g) => {
        const items = results.filter((r) => r.type === g)
        if (items.length === 0) return null
        return (
          <div key={g} className="mb-1">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest2 text-stone-400">
              {TYPE_LABEL[g]}
            </div>
            {items.map((r) => {
              const idx = results.indexOf(r)
              const isActive = idx === active
              return (
                <div key={r.id} data-idx={idx}>
                  <ResultRow
                    result={r}
                    active={isActive}
                    onHover={() => setActive(idx)}
                    onSelect={() => go(r)}
                  />
                </div>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
