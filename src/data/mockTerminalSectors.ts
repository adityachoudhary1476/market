import type { Sector } from '@/types'

// ---------------------------------------------------------------------------
// MOCK DATA — 10 NSE-aligned sectors for the Markets terminal.
// `strength` (0–100) maps to the relative-strength bar; advancers/decliners
// are constituent counts. All illustrative.
// ---------------------------------------------------------------------------

export const terminalSectors: Sector[] = [
  { id: 'financials', name: 'Financials', changePct: 1.42, trend: 'up', strength: 86, advancers: 42, decliners: 9 },
  { id: 'it', name: 'Information Technology', changePct: 0.58, trend: 'up', strength: 68, advancers: 31, decliners: 18 },
  { id: 'energy', name: 'Energy', changePct: -0.34, trend: 'down', strength: 44, advancers: 14, decliners: 19 },
  { id: 'healthcare', name: 'Healthcare', changePct: 0.74, trend: 'up', strength: 71, advancers: 24, decliners: 12 },
  { id: 'auto', name: 'Auto', changePct: 0.42, trend: 'up', strength: 62, advancers: 19, decliners: 13 },
  { id: 'fmcg', name: 'FMCG', changePct: -0.22, trend: 'down', strength: 47, advancers: 16, decliners: 18 },
  { id: 'metals', name: 'Metals', changePct: 0.94, trend: 'up', strength: 74, advancers: 15, decliners: 7 },
  { id: 'pharma', name: 'Pharma', changePct: 0.88, trend: 'up', strength: 76, advancers: 22, decliners: 8 },
  { id: 'realty', name: 'Realty', changePct: -0.62, trend: 'down', strength: 40, advancers: 7, decliners: 12 },
  { id: 'consumer-durables', name: 'Consumer Durables', changePct: 0.34, trend: 'up', strength: 60, advancers: 13, decliners: 11 },
]

export type SectorSort = 'best' | 'worst' | 'alpha'

export function sortSectors(sectors: Sector[], sort: SectorSort): Sector[] {
  const arr = [...sectors]
  switch (sort) {
    case 'best':
      return arr.sort((a, b) => b.changePct - a.changePct)
    case 'worst':
      return arr.sort((a, b) => a.changePct - b.changePct)
    case 'alpha':
      return arr.sort((a, b) => a.name.localeCompare(b.name))
  }
}

export function findSector(id: string): Sector | undefined {
  const key = id.toLowerCase()
  return terminalSectors.find((s) => s.id === key || s.name.toLowerCase().replace(/\s+/g, '-') === key)
}
