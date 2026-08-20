import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'dark'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-300 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:pointer-events-none'

const variants: Record<Variant, string> = {
  primary:
    'bg-obsidian-800 text-ivory-50 hover:bg-obsidian-900 shadow-soft hover:shadow-card hover:-translate-y-0.5',
  secondary:
    'bg-white text-obsidian-900 border border-obsidian-900/10 hover:border-obsidian-800/30 hover:bg-ivory-50 hover:-translate-y-0.5',
  ghost:
    'text-obsidian-900 hover:bg-obsidian-800/[0.06]',
  dark: 'bg-ivory-50 text-obsidian-900 hover:bg-white hover:-translate-y-0.5 shadow-soft',
}

const sizes: Record<Size, string> = {
  sm: 'text-[13px] px-4 py-2',
  md: 'text-sm px-5 py-2.5',
  lg: 'text-[15px] px-7 py-3.5',
}

interface BaseProps {
  variant?: Variant
  size?: Size
  children: ReactNode
  className?: string
}

type ButtonAsButton = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & {
    to?: undefined
    href?: undefined
  }

type ButtonAsLink = BaseProps & {
  to: string
  href?: undefined
}

type ButtonAsAnchor = BaseProps & {
  href: string
  to?: undefined
  /** extra anchor attrs */
  target?: string
  rel?: string
}

type ButtonProps = ButtonAsButton | ButtonAsLink | ButtonAsAnchor

export const Button = forwardRef<HTMLElement, ButtonProps>(function Button(props, ref) {
  const { variant = 'primary', size = 'md', className, children } = props
  const classes = cn(base, variants[variant], sizes[size], className)

  if ('to' in props && props.to) {
    return (
      <Link
        ref={ref as never}
        to={props.to}
        className={classes}
      >
        {children}
      </Link>
    )
  }

  if ('href' in props && props.href) {
    return (
      <a
        ref={ref as never}
        href={props.href}
        target={props.target}
        rel={props.rel}
        className={classes}
      >
        {children}
      </a>
    )
  }

  const { variant: _v, size: _s, className: _c, children: _ch, ...rest } =
    props as ButtonAsButton
  return (
    <button ref={ref as never} className={classes} {...rest}>
      {children}
    </button>
  )
})
