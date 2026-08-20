# Technical Intelligence Engine

A modular, framework-independent layer that converts raw OHLCV market data into
**structured technical evidence** for the AI Analyst. No prose, no buy/sell
recommendations — just machine-readable facts and inferences a future LLM or
confluence model can reason over.

```
raw OHLCV ──▶ buildTechnicalContext() ──▶ StructuredTechnicalContext
                                                      │
                                              buildAnalystContext()
                                                      │
                                                      ▼
                                                AnalystEngine
```

## Module layout

```
src/analyst/technical/
  types.ts              # All public interfaces (Candle, contexts, signals)
  numeric.ts            # SMA/EMA/Wilder smoothing, slope, stddev
  validation.ts         # OHLCV integrity + data-capability detection
  adapters.ts           # App data (ChartPoint, OHLC tuples) → Candle[]
  indicators/           # 14 indicators (one file each)
  marketStructure.ts    # Swing highs/lows + HH/HL/LH/LL
  supportResistance.ts  # Clustered swing levels into zones
  volume.ts             # Relative volume + price/volume relationship
  volatility.ts         # ATR + BB bandwidth regime
  momentum.ts           # Oscillator aggregate bias
  trend.ts              # Short/medium/long-term trend with evidence
  signals.ts            # Standardized evidence signals (NO buy/sell)
  technicalContext.ts   # buildTechnicalContext() + multi-timeframe
  index.ts              # Public barrel
  __tests__/            # 47 unit tests
```

## Using it

```ts
import { buildTechnicalContext, candlesFromChartPoints } from '@/analyst/technical'
import { getIndexSeries } from '@/data/marketSeries'

const series = getIndexSeries('nifty-50', '1Y')
const candles = candlesFromChartPoints(series.points)
const ctx = buildTechnicalContext('NIFTY 50', candles, { timeframe: 'daily' })

if (ctx.available) {
  console.log(ctx.trend.overall.direction, ctx.signals)
}
```

## Data honesty (critical)

The engine never fabricates values. When the source is a close-only feed
(like the app's index `ChartPoint[]` series):

- Close-based indicators **work**: SMA/EMA, RSI, MACD, Bollinger, ROC, CCI
- High/low indicators return **`null`**: ATR, ADX, Stochastic, Ichimoku, swings, S/R
- Volume indicators return `available: false` when volume is absent

This is reported in `dataQuality.warnings` and via each indicator's null/available
fields. The capability detection is in `validation.ts → getCapabilities()`.

## Adding a new indicator

1. Create `indicators/yourIndicator.ts` exporting `calculateYourIndicator(candles, ...)`.
2. Add its result type to `IndicatorContext` in `types.ts`.
3. Wire it into `indicators/index.ts → calculateIndicators()`.
4. If it produces evidence, add a signal in `signals.ts`.
5. Add tests in `__tests__/`.

Each indicator must:
- return `null` for insufficient/missing data (never throw, never fake)
- be a pure function of candles
- not depend on React or UI state

## Adding a new detector (Phase 2B)

Pattern/divergence/breakout detectors should live in a new `detectors/` folder
and consume `MarketStructureContext`, `SupportResistanceContext`, and the
indicators. They should produce `TechnicalSignal` objects via `signals.ts`. Do
**not** add confluence scoring in Phase 2A — that is Phase 2C.

## Indicator formulas

All implementations use standard conventions:

- **SMA/EMA**: EMA seeded with SMA of first `period` values, `k = 2/(period+1)`
- **RSI**: Wilder smoothing, 14-period, 30/70 thresholds
- **MACD**: 12/26/9, EMA-based
- **Bollinger**: 20-period SMA, 2 population standard deviations
- **ATR/ADX/RSI**: Wilder smoothing; ATR needs H/L
- **Stochastic**: 14/3/3 slow stoch; needs H/L
- **Ichimoku**: 9/26/52; needs H/L
- **VWAP**: intraday session cumulative `(H+L+C)/3 * volume`
- **OBV/MFI**: volume-weighted; need volume
- **CCI/Williams %R**: typical-price based
- **ROC**: `((close - close[n]) / close[n]) * 100`

## Testing

```bash
npm test
```

47 tests cover every indicator, trend classification, swing detection, S/R
clustering, relative volume, validation edge cases (insufficient data, flat
prices, zero volume, single candle, close-only feeds), and the full context
builder. Run `npm run build` for the strict TypeScript + production build.

## Phase 2B handoff

The structured context (`ctx`) is intentionally compact — it contains calculated
indicators, recent swings, clustered S/R zones, current states, and signals but
**not raw candles**. A future LLM receives this compact object. Phase 2B should
add: `PatternEngine`, `DivergenceEngine`, `BreakoutEngine`, and `ConfluenceEngine`
on top of the existing evidence without changing this foundation.
