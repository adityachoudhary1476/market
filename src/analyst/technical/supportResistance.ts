import type { Candle, PriceLevel, SupportResistanceContext, LevelType } from './types'
import { detectSwings } from './marketStructure'

interface SRParams {
  lookback?: number
  tolerancePct?: number
  minTouches?: number
  maxLevels?: number
}

interface RawLevel {
  type: LevelType
  price: number
  touches: number
  indices: number[]
}

export function calculateSupportResistance(
  candles: Candle[],
  params: SRParams = {},
): SupportResistanceContext {
  const lookback = params.lookback ?? 3
  const tolerancePct = params.tolerancePct ?? 0.008
  const minTouches = params.minTouches ?? 2
  const maxLevels = params.maxLevels ?? 4
  const price = candles[candles.length - 1]?.close ?? 0
  const tolerance = price * tolerancePct

  const { highs, lows } = detectSwings(candles, lookback)
  const raw: RawLevel[] = []

  for (const s of highs) {
    const existing = raw.find((r) => r.type === 'resistance' && Math.abs(r.price - s.price) <= tolerance)
    if (existing) {
      existing.touches++
      existing.indices.push(s.index)
      existing.price = (existing.price * (existing.touches - 1) + s.price) / existing.touches
    } else {
      raw.push({ type: 'resistance', price: s.price, touches: 1, indices: [s.index] })
    }
  }
  for (const s of lows) {
    const existing = raw.find((r) => r.type === 'support' && Math.abs(r.price - s.price) <= tolerance)
    if (existing) {
      existing.touches++
      existing.indices.push(s.index)
      existing.price = (existing.price * (existing.touches - 1) + s.price) / existing.touches
    } else {
      raw.push({ type: 'support', price: s.price, touches: 1, indices: [s.index] })
    }
  }

  const n = candles.length
  const levels: PriceLevel[] = raw
    .filter((r) => r.touches >= minTouches)
    .map((r) => {
      const half = tolerance / 2
      const lastIdx = r.indices.length ? Math.max(...r.indices) : n - 1
      const recencyScore = Math.round(100 * (1 - (n - 1 - lastIdx) / n))
      const touchScore = Math.min(100, r.touches * 22)
      return {
        type: r.type,
        low: Number((r.price - half).toFixed(2)),
        high: Number((r.price + half).toFixed(2)),
        strength: Math.round(0.6 * touchScore + 0.4 * recencyScore),
        touches: r.touches,
        recency: recencyScore,
        evidence: [`${r.touches} touch${r.touches > 1 ? 'es' : ''} near ${r.price.toFixed(2)}`],
      }
    })

  const support = levels
    .filter((l) => l.type === 'support' && l.high < price)
    .sort((a, b) => b.high - a.high)
    .slice(0, maxLevels)
  const resistance = levels
    .filter((l) => l.type === 'resistance' && l.low > price)
    .sort((a, b) => a.low - b.low)
    .slice(0, maxLevels)

  const nearestSupport = support[0] ?? null
  const nearestResistance = resistance[0] ?? null

  return {
    levels: [...resistance, ...support],
    nearestSupport,
    nearestResistance,
    distanceToResistancePercent: nearestResistance
      ? Number((((nearestResistance.low - price) / price) * 100).toFixed(2))
      : null,
    distanceToSupportPercent: nearestSupport
      ? Number((((price - nearestSupport.high) / price) * 100).toFixed(2))
      : null,
  }
}
