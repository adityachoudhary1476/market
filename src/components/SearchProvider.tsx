import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { SearchCommand } from './SearchCommand'

interface SearchCtx {
  openSearch: () => void
  closeSearch: () => void
  isOpen: boolean
}

const Ctx = createContext<SearchCtx | null>(null)

export function useSearch(): SearchCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSearch must be used within <SearchProvider>')
  return ctx
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)

  const openSearch = useCallback(() => setOpen(true), [])
  const closeSearch = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      // Cmd/Ctrl + K anywhere
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
        return
      }
      // "/" opens search when not typing into a field
      if (e.key === '/' && !isTyping) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const value = useMemo(() => ({ openSearch, closeSearch, isOpen }), [openSearch, closeSearch, isOpen])

  return (
    <Ctx.Provider value={value}>
      {children}
      <SearchCommand open={isOpen} onClose={closeSearch} />
    </Ctx.Provider>
  )
}
