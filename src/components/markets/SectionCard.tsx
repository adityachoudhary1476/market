import type { ReactNode } from 'react'
import { cn } from '@/lib/format'

interface SectionCardProps {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
  bodyClassName?: string
  id?: string
  children: ReactNode
}

/** Consistent container for terminal modules. */
export function SectionCard({
  title,
  subtitle,
  action,
  className,
  bodyClassName,
  id,
  children,
}: SectionCardProps) {
  return (
    <section
      id={id}
      className={cn('card-surface overflow-hidden', className)}
      aria-labelledby={id ? `${id}-title` : undefined}
    >
      <header className="flex items-start justify-between gap-3 border-b border-obsidian-900/[0.06] px-5 py-4 sm:px-6">
        <div>
          <h2 id={id ? `${id}-title` : undefined} className="font-display text-base font-semibold text-obsidian-900">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className={cn('p-5 sm:p-6', bodyClassName)}>{children}</div>
    </section>
  )
}
