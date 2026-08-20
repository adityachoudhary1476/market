import { cn } from '@/lib/format'

interface LogoProps {
  className?: string
  /** Show the "MARKETS" subtitle next to the wordmark. */
  withTagline?: boolean
  variant?: 'dark' | 'light'
}

/**
 * Finova wordmark. The mark is an inline SVG (abstract chart / terminal line)
 * so there are no image assets to load.
 */
export function Logo({ className, withTagline = false, variant = 'dark' }: LogoProps) {
  const text = variant === 'dark' ? 'text-obsidian-900' : 'text-ivory-100'
  const sub = variant === 'dark' ? 'text-stone-500' : 'text-ivory-100/70'

  return (
    <span className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <svg
        width="30"
        height="30"
        viewBox="0 0 64 64"
        className="shrink-0"
        aria-hidden="true"
      >
        <rect width="64" height="64" rx="14" fill="#0B0C0B" />
        <path
          d="M14 44 L26 30 L36 38 L50 20"
          fill="none"
          stroke="#C9B27C"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="50" cy="20" r="3.2" fill="#C9B27C" />
        <path
          d="M16 50 H48"
          stroke="#F3EFE6"
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
      <span className="inline-flex flex-col leading-none">
        <span
          className={cn(
            'font-display text-[1.32rem] font-semibold tracking-tight',
            text,
          )}
        >
          Finova
        </span>
        {withTagline && (
          <span className={cn('text-[9px] font-semibold uppercase tracking-widest2', sub)}>
            Markets
          </span>
        )}
      </span>
    </span>
  )
}
