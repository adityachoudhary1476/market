import type { Sector } from '@/types'
import { trendFromChange } from './generators'

// ---------------------------------------------------------------------------
// MOCK DATA — Sectors
// ---------------------------------------------------------------------------

export const mockSectors: Sector[] = [
  {
    id: 'banking',
    name: 'Banking',
    changePct: 1.24,
    trend: 'up',
    strength: 82,
    advancers: 38,
    decliners: 9,
  },
  {
    id: 'it',
    name: 'IT',
    changePct: 0.92,
    trend: 'up',
    strength: 74,
    advancers: 41,
    decliners: 14,
  },
  {
    id: 'auto',
    name: 'Auto',
    changePct: 0.58,
    trend: 'up',
    strength: 66,
    advancers: 22,
    decliners: 11,
  },
  {
    id: 'pharma',
    name: 'Pharma',
    changePct: 0.34,
    trend: 'up',
    strength: 58,
    advancers: 27,
    decliners: 19,
  },
  {
    id: 'energy',
    name: 'Energy',
    changePct: -0.42,
    trend: 'down',
    strength: 41,
    advancers: 15,
    decliners: 23,
  },
  {
    id: 'fmcg',
    name: 'FMCG',
    changePct: -0.18,
    trend: 'down',
    strength: 48,
    advancers: 18,
    decliners: 20,
  },
]

export function sectorTrend(changePct: number): Sector['trend'] {
  return trendFromChange(changePct)
}
