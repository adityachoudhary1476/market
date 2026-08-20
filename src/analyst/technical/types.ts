// ---------------------------------------------------------------------------
// Technical Intelligence Engine — core types
//
// Framework-independent: pure data in, structured evidence out. No React, no
// prose, no buy/sell recommendations. Every indicator that cannot be computed
// from the available data returns `null` with a warning rather than a fake
// value.
// ---------------------------------------------------------------------------

/** Standard OHLCV candle. High/low/volume may be absent in close-only feeds. */
export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

/** Describes which fields a dataset actually provides. */
export interface DataCapabilities {
  hasHighLow: boolean
  hasVolume: boolean
}

export type Direction = 'bullish' | 'bearish' | 'neutral'
export type TrendState = 'bullish' | 'bearish' | 'neutral' | 'transitioning' | 'insufficient-data'
export type TrendDirection = 'rising' | 'falling' | 'flat' | 'insufficient-data'

// --- Indicator results -----------------------------------------------------

export interface MAResult {
  period: number
  value: number | null
  distanceFromPrice: number | null
  distancePercent: number | null
  slope: number | null
}

export interface MovingAverages {
  sma: Record<number, MAResult>
  ema: Record<number, MAResult>
  /** keyed by `sma20` / `ema50` etc. */
  priceAbove: Record<string, boolean | null>
  shortAboveLong: Record<string, Direction | 'insufficient-data'>
  /** alias for shortAboveLong — used by the trend engine */
  alignment: Record<string, Direction | 'insufficient-data'>
  bullishAlignment: boolean
  bearishAlignment: boolean
}

export type RSIZone = 'oversold' | 'neutral' | 'overbought'
export interface RSIResult {
  period: number
  value: number | null
  previousValue: number | null
  direction: TrendDirection
  zone: RSIZone | 'insufficient-data'
}

export interface MACDResult {
  fast: number
  slow: number
  signalPeriod: number
  macd: number | null
  signal: number | null
  histogram: number | null
  histogramDirection: TrendDirection
  crossover: 'bullish' | 'bearish' | 'none'
}

export type PricePosition = 'above-upper' | 'near-upper' | 'inside' | 'near-lower' | 'below-lower' | 'insufficient-data'
export interface BollingerResult {
  period: number
  standardDeviation: number
  upper: number | null
  middle: number | null
  lower: number | null
  bandwidth: number | null
  percentB: number | null
  pricePosition: PricePosition
  squeeze: boolean
  expansion: 'expanding' | 'contracting' | 'flat' | 'insufficient-data'
}

export type VolatilityState = 'low' | 'normal' | 'elevated' | 'high'
export interface ATRResult {
  period: number
  value: number | null
  percentOfPrice: number | null
  direction: TrendDirection
  volatilityState: VolatilityState | 'insufficient-data'
}

export type TrendStrength = 'weak' | 'emerging' | 'established' | 'strong' | 'insufficient-data'
export interface ADXResult {
  period: number
  adx: number | null
  plusDI: number | null
  minusDI: number | null
  trendStrength: TrendStrength
  direction: Direction | 'insufficient-data'
}

export interface StochasticResult {
  kPeriod: number
  dPeriod: number
  k: number | null
  d: number | null
  crossover: 'bullish' | 'bearish' | 'none' | 'insufficient-data'
  zone: 'overbought' | 'oversold' | 'neutral' | 'insufficient-data'
  direction: TrendDirection
}

export interface VWAPResult {
  available: boolean
  reason?: string
  vwap?: number | null
  priceVsVWAP?: 'above' | 'below' | 'at'
  distancePercent?: number | null
}

export interface OBVResult {
  value: number | null
  direction: TrendDirection
  slope: number | null
  available: boolean
  reason?: string
}

export interface MFIResult {
  period: number
  value: number | null
  zone: 'overbought' | 'oversold' | 'neutral' | 'insufficient-data'
  direction: TrendDirection
}

export interface CCIResult {
  period: number
  value: number | null
  zone: 'extreme-high' | 'extreme-low' | 'neutral' | 'insufficient-data'
  direction: TrendDirection
}

export interface WilliamsRResult {
  period: number
  value: number | null
  zone: 'overbought' | 'oversold' | 'neutral' | 'insufficient-data'
  direction: TrendDirection
}

export interface ROCResult {
  period: number
  value: number | null
  direction: TrendDirection
  acceleration: 'accelerating' | 'decelerating' | 'flat' | 'insufficient-data'
}

export interface IchimokuResult {
  tenkan: number | null
  kijun: number | null
  senkouA: number | null
  senkouB: number | null
  chikou: number | null
  priceAboveCloud: boolean
  priceBelowCloud: boolean
  insideCloud: boolean
  cloudDirection: Direction | 'insufficient-data'
  cloudThickness: number | null
  tenkanAboveKijun: boolean | null
  state: TrendState
}

export interface IndicatorContext {
  movingAverages: MovingAverages
  rsi: RSIResult
  macd: MACDResult
  bollinger: BollingerResult
  atr: ATRResult
  adx: ADXResult
  stochastic: StochasticResult
  vwap: VWAPResult
  obv: OBVResult
  mfi: MFIResult
  cci: CCIResult
  williamsR: WilliamsRResult
  roc: ROCResult
  ichimoku: IchimokuResult
}

// --- Higher-level contexts -------------------------------------------------

export interface TrendComponent {
  direction: TrendState
  strength: number // 0-100
  evidence: string[]
}

export interface TrendContext {
  shortTerm: TrendComponent
  mediumTerm: TrendComponent
  longTerm: TrendComponent
  overall: TrendComponent
}

export interface SwingPoint {
  timestamp: number
  price: number
  index: number
  strength: number
}

export interface MarketStructureContext {
  recentSwingHighs: SwingPoint[]
  recentSwingLows: SwingPoint[]
  higherHighs: number
  higherLows: number
  lowerHighs: number
  lowerLows: number
  state: 'bullish' | 'bearish' | 'range' | 'transitioning' | 'insufficient-data'
  lastHigh: SwingPoint | null
  lastLow: SwingPoint | null
}

export type LevelType = 'support' | 'resistance'
export interface PriceLevel {
  type: LevelType
  low: number
  high: number
  strength: number // 0-100
  touches: number
  recency: number // 0-100
  evidence: string[]
}

export interface SupportResistanceContext {
  levels: PriceLevel[]
  nearestSupport: PriceLevel | null
  nearestResistance: PriceLevel | null
  distanceToResistancePercent: number | null
  distanceToSupportPercent: number | null
}

export type VolumeState = 'veryLow' | 'low' | 'normal' | 'high' | 'veryHigh'
export interface VolumeContext {
  currentVolume: number | null
  averageVolume: number | null
  relativeVolume: number | null
  relativeTo5: number | null
  relativeTo20: number | null
  relativeTo50: number | null
  state: VolumeState | 'insufficient-data'
  priceVolume:
    | 'rising-price-rising-volume'
    | 'rising-price-falling-volume'
    | 'falling-price-rising-volume'
    | 'falling-price-falling-volume'
    | 'flat'
    | 'insufficient-data'
  available: boolean
  reason?: string
}

export interface VolatilityContext {
  atr: number | null
  atrPercent: number | null
  bollingerBandwidth: number | null
  recentRangePercent: number | null
  state: VolatilityState | 'insufficient-data'
  change: 'expanding' | 'contracting' | 'flat' | 'insufficient-data'
}

export interface MomentumContext {
  rsi: number | null
  macdHistogram: number | null
  stochasticK: number | null
  mfi: number | null
  roc: number | null
  cci: number | null
  williamsR: number | null
  bias: Direction | 'insufficient-data'
}

// --- Signals ---------------------------------------------------------------

export type SignalCategory =
  | 'trend'
  | 'momentum'
  | 'volatility'
  | 'volume'
  | 'structure'
  | 'support-resistance'

export interface TechnicalSignal {
  id: string
  category: SignalCategory
  name: string
  direction: Direction
  /** How strongly the evidence points (0-100), derived from the metric. */
  strength: number
  /** How reliable the underlying indicator is given data history (0-100). */
  confidence: number
  timestamp?: string
  evidence: string[]
  metadata?: Record<string, unknown>
}

// --- Top-level context -----------------------------------------------------

export interface DataQuality {
  candleCount: number
  sufficientHistory: boolean
  warnings: string[]
  hasHighLow: boolean
  hasVolume: boolean
}

export interface TechnicalPrice {
  current: number
  change: number | null
  changePercent: number | null
  open: number | null
  high: number | null
  low: number | null
  previousClose: number | null
}

export interface StructuredTechnicalContext {
  available: boolean
  instrument: string
  timeframe: string
  generatedAt: string
  price: TechnicalPrice
  dataQuality: DataQuality
  trend: TrendContext
  indicators: IndicatorContext
  momentum: MomentumContext
  volatility: VolatilityContext
  volume: VolumeContext
  structure: MarketStructureContext
  supportResistance: SupportResistanceContext
  signals: TechnicalSignal[]
  /** Phase 2B pattern-detection evidence. */
  patterns?: import('./patterns').PatternDetectionContext
  /** Phase 2C confluence model of all technical evidence. */
  confluence?: import('./confluence').TechnicalConfluenceContext
}

export type TimeframeLabel = 'intraday' | 'daily' | 'weekly'

export interface TimeframeTechnical {
  timeframe: TimeframeLabel
  available: boolean
  reason?: string
  bars: number
  context?: StructuredTechnicalContext
}
