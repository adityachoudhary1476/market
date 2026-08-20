import type {
  Candle,
  TechnicalSignal,
  IndicatorContext,
  TrendContext,
  MarketStructureContext,
  VolumeContext,
  VolatilityContext,
  SupportResistanceContext,
  Direction,
} from './types'

let counter = 0
function sid(p: string) {
  counter += 1
  return `${p}-${counter}`
}
export function resetSignalCounterForTesting() {
  counter = 0
}

function dir(score: number): Direction {
  if (score >= 2) return 'bullish'
  if (score <= -2) return 'bearish'
  return 'neutral'
}

export interface SignalInput {
  candles: Candle[]
  indicators: IndicatorContext
  trend: TrendContext
  structure: MarketStructureContext
  volume: VolumeContext
  volatility: VolatilityContext
  sr: SupportResistanceContext
}

// EVIDENCE SIGNALS ONLY. No BUY/SELL. Each signal carries the evidence that
// produced it. Phase 2C combines these into a confluence model.
export function generateSignals(input: SignalInput): TechnicalSignal[] {
  counter = 0
  const { candles, indicators: ind, trend, structure, volume, volatility, sr } = input
  const price = candles[candles.length - 1].close
  const now = new Date().toISOString()
  const signals: TechnicalSignal[] = []

  const add = (s: Omit<TechnicalSignal, 'id' | 'timestamp'>) => {
    signals.push({ id: sid(s.category), timestamp: now, ...s })
  }

  // --- Trend ---
  if (trend.shortTerm.direction !== 'insufficient-data') {
    add({
      category: 'trend',
      name: `Short-term trend ${trend.shortTerm.direction}`,
      direction: dir(trend.shortTerm.direction === 'bullish' ? 3 : trend.shortTerm.direction === 'bearish' ? -3 : 0),
      strength: trend.shortTerm.strength,
      confidence: 78,
      evidence: trend.shortTerm.evidence,
    })
  }
  if (trend.mediumTerm.direction !== 'insufficient-data') {
    add({
      category: 'trend',
      name: `Medium-term trend ${trend.mediumTerm.direction}`,
      direction: dir(trend.mediumTerm.direction === 'bullish' ? 3 : trend.mediumTerm.direction === 'bearish' ? -3 : 0),
      strength: trend.mediumTerm.strength,
      confidence: 80,
      evidence: trend.mediumTerm.evidence,
    })
  }
  if (trend.longTerm.direction !== 'insufficient-data') {
    add({
      category: 'trend',
      name: `Long-term trend ${trend.longTerm.direction}`,
      direction: dir(trend.longTerm.direction === 'bullish' ? 3 : trend.longTerm.direction === 'bearish' ? -3 : 0),
      strength: trend.longTerm.strength,
      confidence: 82,
      evidence: trend.longTerm.evidence,
    })
  }

  // Price vs key MAs
  if (ind.movingAverages.priceAbove.ema20 != null) {
    const above = ind.movingAverages.priceAbove.ema20 as boolean
    add({
      category: 'trend',
      name: above ? 'Price above EMA20' : 'Price below EMA20',
      direction: above ? 'bullish' : 'bearish',
      strength: 55,
      confidence: 85,
      evidence: [`close ${price.toFixed(2)} ${above ? 'above' : 'below'} EMA20 (${ind.movingAverages.ema[20]?.value})`],
      metadata: { ema20: ind.movingAverages.ema[20]?.value },
    })
  }
  if (ind.movingAverages.shortAboveLong.ema20Vs50 && ind.movingAverages.shortAboveLong.ema20Vs50 !== 'insufficient-data') {
    const up = ind.movingAverages.shortAboveLong.ema20Vs50 === 'bullish'
    add({
      category: 'trend',
      name: up ? 'EMA20 above EMA50' : 'EMA20 below EMA50',
      direction: up ? 'bullish' : 'bearish',
      strength: 58,
      confidence: 80,
      evidence: [`golden/death-stack: EMA20 vs EMA50 = ${ind.movingAverages.shortAboveLong.ema20Vs50}`],
    })
  }

  // --- Momentum ---
  if (ind.rsi.value != null) {
    const rsiDirection: Direction = ind.rsi.value >= 55 ? 'bullish' : ind.rsi.value <= 45 ? 'bearish' : 'neutral'
    add({
      category: 'momentum',
      name: `RSI ${ind.rsi.zone} (${ind.rsi.value})`,
      direction: rsiDirection,
      strength: Math.min(100, Math.abs(ind.rsi.value - 50) * 2.5),
      confidence: 70,
      evidence: [`RSI(${ind.rsi.period}) = ${ind.rsi.value}`, `RSI is ${ind.rsi.direction}`],
      metadata: { value: ind.rsi.value },
    })
  }
  if (ind.macd.macd != null) {
    const bullish = ind.macd.crossover === 'bullish' || (ind.macd.histogram != null && ind.macd.histogram > 0)
    add({
      category: 'momentum',
      name: `MACD ${ind.macd.crossover !== 'none' ? ind.macd.crossover + ' crossover' : ind.macd.histogramDirection}`,
      direction: bullish ? 'bullish' : ind.macd.histogramDirection === 'falling' ? 'bearish' : 'neutral',
      strength: ind.macd.histogram != null ? Math.min(100, Math.abs(ind.macd.histogram) * 200 + 40) : 45,
      confidence: 72,
      evidence: [
        `MACD ${ind.macd.macd?.toFixed(2)}, signal ${ind.macd.signal?.toFixed(2)}`,
        `histogram ${ind.macd.histogram?.toFixed(2)} (${ind.macd.histogramDirection})`,
      ],
    })
  }
  if (ind.stochastic.k != null) {
    add({
      category: 'momentum',
      name: `Stochastic ${ind.stochastic.zone}`,
      direction: ind.stochastic.k >= 55 ? 'bullish' : ind.stochastic.k <= 45 ? 'bearish' : 'neutral',
      strength: Math.min(100, Math.abs(ind.stochastic.k - 50) * 1.8),
      confidence: 64,
      evidence: [`%K ${ind.stochastic.k}, %D ${ind.stochastic.d}`, ind.stochastic.crossover !== 'none' ? `${ind.stochastic.crossover} crossover` : 'no crossover'],
    })
  }

  // --- Volatility ---
  if (ind.bollinger.bandwidth != null) {
    add({
      category: 'volatility',
      name: `Bollinger ${ind.bollinger.pricePosition}`,
      direction: ind.bollinger.pricePosition === 'near-upper' || ind.bollinger.pricePosition === 'above-upper' ? 'bullish' : ind.bollinger.pricePosition === 'near-lower' || ind.bollinger.pricePosition === 'below-lower' ? 'bearish' : 'neutral',
      strength: 45,
      confidence: 60,
      evidence: [`%B ${ind.bollinger.percentB}`, `bandwidth ${ind.bollinger.bandwidth} (${ind.bollinger.expansion})`, ind.bollinger.squeeze ? 'volatility squeeze' : ''].filter(Boolean),
    })
  }
  add({
    category: 'volatility',
    name: `Volatility ${volatility.state}`,
    direction: 'neutral',
    strength: volatility.state === 'high' ? 80 : volatility.state === 'elevated' ? 60 : 40,
    confidence: 75,
    evidence: [
      volatility.atrPercent != null ? `ATR = ${volatility.atr} (${volatility.atrPercent}% of price)` : 'ATR unavailable',
      volatility.bollingerBandwidth != null ? `BB bandwidth = ${volatility.bollingerBandwidth}` : '',
      `bandwidth is ${volatility.change}`,
    ].filter(Boolean),
  })

  // --- Volume ---
  if (volume.available && volume.relativeVolume != null) {
    add({
      category: 'volume',
      name: `Volume ${volume.state}`,
      direction: volume.priceVolume.includes('rising-price') ? 'bullish' : volume.priceVolume.includes('falling-price') ? 'bearish' : 'neutral',
      strength: Math.min(100, volume.relativeVolume * 50),
      confidence: 68,
      evidence: [
        `volume is ${volume.relativeVolume}× the 20-bar average (${volume.state})`,
        volume.priceVolume.replace(/-/g, ' '),
      ],
    })
  }
  if (ind.obv.available && ind.obv.direction !== 'insufficient-data') {
    add({
      category: 'volume',
      name: `OBV ${ind.obv.direction}`,
      direction: ind.obv.direction === 'rising' ? 'bullish' : ind.obv.direction === 'falling' ? 'bearish' : 'neutral',
      strength: 50,
      confidence: 62,
      evidence: [`OBV slope ${ind.obv.slope}`],
    })
  }

  // --- Structure ---
  if (structure.state !== 'insufficient-data') {
    add({
      category: 'structure',
      name: `Market structure ${structure.state}`,
      direction: structure.state === 'bullish' ? 'bullish' : structure.state === 'bearish' ? 'bearish' : 'neutral',
      strength: 60,
      confidence: 70,
      evidence: [
        `${structure.higherHighs} higher highs, ${structure.higherLows} higher lows`,
        `${structure.lowerHighs} lower highs, ${structure.lowerLows} lower lows`,
      ],
    })
  }

  // --- Support/resistance proximity ---
  if (sr.nearestResistance && sr.distanceToResistancePercent != null) {
    const near = sr.distanceToResistancePercent <= 1.5
    add({
      category: 'support-resistance',
      name: near ? 'Near resistance' : 'Below resistance',
      direction: near ? 'bearish' : 'neutral',
      strength: near ? 70 : 35,
      confidence: 66,
      evidence: [
        `nearest resistance ${sr.nearestResistance.low.toFixed(2)}–${sr.nearestResistance.high.toFixed(2)}`,
        `${sr.distanceToResistancePercent}% away`,
      ],
      metadata: { zone: sr.nearestResistance },
    })
  }
  if (sr.nearestSupport && sr.distanceToSupportPercent != null) {
    const near = sr.distanceToSupportPercent <= 1.5
    add({
      category: 'support-resistance',
      name: near ? 'Near support' : 'Above support',
      direction: near ? 'bullish' : 'neutral',
      strength: near ? 70 : 35,
      confidence: 66,
      evidence: [
        `nearest support ${sr.nearestSupport.low.toFixed(2)}–${sr.nearestSupport.high.toFixed(2)}`,
        `${sr.distanceToSupportPercent}% away`,
      ],
      metadata: { zone: sr.nearestSupport },
    })
  }

  return signals
}
