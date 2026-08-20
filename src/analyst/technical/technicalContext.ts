import type {
  Candle,
  StructuredTechnicalContext,
  IndicatorContext,
  TimeframeLabel,
  TimeframeTechnical,
  TechnicalPrice,
  DataQuality,
} from './types'
import { validateCandles, assessQuality } from './validation'
import { calculateIndicators } from './indicators'
import { calculateTrend } from './trend'
import { calculateMomentum } from './momentum'
import { calculateMarketStructure } from './marketStructure'
import { calculateSupportResistance } from './supportResistance'
import { calculateVolume } from './volume'
import { calculateVolatility } from './volatility'
import { generateSignals } from './signals'
import { buildPatternDetectionContext } from './patterns/patternContext'
import { buildConfluenceContext } from './confluence/confluenceEngine'

export interface BuildTechnicalOptions {
  timeframe?: TimeframeLabel
  isIntraday?: boolean
}

function buildPrice(candles: Candle[], dq: DataQuality): TechnicalPrice {
  const last = candles[candles.length - 1]
  const prev = candles.length > 1 ? candles[candles.length - 2] : null
  const change = prev ? last.close - prev.close : null
  const changePercent = prev && prev.close !== 0 ? (change! / prev.close) * 100 : null
  const high = dq.hasHighLow ? Math.max(...candles.map((c) => c.high)) : null
  const low = dq.hasHighLow ? Math.min(...candles.map((c) => c.low)) : null
  return {
    current: last.close,
    change: change != null ? Number(change.toFixed(2)) : null,
    changePercent: changePercent != null ? Number(changePercent.toFixed(2)) : null,
    open: last.open,
    high,
    low,
    previousClose: prev?.close ?? null,
  }
}

function emptyIndicators(): IndicatorContext {
  return {
    movingAverages: {
      sma: {}, ema: {}, priceAbove: {}, shortAboveLong: {}, alignment: {},
      bullishAlignment: false, bearishAlignment: false,
    },
    rsi: { period: 14, value: null, previousValue: null, direction: 'insufficient-data', zone: 'insufficient-data' },
    macd: { fast: 12, slow: 26, signalPeriod: 9, macd: null, signal: null, histogram: null, histogramDirection: 'insufficient-data', crossover: 'none' },
    bollinger: { period: 20, standardDeviation: 2, upper: null, middle: null, lower: null, bandwidth: null, percentB: null, pricePosition: 'insufficient-data', squeeze: false, expansion: 'insufficient-data' },
    atr: { period: 14, value: null, percentOfPrice: null, direction: 'insufficient-data', volatilityState: 'insufficient-data' },
    adx: { period: 14, adx: null, plusDI: null, minusDI: null, trendStrength: 'insufficient-data', direction: 'insufficient-data' },
    stochastic: { kPeriod: 14, dPeriod: 3, k: null, d: null, crossover: 'insufficient-data', zone: 'insufficient-data', direction: 'insufficient-data' },
    vwap: { available: false, reason: 'Intraday data required' },
    obv: { value: null, direction: 'insufficient-data', slope: null, available: false, reason: 'Volume data required' },
    mfi: { period: 14, value: null, zone: 'insufficient-data', direction: 'insufficient-data' },
    cci: { period: 20, value: null, zone: 'insufficient-data', direction: 'insufficient-data' },
    williamsR: { period: 14, value: null, zone: 'insufficient-data', direction: 'insufficient-data' },
    roc: { period: 12, value: null, direction: 'insufficient-data', acceleration: 'insufficient-data' },
    ichimoku: {
      tenkan: null, kijun: null, senkouA: null, senkouB: null, chikou: null,
      priceAboveCloud: false, priceBelowCloud: false, insideCloud: false,
      cloudDirection: 'insufficient-data', cloudThickness: null, tenkanAboveKijun: null, state: 'insufficient-data',
    },
  }
}

function unavailable(instrument: string, timeframe: TimeframeLabel, reason: string): StructuredTechnicalContext {
  return {
    available: false,
    instrument,
    timeframe,
    generatedAt: new Date().toISOString(),
    price: { current: 0, change: null, changePercent: null, open: null, high: null, low: null, previousClose: null },
    dataQuality: { candleCount: 0, sufficientHistory: false, warnings: [reason], hasHighLow: false, hasVolume: false },
    trend: {
      shortTerm: { direction: 'insufficient-data', strength: 0, evidence: [reason] },
      mediumTerm: { direction: 'insufficient-data', strength: 0, evidence: [] },
      longTerm: { direction: 'insufficient-data', strength: 0, evidence: [] },
      overall: { direction: 'insufficient-data', strength: 0, evidence: [] },
    },
    indicators: emptyIndicators(),
    momentum: { rsi: null, macdHistogram: null, stochasticK: null, mfi: null, roc: null, cci: null, williamsR: null, bias: 'insufficient-data' },
    volatility: { atr: null, atrPercent: null, bollingerBandwidth: null, recentRangePercent: null, state: 'insufficient-data', change: 'insufficient-data' },
    volume: { currentVolume: null, averageVolume: null, relativeVolume: null, relativeTo5: null, relativeTo20: null, relativeTo50: null, state: 'insufficient-data', priceVolume: 'insufficient-data', available: false, reason },
    structure: { recentSwingHighs: [], recentSwingLows: [], higherHighs: 0, higherLows: 0, lowerHighs: 0, lowerLows: 0, state: 'insufficient-data', lastHigh: null, lastLow: null },
    supportResistance: { levels: [], nearestSupport: null, nearestResistance: null, distanceToResistancePercent: null, distanceToSupportPercent: null },
    signals: [],
  }
}

/**
 * Convert raw OHLCV candles into a compact, structured technical context.
 * This is machine-readable evidence for the future AI — raw candles are NOT
 * included so the context stays compact.
 */
export function buildTechnicalContext(
  instrument: string,
  candles: Candle[],
  options: BuildTechnicalOptions = {},
): StructuredTechnicalContext {
  const timeframe = options.timeframe ?? 'daily'
  const v = validateCandles(candles)

  if (!v.valid) {
    return unavailable(instrument, timeframe, v.reason ?? 'Invalid candle data')
  }

  const dq = assessQuality(candles, v)
  const indicators = calculateIndicators(candles, options.isIntraday ?? timeframe === 'intraday')
  const structure = calculateMarketStructure(candles)
  const sr = calculateSupportResistance(candles)
  const volume = calculateVolume(candles)
  const volatility = calculateVolatility(candles)
  const trend = calculateTrend(candles, indicators, structure)
  const momentum = calculateMomentum(candles, indicators)
  const price = buildPrice(candles, dq)
  const baseSignals = generateSignals({ candles, indicators, trend, structure, volume, volatility, sr })
  const patterns = buildPatternDetectionContext(instrument, timeframe, candles, {
    available: true,
    instrument,
    timeframe,
    generatedAt: new Date().toISOString(),
    price,
    dataQuality: dq,
    trend,
    indicators,
    momentum,
    volatility,
    volume,
    structure,
    supportResistance: sr,
    signals: baseSignals,
  })

  const ctx: StructuredTechnicalContext = {
    available: true,
    instrument,
    timeframe,
    generatedAt: new Date().toISOString(),
    price,
    dataQuality: dq,
    trend,
    indicators,
    momentum,
    volatility,
    volume,
    structure,
    supportResistance: sr,
    // Pattern signals are merged into the same signal list so confluence
    // sees them alongside indicator evidence.
    signals: [...baseSignals, ...patterns.signals],
    patterns,
  }

  // Phase 2C: combine every piece of evidence into the confluence model.
  ctx.confluence = buildConfluenceContext({ technical: ctx })

  return ctx
}

/** Build contexts for multiple timeframes; missing ones are marked unavailable. */
export function buildMultiTimeframe(
  instrument: string,
  series: Partial<Record<TimeframeLabel, Candle[]>>,
): Record<TimeframeLabel, TimeframeTechnical> {
  const labels: TimeframeLabel[] = ['intraday', 'daily', 'weekly']
  const result = {} as Record<TimeframeLabel, TimeframeTechnical>
  for (const tf of labels) {
    const candles = series[tf]
    if (!candles || candles.length === 0) {
      result[tf] = { timeframe: tf, available: false, reason: `No ${tf} data available`, bars: 0 }
      continue
    }
    const v = validateCandles(candles)
    result[tf] = {
      timeframe: tf,
      available: v.valid,
      reason: v.valid ? undefined : v.reason,
      bars: candles.length,
      context: v.valid ? buildTechnicalContext(instrument, candles, { timeframe: tf }) : undefined,
    }
  }
  return result
}
