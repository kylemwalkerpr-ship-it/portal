/**
 * TEMP NOTICE: full restore is in local workdir. This commit must be replaced.
 * See PR comment. Placeholder removed so the file is valid TypeScript again.
 */
export type DemandSourceId = 'gsc' | 'ga4' | 'ubersuggest' | 'ads' | 'marketplace'
export interface GscSignalInput {
  term: string
  clicks: number
  impressions: number
  position?: number
  ctr?: number
  source?: DemandSourceId
  revenue?: number
  purchases?: number
  volume?: number
  keywordDifficulty?: number
  snapshot?: boolean
  snapshotAgeDays?: number
  marketplaceSearchCount?: number | null
  marketplaceUniqueSessions?: number | null
  marketplaceConversionCount?: number | null
  conversionCoverage?: 'instrumented' | 'unknown'
}
