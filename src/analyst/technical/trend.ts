import type {
  Candle,
  IndicatorContext,
  TrendComponent,
  TrendContext,
  TrendState,
  MarketStructureContext,
} from './types'
import { ema } from './numeric'
import { calculateMarketStructure } from './marketStructure'

function component(direction: TrendState, strength: number, evidence: string[]): TrendComponent {
  return { direction, strength: Math.max(0, Math.min(100, Math.round(strength))), evidence }
}

export function calculateTrend(
  candles: Candle[],
  indicators: IndicatorContext,
  structure?: MarketStructureContext,
): TrendContext {
  const close = candles.map((c) => c.close)
  const price = close[close.length - 1]
  const e9 = ema(close, 9)
  const e20 = ema(close, 20)
  const e50 = ema(close, 50)
  const e200 = ema(close, 200)
  const struct = structure ?? calculateMarketStructure(candles)
  const ma = indicators.movingAverages

  // Short term — EMA9 vs EMA20, MACD, structure
  const shortEvidence: string[] = []
  let shortScore = 50
  if (e9 != null && e20 != null) {
    if (price > e9) { shortScore += 12; shortEvidence.push('price above EMA9') }
    else { shortScore -= 12; shortEvidence.push('price below EMA9') }
    if (e9 > e20) { shortScore += 12; shortEvidence.push('EMA9 above EMA20') }
    else { shortScore -= 12; shortEvidence.push('EMA9 below EMA20') }
  } else shortEvidence.push('insufficient data for EMA9/20')
  if (indicators.macd.crossover === 'bullish') { shortScore += 10; shortEvidence.push('MACD bullish crossover') }
  else if (indicators.macd.crossover === 'bearish') { shortScore -= 10; shortEvidence.push('MACD bearish crossover') }
  else if (indicators.macd.histogramDirection === 'rising') { shortScore += 5; shortEvidence.push('MACD histogram rising') }
  else if (indicators.macd.histogramDirection === 'falling') { shortScore -= 5; shortEvidence.push('MACD histogram falling') }
  if (struct.state === 'bullish') { shortScore += 8; shortEvidence.push('higher highs and higher lows') }
  else if (struct.state === 'bearish') { shortScore -= 8; shortEvidence.push('lower highs and lower lows') }
  let shortDirection: TrendState = 'neutral'
  if (e9 == null || e20 == null) shortDirection = 'insufficient-data'
  else if (shortScore >= 68) shortDirection = 'bullish'
  else if (shortScore <= 32) shortDirection = 'bearish'
  else if (Math.abs(shortScore - 50) < 10) shortDirection = 'neutral'
  else shortDirection = 'transitioning'

  // Medium term — EMA20 vs EMA50, ADX, Bollinger position
  const medEvidence: string[] = []
  let medScore = 50
  if (e20 != null && e50 != null) {
    if (e20 > e50) { medScore += 18; medEvidence.push('EMA20 above EMA50') }
    else { medScore -= 18; medEvidence.push('EMA20 below EMA50') }
    if (price > e50) { medScore += 10; medEvidence.push('price above EMA50') }
    else { medScore -= 10; medEvidence.push('price below EMA50') }
  }
  if (indicators.adx.trendStrength === 'strong' || indicators.adx.trendStrength === 'established') {
    if (indicators.adx.direction === 'bullish') medScore += 10
    else if (indicators.adx.direction === 'bearish') medScore -= 10
    medEvidence.push(`ADX ${indicators.adx.adx} (${indicators.adx.trendStrength})`)
  }
  if (indicators.bollinger.pricePosition === 'near-upper' || indicators.bollinger.pricePosition === 'above-upper') {
    medScore += 6; medEvidence.push('trading near upper Bollinger band')
  } else if (indicators.bollinger.pricePosition === 'near-lower' || indicators.bollinger.pricePosition === 'below-lower') {
    medScore -= 6; medEvidence.push('trading near lower Bollinger band')
  }
  let medDirection: TrendState = 'neutral'
  if (e20 == null || e50 == null) medDirection = 'insufficient-data'
  else if (medScore >= 68) medDirection = 'bullish'
  else if (medScore <= 32) medDirection = 'bearish'
  else if (Math.abs(medScore - 50) < 10) medDirection = 'neutral'
  else medDirection = 'transitioning'

  // Long term — EMA50 vs EMA200, alignment
  const longEvidence: string[] = []
  let longScore = 50
  if (e50 != null && e200 != null) {
    if (e50 > e200) { longScore += 25; longEvidence.push('EMA50 above EMA200') }
    else { longScore -= 25; longEvidence.push('EMA50 below EMA200') }
    if (price > e200) { longScore += 15; longEvidence.push('price above EMA200') }
    else { longScore -= 15; longEvidence.push('price below EMA200') }
    if (ma.alignment.bullishAlignment) { longScore += 10; longEvidence.push('bullish EMA stack (9>20>50>200)') }
    else if (ma.alignment.bearishAlignment) { longScore -= 10; longEvidence.push('bearish EMA stack (9<20<50<200)') }
  } else longEvidence.push('insufficient history for EMA200')
  let longDirection: TrendState = 'neutral'
  if (e50 == null || e200 == null) longDirection = 'insufficient-data'
  else if (longScore >= 68) longDirection = 'bullish'
  else if (longScore <= 32) longDirection = 'bearish'
  else if (Math.abs(longScore - 50) < 12) longDirection = 'neutral'
  else longDirection = 'transitioning'

  // Overall — no confluence score (Phase 2C). Blend for directional read only.
  let overallDirection: TrendState = 'neutral'
  if (shortDirection === 'insufficient-data') overallDirection = 'insufficient-data'
  else if (shortDirection === 'bullish' && medDirection === 'bullish' && longDirection !== 'bearish') overallDirection = 'bullish'
  else if (shortDirection === 'bearish' && medDirection === 'bearish' && longDirection !== 'bullish') overallDirection = 'bearish'
  else if (shortDirection === 'bullish' || medDirection === 'bullish') overallDirection = 'transitioning'
  else if (shortDirection === 'bearish' || medDirection === 'bearish') overallDirection = 'transitioning'

  return {
    shortTerm: component(shortDirection, shortScore, shortEvidence),
    mediumTerm: component(medDirection, medScore, medEvidence),
    longTerm: component(longDirection, longScore, longEvidence),
    overall: component(overallDirection, shortScore * 0.4 + medScore * 0.35 + longScore * 0.25, [
      `Short term: ${shortDirection}`,
      `Medium term: ${medDirection}`,
      `Long term: ${longDirection}`,
    ]),
  }
}
