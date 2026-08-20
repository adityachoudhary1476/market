import type { Candle, VolumeContext, VolumeState } from './types'
import { mean } from './numeric'

export function calculateVolume(candles: Candle[]): VolumeContext {
  const n = candles.length
  const last = candles[n - 1]
  if (n < 2 || last.volume == null) {
    return {
      currentVolume: last?.volume ?? null,
      averageVolume: null,
      relativeVolume: null,
      relativeTo5: null,
      relativeTo20: null,
      relativeTo50: null,
      state: 'insufficient-data',
      priceVolume: 'insufficient-data',
      available: false,
      reason: 'Volume data required',
    }
  }

  const vols = candles.map((c) => c.volume as number)
  const avg5 = n >= 5 ? mean(vols.slice(-5)) : null
  const avg20 = n >= 20 ? mean(vols.slice(-20)) : null
  const avg50 = n >= 50 ? mean(vols.slice(-50)) : null
  const avg = avg20 ?? avg5 ?? mean(vols)
  const rel = last.volume / (avg || 1)

  let state: VolumeState = 'normal'
  if (rel >= 1.8) state = 'veryHigh'
  else if (rel >= 1.2) state = 'high'
  else if (rel >= 0.8) state = 'normal'
  else if (rel >= 0.5) state = 'low'
  else state = 'veryLow'

  const prev = candles[n - 2]
  const priceUp = last.close >= prev.close
  const volUp = last.volume >= (prev.volume ?? 0)
  let priceVolume: VolumeContext['priceVolume'] = 'flat'
  if (priceUp && volUp) priceVolume = 'rising-price-rising-volume'
  else if (priceUp && !volUp) priceVolume = 'rising-price-falling-volume'
  else if (!priceUp && volUp) priceVolume = 'falling-price-rising-volume'
  else if (!priceUp && !volUp) priceVolume = 'falling-price-falling-volume'

  return {
    currentVolume: last.volume,
    averageVolume: Number(avg.toFixed(0)),
    relativeVolume: Number(rel.toFixed(2)),
    relativeTo5: avg5 ? Number((last.volume / avg5).toFixed(2)) : null,
    relativeTo20: avg20 ? Number((last.volume / avg20).toFixed(2)) : null,
    relativeTo50: avg50 ? Number((last.volume / avg50).toFixed(2)) : null,
    state,
    priceVolume,
    available: true,
  }
}
