// Number / currency formatting helpers. Kept in one place so future API data
// can be normalized consistently.

const inr0 = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
})

const inr2 = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const us2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatINR(value: number, decimals = 2): string {
  return decimals === 0 ? inr0.format(value) : inr2.format(value)
}

export function formatNumber(value: number): string {
  return inr0.format(value)
}

export function formatUSD(value: number): string {
  return us2.format(value)
}

export function formatPct(value: number, withSign = true): string {
  const sign = withSign && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function formatPoints(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}`
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Phase 1 — terminal formatters
// ---------------------------------------------------------------------------

/** Compact Indian-market number: 1.2Cr, 45.3L, 8.9K. */
export function formatCompactIN(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e7) return `${(value / 1e7).toFixed(2).replace(/\.?0+$/, '')}Cr`
  if (abs >= 1e5) return `${(value / 1e5).toFixed(2).replace(/\.?0+$/, '')}L`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1).replace(/\.0$/, '')}K`
  return inr0.format(value)
}

/** Format a market-cap value already in INR crore. */
export function formatMarketCap(cr: number): string {
  if (cr >= 1e5) return `₹${(cr / 1e5).toFixed(2)}L Cr`
  if (cr >= 1e3) return `₹${(cr / 1e3).toFixed(2)}K Cr`
  return `₹${inr0.format(cr)} Cr`
}

/** Signed absolute change with a leading sign, to 2 decimals. */
export function formatSigned(value: number, decimals = 2): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}${Math.abs(value).toFixed(decimals)}`
}

/** Format an epoch timestamp as a short IST time like "11:42 AM". */
export function formatIST(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

/** Format a date as "Mon, 19 Aug". */
export function formatShortDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  })
}
