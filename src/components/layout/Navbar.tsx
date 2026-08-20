import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { IconMenu, IconClose, IconSearch, IconArrowRight } from '@/components/ui/Icon'
import { primaryNav } from '@/config/nav'
import { useScrolled } from '@/hooks/useScrolled'
import { useSearch } from '@/components/SearchProvider'
import { cn } from '@/lib/format'

export function Navbar() {
  const scrolled = useScrolled(20)
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { openSearch } = useSearch()

  // Close the mobile menu on route change
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-ivory-100/85 backdrop-blur-md border-b border-obsidian-900/[0.06] shadow-soft'
          : 'bg-transparent border-b border-transparent',
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-obsidian-800 focus:px-4 focus:py-2 focus:text-ivory-50"
      >
        Skip to content
      </a>

      <nav
        className={cn(
          'container-page flex items-center justify-between transition-all duration-300',
          scrolled ? 'h-16' : 'h-20',
        )}
        aria-label="Primary"
      >
        {/* Left: wordmark */}
        <Link to="/" className="shrink-0" aria-label="Finova Markets — home">
          <Logo withTagline={!scrolled} />
        </Link>

        {/* Center: desktop nav */}
        <ul className="hidden lg:flex items-center gap-1">
          {primaryNav.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'relative rounded-full px-4 py-2 text-[14px] font-medium transition-colors duration-200',
                    isActive
                      ? 'text-obsidian-900'
                      : 'text-stone-600 hover:text-obsidian-900 hover:bg-obsidian-800/[0.05]',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {link.label}
                    {isActive && (
                      <span className="absolute inset-x-4 -bottom-0.5 h-px bg-gold-500" />
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openSearch}
            aria-label="Search stocks, indices and sectors"
            className="hidden items-center gap-2 rounded-full border border-obsidian-900/[0.08] bg-white/60 py-1.5 pl-3 pr-2 text-sm text-stone-500 transition-colors hover:border-obsidian-800/25 hover:text-obsidian-800 md:inline-flex"
          >
            <IconSearch size={16} />
            <span className="text-[13px]">Search</span>
            <kbd className="ml-6 rounded border border-obsidian-900/10 bg-ivory-50 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            onClick={openSearch}
            aria-label="Search"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-stone-700 transition-colors hover:bg-obsidian-800/[0.06] hover:text-obsidian-900 md:hidden"
          >
            <IconSearch size={19} />
          </button>
          <Button to="/markets" size="sm" className="hidden sm:inline-flex">
            Explore Markets
            <IconArrowRight size={15} />
          </Button>
          <Button
            to="/markets"
            size="sm"
            className="sm:hidden"
            aria-label="Open terminal"
          >
            Open
          </Button>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-full text-obsidian-900 transition-colors hover:bg-obsidian-800/[0.06]"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <IconClose size={22} /> : <IconMenu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile menu panel */}
      <div
        id="mobile-menu"
        className={cn(
          'lg:hidden fixed inset-x-0 top-16 bottom-0 z-40 bg-ivory-100/98 backdrop-blur-md transition-all duration-300',
          open
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none',
        )}
      >
        <div className="container-page py-8 flex flex-col gap-1">
          {primaryNav.map((link, i) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center justify-between border-b border-obsidian-900/[0.07] py-4 font-display text-2xl text-obsidian-900"
              style={{
                transitionDelay: open ? `${i * 40}ms` : '0ms',
                opacity: open ? 1 : 0,
                transform: open ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 0.4s ease, transform 0.4s ease',
              }}
            >
              {link.label}
              <IconArrowRight size={18} className="text-gold-500" />
            </Link>
          ))}
          <div className="mt-8 flex flex-col gap-3">
            <Button to="/markets" size="lg" className="w-full">
              Explore Markets
              <IconArrowRight size={16} />
            </Button>
            <Button to="/analyst" variant="secondary" size="lg" className="w-full">
              Meet the AI Analyst
            </Button>
          </div>
          <p className="mt-10 text-xs text-stone-500">
            Market data shown is demo data for illustrative purposes.
          </p>
        </div>
      </div>
    </header>
  )
}
