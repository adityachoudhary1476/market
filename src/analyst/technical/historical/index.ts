// ---------------------------------------------------------------------------
// Phase 2D — Historical Validation & Empirical Pattern Intelligence Engine
//
// Public surface of the historical module. All consumers should import from
// here; internal modules remain reachable for focused tests.
// ---------------------------------------------------------------------------

export { HISTORICAL_METHODOLOGY_VERSION, DEFAULT_HISTORICAL_CONFIG } from './config'
export type { HistoricalConfig } from './config'
export type {
  HistoricalDataProvider,
  HistoricalCapabilities,
  HistoricalSeries,
  HistoricalSetup,
  HistoricalValidationContext,
  HistoricalValidationResult,
  HorizonStatistics,
  StatisticsSummary,
  BreakoutStatistics,
  EventCluster,
  SimilarityResult,
  SimilarityFactor,
  BreakoutOutcome,
  SetupOutcome,
  HistoricalEvidenceForConfluence,
  HistoricalEvidenceQuality,
} from './types'
export { regimeFromContext, regimeFromRules } from './regimes'
export { extractSetups, resetSetupIdCounter } from './setups'
export { scanHistory } from './scanner'
export {
  SIMILARITY_FACTOR_WEIGHTS,
  similarityBetween,
  findSimilar,
  setupFromDescriptor,
} from './similarity'
export { computeSetupOutcome } from './outcomes'
export { summarize, median, mean, percentile, standardDeviation, qualityFromSample } from './statistics'
export { clusterEvents, clusterKey } from './dedup'
export {
  validateHistory,
  historicalEvidenceFor,
  validateWithProvider,
  seriesFromCandles,
} from './validationEngine'
export type { ValidationOptions } from './validationEngine'
export { localHistoricalDataProvider } from './dataProvider'