// ---------------------------------------------------------------------------
// Phase 3A — Agent layer: entity resolution
//
// Resolves user aliases ("Nifty 50", "BANKNIFTY", "TCS", "Tata Consultancy
// Services") to canonical instrument ids in the deterministic universe. Only
// instruments that actually exist resolve — unknown ones resolve to null so
// the system can answer honestly instead of silently substituting.
// ---------------------------------------------------------------------------

import { TERMINAL_INDICES } from '../../data/marketSeries'
import { terminalStocks } from '../../data/mockTerminalStocks'
import { terminalIndices } from '../../data/mockTerminalIndices'
import { SUBJECTS } from './subjects'

export type EntityType =
  | 'index'
  | 'stock'
  | 'commodity'
  | 'fx'
  | 'crypto'
  | 'sector'
  | 'global'
  | 'macro'

export interface ResolvedEntity {
  /** Canonical id/symbol, e.g. 'nifty-50' or 'TCS'. */
  id: string
  type: EntityType
  displayName: string
}

export interface EntityMention {
  /** Canonical id of the resolved instrument. */
  id: string
  type: EntityType
  displayName: string
  /** The exact alias text matched in the user's input. */
  matched: string
}

interface AliasEntry {
  id: string
  type: EntityType
  displayName: string
  aliases: string[]
}

const ALIASES: AliasEntry[] = []

function add(entry: AliasEntry) {
  ALIASES.push(entry)
}

for (const id of TERMINAL_INDICES) {
  const index = terminalIndices.find((i) => i.id === id)
  const symbol = index?.symbol ?? id.toUpperCase()
  const name = index?.name ?? id
  add({
    id,
    type: 'index',
    displayName: name,
    aliases: [
      id,
      symbol.toLowerCase(),
      name.toLowerCase(),
      // Remove hyphens/spaces so "Nifty50"/"NIFTY50"/"BANKNIFTY" match too.
      id.replace(/[^a-z0-9]/gi, '').toLowerCase(),
      symbol.replace(/[^a-z0-9]/gi, '').toLowerCase(),
      name.replace(/[^a-z0-9]/gi, '').toLowerCase(),
    ].filter((a) => a.length > 0),
  })
}

// Common conversational aliases that don't derive from the canonical names.
const COMMON_ALIASES: Array<{ id: string; aliases: string[] }> = [
  { id: 'nifty-50', aliases: ['nifty', 'the nifty', 'nifty index'] },
  { id: 'bank-nifty', aliases: ['nifty bank'] },
  { id: 'sensex', aliases: ['the sensex'] },
]

for (const { id, aliases } of COMMON_ALIASES) {
  const entry = ALIASES.find((a) => a.id === id)
  if (entry) entry.aliases.push(...aliases)
}

for (const stock of terminalStocks) {
  add({
    id: stock.symbol,
    type: 'stock',
    displayName: stock.name,
    aliases: [
      stock.symbol.toLowerCase(),
      stock.name.toLowerCase(),
      stock.name.replace(/[^a-z0-9]/gi, '').toLowerCase(),
    ].filter((a) => a.length > 0),
  })
}

// Natural-language financial subjects ("oil", "gold", "bitcoin", "Indian
// banks", "US markets", ...). They are resolved as entities so the context
// note, conversation memory and evidence attribution can name them; their
// deterministic data coverage is declared per subject in subjects.ts.
for (const subject of SUBJECTS) {
  add({
    id: subject.id,
    type: subject.entityType,
    displayName: subject.label,
    aliases: subject.aliases,
  })
}

/** All canonical ids in the universe, comma-joined (for the system prompt). */
export function describeUniverse(): string {
  return ALIASES.map((a) => `- ${a.id} (${a.displayName})`).join('\n')
}

/** Resolve a single query/alias to a canonical entity, or null. */
export function resolveEntity(query: string): ResolvedEntity | null {
  if (typeof query !== 'string') return null
  const q = query.trim().toLowerCase()
  if (!q) return null
  const hit = ALIASES.find((a) => a.aliases.includes(q))
  if (!hit) return null
  return { id: hit.id, type: hit.type, displayName: hit.displayName }
}

const SORTED = [...ALIASES]
  .flatMap((a) => a.aliases.map((alias) => ({ entry: a, alias })))
  .sort((a, b) => b.alias.length - a.alias.length)

/**
 * Find instrument mentions in free text. Longest aliases match first so
 * "Nifty IT" wins over "Nifty". Each instrument is returned at most once.
 */
export function findEntityMentions(text: string): EntityMention[] {
  if (!text) return []
  const lower = text.toLowerCase()
  const seen = new Set<string>()
  const out: EntityMention[] = []

  for (const { entry, alias } of SORTED) {
    if (alias.length === 0 || seen.has(entry.id)) continue
    if (containsWord(lower, alias)) {
      seen.add(entry.id)
      out.push({ id: entry.id, type: entry.type, displayName: entry.displayName, matched: alias })
    }
  }
  return out
}

/** Word-boundary aware containment (avoids "nifty" matching inside "banknifty"). */
function containsWord(text: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i')
  return re.test(text)
}