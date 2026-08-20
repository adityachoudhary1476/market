import type { Candle, DataCapabilities, DataQuality } from './types'

// Honest OHLCV validation. Reports why analysis can't proceed rather than
// crashing. Detects which optional fields (high/low/volume) are usable.

export function getCapabilities(candles: Candle[]): DataCapabilities {
  if (candles.length === 0) return { hasHighLow: false, hasVolume: false }
  let hasHighLow = true
  let hasVolume = true
  for (const c of candles) {
    // In a close-only feed, high/low are set equal to close.
    if (!(c.high > c.low)) hasHighLow = false
    if (c.volume == null || c.volume <= 0) hasVolume = false
  }
  return { hasHighLow, hasVolume }
}

export interface ValidationResult {
  valid: boolean
  reason?: string
  count: number
  capabilities: DataCapabilities
}

export function validateCandles(candles: Candle[] | undefined | null): ValidationResult {
  if (!candles || candles.length === 0) {
    return { valid: false, reason: 'No candle data available', count: 0, capabilities: { hasHighLow: false, hasVolume: false } }
  }
  const count = candles.length
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].timestamp <= candles[i - 1].timestamp) {
      return { valid: false, reason: `Timestamps must be strictly increasing (at index ${i})`, count, capabilities: getCapabilities(candles) }
    }
  }
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    if (![c.open, c.high, c.low, c.close].every(Number.isFinite)) {
      return { valid: false, reason: `Non-numeric OHLC at index ${i}`, count, capabilities: getCapabilities(candles) }
    }
    if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) {
      return { valid: false, reason: `Non-positive price at index ${i}`, count, capabilities: getCapabilities(candles) }
    }
    if (c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close) || c.high < c.low) {
      return { valid: false, reason: `Invalid OHLC relationship at index ${i}`, count, capabilities: getCapabilities(candles) }
    }
    if (c.volume != null && c.volume < 0) {
      return { valid: false, reason: `Negative volume at index ${i}`, count, capabilities: getCapabilities(candles) }
    }
  }
  return { valid: true, count, capabilities: getCapabilities(candles) }
}

export function assessQuality(
  candles: Candle[],
  v: ValidationResult,
  requiredForLongTerm = 200,
): DataQuality {
  const warnings: string[] = []
  if (!v.capabilities.hasHighLow) {
    warnings.push('High/low data unavailable; ATR, ADX, Stochastic, Ichimoku and support/resistance are limited.')
  }
  if (!v.capabilities.hasVolume) {
    warnings.push('Volume unavailable; OBV, MFI and volume-based signals are disabled.')
  }
  if (v.count < 50) warnings.push('Fewer than 50 bars; long-term moving averages are unavailable.')
  if (v.count < 200) warnings.push(`Fewer than ${requiredForLongTerm} bars; SMA/EMA 200 and long-term trend are unavailable.`)
  return {
    candleCount: candles.length,
    sufficientHistory: candles.length >= 50,
    warnings,
    hasHighLow: v.capabilities.hasHighLow,
    hasVolume: v.capabilities.hasVolume,
  }
}
