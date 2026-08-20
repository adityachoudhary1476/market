# Phase 2C — Confluence & Signal Intelligence Engine

Combines every machine-readable piece of technical evidence — Phase 2A.1
indicators and Phase 2B patterns — into one **transparent, deterministic
confluence model**. No LLM, no BUY/SELL, no price predictions, no probability
estimates. Every number traces back to a named weight in `weights.ts`.

## Pipeline

```
StructuredTechnicalContext
  ├── signals (Phase 2A.1) ──┐
  ├── patterns (Phase 2B) ───┴─▶ normalizeEvidence() ──▶ EvidenceItem[]
  └── optional: regime label, multi-timeframe contexts, historical hook
                                        │
                            saturate + group (weights.ts)
                                        │
                            scoreFromGroups() ──▶ ConfluenceScore
                                        │
                            detectConflicts() ──▶ EvidenceConflict[]
                                        │
                            buildTimeframeConfluence() (optional)
                                        │
                            buildThesis() ──▶ TechnicalThesis
                                        │
                        TechnicalConfluenceContext
```

## Files

| File | Purpose |
|------|---------|
| `types.ts` | `EvidenceItem`, `EvidenceGroupSummary`, `ConfluenceScore`, `EvidenceConflict`, `TimeframeConfluence`, `TechnicalThesis`, `TechnicalConfluenceContext` |
| `weights.ts` | The weight table. **The single source of truth for scoring.** |
| `evidence.ts` | Normalizes signals + patterns into uniform evidence items; freshness decay; pattern status factors; dedupes pattern signals vs `patterns.all` |
| `scoring.ts` | Group saturation, group summaries, bull/bear/balance, confidence, quality |
| `conflicts.ts` | Rule-based conflict detection + confidence penalty |
| `timeframe.ts` | Multi-timeframe alignment (confidence-weighted agreement) |
| `thesis.ts` | Conditions, invalidation conditions, key levels, drivers |
| `confluenceEngine.ts` | `buildConfluenceContext()` — the public entry point |

## Weight table (weights.ts)

| Source | Base weight | Group cap |
|--------|------------:|----------:|
| trend | 22 | 45 |
| momentum | 15 | 35 |
| volatility | 8 | 20 |
| volume | 14 | 30 |
| structure | 16 | 35 |
| support-resistance | 14 | 30 |
| candlestick | 12 | 25 |
| chart | 18 | 40 |
| divergence | 16 | 32 |
| breakout | 18 | 40 |
| regime (optional) | 6 | 12 |
| historical (optional) | 10 | 20 |

An item's final weight =

```
base weight × (confidence/100) × status factor × (freshness/100)
```

- **Status factor** (patterns only): confirmed/mature/complete = 1.0,
  forming = 0.6, failed/invalidated/unavailable = 0 (excluded from scoring,
  reported in `dataQuality.adjustedFor`).
- **Freshness**: half-life 4 days; 100 = current bar, 0 = 40+ days old.

## Saturation (no double counting)

Within a group, item *i* contributes `weight × 0.8^(i-1)` and the group total
is capped (`GROUP_CAPS`). Five near-identical MA signals can never out-score
one confirmed chart pattern.

## Score

- `bullish` / `bearish` — capped 0-100 sums of saturated group weights.
- `balance` — `bullish − bearish`, clamped to −100..100.
- `bias` — `> +18` bullish, `< −18` bearish, else balanced;
  no evidence → insufficient-data.
- `confidence` — reliability-weighted mean of scored items × coverage
  factor, minus conflict penalties (major 10, minor 4).
- `quality` — high ≥ 70, medium ≥ 50, else low.

## Conflicts (explicit, never averaged away)

Opposing pairs: trend↔momentum, trend↔chart, trend↔candlestick,
trend↔divergence, chart↔momentum, chart↔candlestick, structure↔chart,
breakout↔support-resistance, divergence↔momentum. Both sides must be
directional; net ≥ 12 on both sides = **major**, otherwise **minor**.
Timeframe opposition and extreme oscillators (RSI ≥ 70 / ≤ 30 against
momentum) are added by the engine when the data supports them.

## Multi-timeframe

`buildConfluenceContext({ technical, multiTimeframe: { daily, weekly } })`
aligns the primary timeframe against supporting ones. Alignment is a
confidence-weighted average of balances (`netAgreement`, −100..100), not a
majority vote. `aligned` / `partially-aligned` / `opposed`.

## Thesis

`TechnicalThesis` is structured and checkable:

- `conditions` — things that ARE true (trend direction, price vs EMA20,
  RSI, nearest resistance).
- `invalidationConditions` — close below nearest support / pattern
  invalidation levels. One-liner summary + key levels for UIs.
- `summary` — e.g.
  `BULLISH — balance +89.5, confidence 65; driven by trend, breakout; key risk: close below 99.8.`

## Honesty rules

- **No fabricated data**: adjustments for close-only feeds, missing volume,
  short history and excluded non-active patterns are always listed in
  `dataQuality.adjustedFor`.
- **Optional inputs**: `regime` and `historicalValidation` are used ONLY when
  the caller provides them; neither is ever guessed. The historical hook is a
  plain function/object — wire a real backtest later, no API change.
- **Deterministic**: same input → identical balance, bias and group nets
  (test-covered).
- **No BUY/SELL, no predictions** — this is evidence aggregation, not advice.

## Usage

```ts
import { buildTechnicalContext, buildConfluenceContext } from '@/analyst/technical'

const technical = buildTechnicalContext('NIFTY 50', candles, { timeframe: 'daily' })
// buildTechnicalContext() already attaches technical.confluence.
// Standalone (e.g. with extra context):
const confluence = buildConfluenceContext({
  technical,
  regime: 'risk-on', // optional, from the application layer
  multiTimeframe: { daily, weekly }, // optional
  historicalValidation: backtestResult, // optional
})
```

## Limitations

- Pattern evidence reflects detector reliability, not predictive accuracy.
- Freshness decay uses calendar time; intraday feeds decay faster than the
  model assumes (constant half-life across timeframes).
- `volatility` evidence is largely neutral by design — it modulates
  confidence contextually, not direction.
- Historical validation is only as good as the caller's hook — the engine
  records it, it does not vet it.