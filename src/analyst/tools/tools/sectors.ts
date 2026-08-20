// ---------------------------------------------------------------------------
// Phase 2E — analyzeSectors
//
// Sector-level analysis: rank the sector universe by best/worst/alpha and
// inspect strength plus advancer/decliner counts per sector.
// ---------------------------------------------------------------------------

import { terminalSectors, sortSectors } from '../../../data/mockTerminalSectors'
import type { SectorSort } from '../../../data/mockTerminalSectors'
import type { AnalystTool, ToolResult } from '../types'
import { successResult } from '../results'
import { clampInteger, optionalString } from '../validation'
import { ToolError } from '../errors'
import { errorResult } from '../results'

export interface SectorsInput {
  /** Sort key: 'best', 'worst' or 'alpha'. Default 'best'. */
  sort?: string
  /** Max sectors to return (1-10). Default 5. */
  limit?: number
  /** Optional sector id filter, e.g. 'it'. */
  sectorId?: string
}

export interface SectorRow {
  id: string
  name: string
  changePct: number
  strength: number
  advancers: number
  decliners: number
}

export interface SectorsOutput {
  sort: SectorSort
  sectors: SectorRow[]
}

const SORTS: SectorSort[] = ['best', 'worst', 'alpha']

export const analyzeSectors: AnalystTool<SectorsInput, SectorsOutput> = {
  name: 'analyzeSectors',
  description:
    'Use to rank sectors by performance (best/worst/alpha), check a specific sector, or compare how many stocks advance vs decline inside each sector.',
  inputSchema: {
    type: 'object',
    properties: {
      sort: {
        type: 'string',
        description: "Sort key: 'best', 'worst' or 'alpha'.",
        enum: SORTS,
        default: 'best',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of sectors to return.',
        minimum: 1,
        maximum: 10,
      },
      sectorId: {
        type: 'string',
        description: 'Optional: a single sector id to inspect, e.g. "it".',
      },
    },
    required: [],
  },
  run(input, context): ToolResult<SectorsOutput> {
    const sortRaw = optionalString(input?.sort, 'sort')
    const sort: SectorSort = sortRaw ? (sortRaw as SectorSort) : 'best'
    if (!SORTS.includes(sort)) {
      return errorResult(this.name, 'market-data', ToolError.invalidInput(`'sort' must be one of: ${SORTS.join(', ')}.`), {
        now: context.now,
      })
    }

    let rows = sortSectors(terminalSectors, sort)

    const sectorId = optionalString(input?.sectorId, 'sectorId')
    if (sectorId) {
      rows = rows.filter((s) => s.id === sectorId || s.name.toLowerCase() === sectorId.toLowerCase())
    }

    const limit = clampInteger(input?.limit, 'limit', 1, 10, 5)

    const payload: SectorsOutput = {
      sort,
      sectors: rows.slice(0, limit).map((s) => ({
        id: s.id,
        name: s.name,
        changePct: s.changePct,
        strength: s.strength,
        advancers: s.advancers,
        decliners: s.decliners,
      })),
    }

    const warnings = sectorId && rows.length === 0 ? [`Sector '${sectorId}' not found.`] : []
    return successResult(this.name, 'market-data', payload, {
      available: true,
      now: context.now,
      warnings,
    })
  },
}