import type { SVGProps } from 'react'

// ---------------------------------------------------------------------------
// Lightweight inline icon set (no external dependency).
// Stroke-based, 1.75px, 24x24 viewBox — consistent with the calm aesthetic.
// ---------------------------------------------------------------------------

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
})

export const IconSearch = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </svg>
)

export const IconMenu = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)

export const IconClose = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const IconArrowRight = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

export const IconArrowUpRight = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
)

export const IconSpark = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </svg>
)

export const IconPulse = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M3 12h4l2-6 4 12 2-6h6" />
  </svg>
)

export const IconResearch = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M5 4h11a3 3 0 0 1 3 3v13l-4-2-4 2-4-2-5 2V7a3 3 0 0 1 3-3Z" />
    <path d="M9 9h6M9 13h4" />
  </svg>
)

export const IconNews = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 9h6M7 13h6M7 17h4M17 9h.01M17 13h.01M17 17h.01" />
  </svg>
)

export const IconTechnical = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4 19V5M4 19h16" />
    <path d="m8 15 3-4 3 2 4-6" />
  </svg>
)

export const IconFundamentals = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4 19V5M4 19h16" />
    <rect x="7" y="11" width="3" height="5" rx="1" />
    <rect x="12" y="8" width="3" height="8" rx="1" />
    <rect x="17" y="13" width="2" height="3" rx="1" />
  </svg>
)

export const IconBell = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
)

export const IconGlobe = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
  </svg>
)

export const IconShield = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
)

export const IconCheck = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="m5 12 4.5 4.5L19 7" />
  </svg>
)

export const IconTrendUp = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4 16 10 10l4 4 6-7" />
    <path d="M14 7h6v6" />
  </svg>
)

export const IconTrendDown = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4 8 10 14l4-4 6 7" />
    <path d="M14 17h6v-6" />
  </svg>
)

export const IconMinus = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M5 12h14" />
  </svg>
)

export const IconRefresh = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M20 11a8 8 0 0 0-14-5.3L4 8" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 14 5.3L20 16" />
    <path d="M20 20v-4h-4" />
  </svg>
)

export const IconChevronRight = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

export const IconChevronDown = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)

export const IconClock = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const IconSort = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
  </svg>
)

export const IconLayers = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </svg>
)

export const IconActivity = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M3 12h4l2-7 4 14 2-7h6" />
  </svg>
)

export const IconArrowDownRight = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M7 7 17 17M15 9h6v6" />
  </svg>
)

export const IconCommand = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z" />
  </svg>
)

export const IconBrain = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M9 4.5a2.5 2.5 0 0 0-2.5 2.5v.2A2.5 2.5 0 0 0 5 9.5 2.5 2.5 0 0 0 6.5 14v.5A2.5 2.5 0 0 0 12 17V5a2.5 2.5 0 0 0-3-.5Z" />
    <path d="M15 4.5A2.5 2.5 0 0 1 17.5 7v.2A2.5 2.5 0 0 1 19 9.5 2.5 2.5 0 0 1 17.5 14v.5A2.5 2.5 0 0 1 12 17" />
    <path d="M12 5v12" />
  </svg>
)

export const IconSend = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M5 12 19 5l-3.5 14L11 13l-6-1Z" />
    <path d="M11 13l4.5-4.5" />
  </svg>
)

export const IconWarning = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 4 2.5 20h19L12 4Z" />
    <path d="M12 10v5M12 18h.01" />
  </svg>
)

export const IconTrendFlat = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4 12h16" />
  </svg>
)

export const IconBolt = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" />
  </svg>
)

export const IconCalendar = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 3v4M16 3v4" />
  </svg>
)

export const IconCompass = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </svg>
)

export const IconTarget = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" />
  </svg>
)

export const IconScale = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 3v18M5 7h14M7 7l-3 7a4 4 0 0 0 6 0L7 7Zm10 0-3 7a4 4 0 0 0 6 0l-3-7Z" />
  </svg>
)

export const IconPlus = ({ size, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const map = {
  pulse: IconPulse,
  research: IconResearch,
  news: IconNews,
  technical: IconTechnical,
  fundamentals: IconFundamentals,
  alerts: IconBell,
} as const

export type FeatureIconKey = keyof typeof map

export function FeatureIcon({ name, size, ...p }: { name: string } & IconProps) {
  const Cmp = map[name as FeatureIconKey] ?? IconSpark
  return <Cmp size={size} {...p} />
}
