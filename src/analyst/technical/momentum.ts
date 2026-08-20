import type { Candle, IndicatorContext, MomentumContext } from './types'

// Aggregates momentum indicators into a compact directional bias. This is
// evidence (the count of bullish vs bearish oscillators), not a recommendation.
export function calculateMomentum(
  _candles: Candle[],
  indicators: IndicatorContext,
): MomentumContext {
  let score = 0
  let n = 0
  const consider = (v: number | null, bullAbove: number) => {
    if (v == null) return
    n++
    score += v > bullAbove ? 1 : v < 100 - bullAbove ? -1 : 0
  }
  consider(indicators.rsi.value, 55)
  if (indicators.macd.histogram != null) {
    n++
    score += indicators.macd.histogram > 0 ? 1 : indicators.macd.histogram < 0 ? -1 : 0
  }
  consider(indicators.stochastic.k, 55)
  consider(indicators.mfi.value, 55)
  consider(indicators.roc.value, 0)
  consider(indicators.cci.value, 100)
  consider(indicators.williamsR.value, -20)

  let bias: MomentumContext['bias'] = 'insufficient-data'
  if (n > 0) {
    if (score >= 2) bias = 'bullish'
    else if (score <= -2) bias = 'bearish'
    else bias = 'neutral'
  }

  return {
    rsi: indicators.rsi.value,
    macdHistogram: indicators.macd.histogram,
    stochasticK: indicators.stochastic.k,
    mfi: indicators.mfi.value,
    roc: indicators.roc.value,
    cci: indicators.cci.value,
    williamsR: indicators.williamsR.value,
    bias,
  }
}
