# Phase 2B — Pattern Detection Engine

Machine-readable pattern detection layered on top of the Phase 2A.1
`StructuredTechnicalContext`. **Detection only** — no prose, no BUY/SELL, no
confluence score (that is Phase 2C), no LLM, no fabricated data.

## Architecture

```
raw OHLCV
   ↓ TechnicalIntelligenceEngine (Phase 2A.1)
StructuredTechnicalContext
   ↓ PatternEngine
   ├── detectors/candlestickDetector.ts
   ├── detectors/chartPatternDetector.ts
   ├── detectors/divergenceDetector.ts
   └── detectors/breakoutDetector.ts
   ↓ patternContext.ts (orchestrator)
PatternDetectionContext
   ↓ future ConfluenceEngine (Phase 2C)
```

## Files

| File | Purpose |
|------|---------|
| `types.ts` | `Pattern`, `PatternDetectionContext`, lifecycle, families; re-exports Phase 2A.1 base types |
| `helpers.ts` | `patternPriority` (deterministic ordering), lifecycle weights, candle geometry, `near()` tolerance |
| `patternContext.ts` | Orchestrates the four detectors into one context + `TechnicalSignal[]` mapping |
| `detectors/candlestickDetector.ts` | 22 single/two/three-candle patterns |
| `detectors/chartPatternDetector.ts` | Reversals, H&S, triangles, wedges, flags, pennants, channels, cup & handle |
| `detectors/divergenceDetector.ts` | Regular + hidden divergences on RSI/MACD/MFI/CCI/Williams %R |
| `detectors/breakoutDetector.ts` | Breakouts, breakdowns, failures, retests, MA/band/range/new-high events |

## Pattern lifecycle

`forming → confirmed → mature → complete`, with `failed` / `invalidated` /
`unavailable` as terminal states.

- **forming** — structure exists, confirmation criteria not met. Never called
  confirmed.
- **confirmed** — the pattern's own confirmation criteria are met (e.g. close
  through neckline, close through triangle boundary).
- **invalidated** — price broke the OPPOSITE side of the pattern (e.g. double
  top closes above its peaks, ascending triangle closes below support).
- **failed** — used by the breakout detector when a break is followed by a
  quick re-entry inside the previous range.
- **complete** — target/measured move reached (reserved; not yet asserted by a
  target-tracking stage).
- **unavailable** — insufficient data (e.g. cup & handle under 30 bars).

## Detectors

### Candlestick (`candlestickDetector.ts`)
- **Required data:** genuine OHLC (`high > low` on at least one bar). Close-only
  feeds return `[]` — wicks are never synthesized.
- **Logic:** inspects the most recent 1–3 bars; thresholds `dojiBody` (default
  0.07) and `wickRatio` (default 2). Single-candle patterns are `confirmed` on
  close (the pattern IS the completed candles).
- **Context evidence** (metadata only, never scored): preceding short-term
  trend, relative volume, nearest support/resistance from the Phase 2A.1
  context.
- **Invalidation:** candle low (bullish) / high (bearish) — a stop reference,
  not a recommendation.

### Chart patterns (`chartPatternDetector.ts`)
- **Required data:** OHLC (pivots from highs/lows) or close-only (pivots from
  close, confidence reduced, `metadata.pivotSource='close'`).
- **Pivots:** fractal highs/lows with `lookback` (default 3).
- **Reversals** (double/triple top-bottom, H&S): only the **most recent**
  structure is reported; guards:
  - minimum depth 2.5% of price,
  - second peak within `LIVE_WINDOW` (20) bars of the right edge,
  - double top: neckline trough must not undercut the prior swing low; the two
    peaks must be the two highest highs of the span,
  - double bottom: neckline peak must be a lower high than the prior swing high.
- **Triangles/wedges/channels/rectangle:** least-squares fit of the last
  `minBoundaryTouches` (3) pivot highs/lows; classified by slope signs.
  Confirmation = close beyond a boundary (0.2%); breaking the *opposite* side
  of a triangle/wedge invalidates it.
- **Flags/pennants:** require a strong prior leg (≥3%) followed by a compact
  (≤3%) countertrend/contracting consolidation — never reported from sideways
  movement.
- **Cup & handle:** ≥30 bars, rim match within 3%, depth ≥8%, symmetry
  ≥0.45, handle ≤ half the cup depth. Insufficient history → `status:
  'unavailable'`, never forced.

### Divergences (`divergenceDetector.ts`)
- **Required data:** OHLC + 30 bars. Compares consecutive price pivot lows/highs
  against oscillator pivots (RSI, MACD histogram, MFI, CCI, Williams %R —
  whichever are available). Reuses the indicator context already computed by
  Phase 2A.1 (no recomputation).
- Only the most recent low pair and high pair are examined per oscillator —
  never arbitrary adjacent candles.

### Breakouts (`breakoutDetector.ts`)
- Zones (support/resistance), EMA/SMA crosses, Bollinger bands, N-bar range,
  new highs/lows — each with penetration % and volume ratio when volume exists.
- **Failed breakout** (§18): a historical break followed by a close back inside
  the range within `failWindow` (5) bars → `status: 'failed'`, metadata
  `reentryLevel`, `failureDistance`, `barsSinceBreakout`.
- **Retest** (§19): a held return toward the broken level → `breakout-retest` /
  `breakdown-retest` with `originalBreakoutLevel`, `retestLow/High`,
  `retestDistance`, `retestHeld`.
- Not every breakout is successful — failures are reported as evidence, never
  hidden.

## Data capability rules

| Feed | Candlestick | Chart | Divergence | Breakout |
|------|-------------|-------|------------|----------|
| Close-only | unavailable (empty) | pivots from close | unavailable | closing-level breakouts |
| OHLC | available | available | available | available |
| OHLC + volume | available | available | available | volume-confirmed |

`buildPatternDetectionContext()` reports `available`, warnings and
`dataQuality.unavailableDetectors`; it never fabricates missing OHLC values.
Synthetic OHLC exists **only** in `__tests__/fixtures.ts`.

## patternPriority (Phase 2B §24 — NOT a confluence score)

Deterministic ranking used only to order `all`:

```
statusWeight × 45 + (confidence/100) × 40 + recency × 12 + volumeBonus × 3
```

## False-positive safeguards

- Minimum depth 2.5% for reversals; most-recent-only reporting;
  structural-integrity guards listed above.
- Random walks, almost-double-tops, insufficient separation, incomplete H&S,
  fake breakouts and flat markets are covered by tests and must NOT trigger
  patterns.
- Philosophy: **"no reliable pattern detected" beats 12 patterns per chart.**

## Known limitations

- Not predictive: these are pattern recognizers, not future-price predictors.
- Pivot `lookback` is global; very fast/large swings may miss structure.
- Flag/pennant detection is windowed (14 bars) and heuristic.
- Divergence uses the last two pivots only — earlier divergences are ignored.
- `complete` lifecycle state is reserved for a future target-tracking stage.