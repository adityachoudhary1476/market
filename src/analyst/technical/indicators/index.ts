import type { Candle, IndicatorContext } from '../types'
import { calculateMovingAverages } from './movingAverages'
import { calculateRSI } from './rsi'
import { calculateMACD } from './macd'
import { calculateBollinger } from './bollinger'
import { calculateATR } from './atr'
import { calculateADX } from './adx'
import { calculateStochastic } from './stochastic'
import { calculateVWAP } from './vwap'
import { calculateOBV } from './obv'
import { calculateMFI } from './mfi'
import { calculateCCI } from './cci'
import { calculateWilliamsR } from './williamsR'
import { calculateROC } from './roc'
import { calculateIchimoku } from './ichimoku'

export function calculateIndicators(candles: Candle[], isIntraday = false): IndicatorContext {
  return {
    movingAverages: calculateMovingAverages(candles),
    rsi: calculateRSI(candles),
    macd: calculateMACD(candles),
    bollinger: calculateBollinger(candles),
    atr: calculateATR(candles),
    adx: calculateADX(candles),
    stochastic: calculateStochastic(candles),
    vwap: calculateVWAP(candles, isIntraday),
    obv: calculateOBV(candles),
    mfi: calculateMFI(candles),
    cci: calculateCCI(candles),
    williamsR: calculateWilliamsR(candles),
    roc: calculateROC(candles),
    ichimoku: calculateIchimoku(candles),
  }
}
